import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as path from "path"
import { v4 as uuidv4 } from "uuid"
import { writeFilePostHook } from "../../../src/hooks/postHooks/writeFile"
import { readTraceLog, clearTraceLog } from "../../../src/hooks/utils/traceStorage"
import { getIntentFiles } from "../../../src/hooks/utils/intentMap"
import { setupTestWorkspace, cleanupTestWorkspace } from "../../phase2/fixtures"
import { computeContentHash } from "../../../src/hooks/utils/hashing"

// Mock git to return consistent values
vi.mock("../../../src/hooks/utils/git", () => ({
	getCurrentRevision: vi.fn().mockResolvedValue("mock-git-sha-123456789"),
}))

describe("Phase 3 Integration: Traceability", () => {
	let workspaceRoot: string
	const testIntentId = "INT-001"
	const testIntentName = "Test Intent"
	const sessionId = `session-${uuidv4()}`

	beforeEach(async () => {
		workspaceRoot = await setupTestWorkspace()
		await clearTraceLog(workspaceRoot)
	})

	afterEach(async () => {
		await cleanupTestWorkspace()
		vi.clearAllMocks()
	})

	it("should create trace entry for file write", async () => {
		const filePath = "src/test/file.ts"
		const content = 'console.log("hello world");'

		await writeFilePostHook(
			{
				path: filePath,
				content,
			},
			{}, // result (unused)
			{
				intentId: testIntentId,
				workspaceRoot,
				sessionId,
				modelIdentifier: "claude-3.5-sonnet",
			},
		)

		// Read trace log
		const traces = await readTraceLog(workspaceRoot)

		expect(traces).toHaveLength(1)

		const trace = traces[0]
		expect(trace.id).toBeDefined()
		expect(trace.timestamp).toBeDefined()
		expect(trace.vcs.revision_id).toBe("mock-git-sha-123456789")
		expect(trace.files).toHaveLength(1)

		const file = trace.files[0]
		expect(file.relative_path).toBe(filePath)
		expect(file.conversations).toHaveLength(1)

		const conv = file.conversations[0]
		expect(conv.url).toBe(sessionId)
		expect(conv.contributor.entity_type).toBe("AI")
		expect(conv.contributor.model_identifier).toBe("claude-3.5-sonnet")
		expect(conv.related).toHaveLength(1)
		expect(conv.related[0].type).toBe("specification")
		expect(conv.related[0].value).toBe(testIntentId)

		const range = conv.ranges[0]
		expect(range.start_line).toBe(1)
		expect(range.end_line).toBe(content.split("\n").length)
		const expectedHash = "sha256:" + computeContentHash(content, 1, content.split("\n").length)
		expect(range.content_hash).toBe(expectedHash)
	})

	it("should handle multiple writes to same file", async () => {
		const filePath = "src/test/file.ts"

		// First write
		await writeFilePostHook(
			{ path: filePath, content: "version 1" },
			{},
			{ intentId: testIntentId, workspaceRoot, sessionId },
		)

		// Second write
		await writeFilePostHook(
			{ path: filePath, content: "version 2" },
			{},
			{ intentId: testIntentId, workspaceRoot, sessionId },
		)

		const traces = await readTraceLog(workspaceRoot)
		expect(traces).toHaveLength(2)

		// Both should have different content hashes
		const hash1 = traces[0].files[0].conversations[0].ranges[0].content_hash
		const hash2 = traces[1].files[0].conversations[0].ranges[0].content_hash
		expect(hash1).not.toBe(hash2)
	})

	it("should handle multiple files for same intent", async () => {
		const files = ["src/test/file1.ts", "src/test/file2.ts", "src/test/file3.ts"]

		for (const file of files) {
			await writeFilePostHook(
				{ path: file, content: "test" },
				{},
				{ intentId: testIntentId, workspaceRoot, sessionId },
			)
		}

		const traces = await readTraceLog(workspaceRoot)
		expect(traces).toHaveLength(3)

		// Check intent map
		const intentFiles = await getIntentFiles(workspaceRoot, testIntentId)
		expect(intentFiles).toHaveLength(3)
		expect(intentFiles.sort()).toEqual(files.sort())
	})

	it("should record mutation class when provided", async () => {
		await writeFilePostHook(
			{
				path: "src/test/file.ts",
				content: "test",
				mutation_class: "INTENT_EVOLUTION",
			},
			{},
			{ intentId: testIntentId, workspaceRoot, sessionId },
		)

		const traces = await readTraceLog(workspaceRoot)
		expect(traces[0].mutation_class).toBe("INTENT_EVOLUTION")
	})

	it("should infer mutation class from old content", async () => {
		const oldContent = "const x = 1;"
		const newContent = "const x = 2; // updated"

		await writeFilePostHook(
			{
				path: "src/test/file.ts",
				content: newContent,
			},
			{},
			{
				intentId: testIntentId,
				workspaceRoot,
				sessionId,
				oldContent,
			},
		)

		const traces = await readTraceLog(workspaceRoot)
		// Should be AST_REFACTOR (changed value but same structure)
		expect(traces[0].mutation_class).toBe("AST_REFACTOR")
	})

	it("should handle errors gracefully (not throw)", async () => {
		// Force an error by passing invalid workspaceRoot
		await expect(
			writeFilePostHook(
				{ path: "test.ts", content: "test" },
				{},
				{ intentId: testIntentId, workspaceRoot: "/invalid/path", sessionId },
			),
		).resolves.not.toThrow()

		// Should still complete without throwing
	})
})
