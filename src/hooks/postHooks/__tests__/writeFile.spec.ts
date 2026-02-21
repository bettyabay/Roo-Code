import { describe, it, expect, vi, beforeEach } from "vitest"
import { writeFilePostHook } from "../writeFile"

vi.mock("uuid", () => ({
	v4: vi.fn(() => "mock-uuid-v4"),
}))

vi.mock("../../utils/hashing", () => ({
	computeContentHash: vi.fn(() => "abc123def456"),
}))

vi.mock("../../utils/git", () => ({
	getCurrentRevision: vi.fn(() => Promise.resolve("rev-abc")),
}))

vi.mock("../../utils/traceStorage", () => ({
	appendToTraceLog: vi.fn(() => Promise.resolve()),
}))

vi.mock("../../utils/intentMap", () => ({
	updateIntentMap: vi.fn(() => Promise.resolve()),
}))

vi.mock("../../utils/mutationClassifier", () => ({
	getMutationClass: vi.fn((_explicit: string | undefined, _old: string, _new: string) => "INTENT_EVOLUTION"),
}))

const { computeContentHash } = await import("../../utils/hashing")
const { getCurrentRevision } = await import("../../utils/git")
const { appendToTraceLog } = await import("../../utils/traceStorage")
const { updateIntentMap } = await import("../../utils/intentMap")

const mockComputeContentHash = vi.mocked(computeContentHash)
const mockGetCurrentRevision = vi.mocked(getCurrentRevision)
const mockAppendToTraceLog = vi.mocked(appendToTraceLog)
const mockUpdateIntentMap = vi.mocked(updateIntentMap)

describe("writeFilePostHook", () => {
	const workspaceRoot = "/workspace"
	const intentId = "INT-001"

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("does nothing when intentId is null", async () => {
		await writeFilePostHook(
			{ path: "src/foo.ts", content: "x" },
			{ success: true },
			{ intentId: null, workspaceRoot },
		)
		expect(mockGetCurrentRevision).not.toHaveBeenCalled()
		expect(mockAppendToTraceLog).not.toHaveBeenCalled()
		expect(mockUpdateIntentMap).not.toHaveBeenCalled()
	})

	it("does nothing when intentId is undefined (falsy)", async () => {
		await writeFilePostHook(
			{ path: "src/foo.ts", content: "x" },
			{ success: true },
			{ intentId: null, workspaceRoot },
		)
		expect(mockAppendToTraceLog).not.toHaveBeenCalled()
		expect(mockUpdateIntentMap).not.toHaveBeenCalled()
	})

	it("gets git revision and appends trace entry and updates intent map", async () => {
		await writeFilePostHook(
			{ path: "src/foo.ts", content: "line1\nline2\nline3" },
			{ success: true },
			{ intentId, workspaceRoot },
		)

		expect(mockGetCurrentRevision).toHaveBeenCalledWith(workspaceRoot)
		expect(mockComputeContentHash).toHaveBeenCalledWith("line1\nline2\nline3", 1, 3)

		expect(mockAppendToTraceLog).toHaveBeenCalledTimes(1)
		const [root, entry] = mockAppendToTraceLog.mock.calls[0]
		expect(root).toBe(workspaceRoot)
		expect(entry.id).toBe("mock-uuid-v4")
		expect(entry.vcs.revision_id).toBe("rev-abc")
		expect(entry.files).toHaveLength(1)
		expect(entry.files[0].relative_path).toBe("src/foo.ts")
		expect(entry.files[0].conversations[0].related).toEqual([{ type: "specification", value: intentId }])
		expect(entry.files[0].conversations[0].ranges[0].content_hash).toBe("sha256:abc123def456")
		expect(entry.mutation_class).toBe("AST_REFACTOR")

		expect(mockUpdateIntentMap).toHaveBeenCalledWith(workspaceRoot, intentId, "src/foo.ts")
	})

	it("uses explicit mutation_class when valid", async () => {
		await writeFilePostHook(
			{
				path: "src/bar.ts",
				content: "x",
				mutation_class: "BUG_FIX",
			},
			{ success: true },
			{ intentId, workspaceRoot },
		)

		const entry = mockAppendToTraceLog.mock.calls[0][1]
		expect(entry.mutation_class).toBe("BUG_FIX")
	})

	it("uses sessionId and modelIdentifier in trace entry", async () => {
		await writeFilePostHook(
			{ path: "src/a.ts", content: "c" },
			{ success: true },
			{
				intentId,
				workspaceRoot,
				sessionId: "session-123",
				modelIdentifier: "model-x",
			},
		)

		const entry = mockAppendToTraceLog.mock.calls[0][1]
		expect(entry.files[0].conversations[0].url).toBe("session-123")
		expect(entry.files[0].conversations[0].contributor.model_identifier).toBe("model-x")
	})

	it("handles single-line content (end_line >= 1)", async () => {
		await writeFilePostHook(
			{ path: "src/single.ts", content: "only" },
			{ success: true },
			{ intentId, workspaceRoot },
		)

		expect(mockComputeContentHash).toHaveBeenCalledWith("only", 1, 1)
		const entry = mockAppendToTraceLog.mock.calls[0][1]
		expect(entry.files[0].conversations[0].ranges[0].end_line).toBe(1)
	})

	it("logs error and does not throw when appendToTraceLog fails", async () => {
		mockAppendToTraceLog.mockRejectedValueOnce(new Error("disk full"))
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		await expect(
			writeFilePostHook({ path: "src/foo.ts", content: "x" }, { success: true }, { intentId, workspaceRoot }),
		).resolves.toBeUndefined()

		expect(consoleSpy).toHaveBeenCalled()
		consoleSpy.mockRestore()
	})

	it("uses workspaceRoot default when undefined", async () => {
		await writeFilePostHook({ path: "p.ts", content: "x" }, { success: true }, { intentId })

		expect(mockGetCurrentRevision).toHaveBeenCalledWith("")
		expect(mockAppendToTraceLog).toHaveBeenCalledWith("", expect.any(Object))
		expect(mockUpdateIntentMap).toHaveBeenCalledWith("", intentId, "p.ts")
	})
})
