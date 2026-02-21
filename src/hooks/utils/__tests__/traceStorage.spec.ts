import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { appendToTraceLog, readTraceLog, clearTraceLog } from "../traceStorage"
import type { TraceEntry } from "../../models/trace"

function makeValidEntry(overrides?: Partial<TraceEntry>): TraceEntry {
	return {
		id: overrides?.id ?? "550e8400-e29b-41d4-a716-446655440000",
		timestamp: overrides?.timestamp ?? "2026-02-21T12:00:00.000Z",
		vcs: overrides?.vcs ?? { revision_id: "abc123" },
		files: overrides?.files ?? [
			{
				relative_path: "src/example.ts",
				conversations: [
					{
						url: "session-1",
						contributor: { entity_type: "AI", model_identifier: "test-model" },
						ranges: [{ start_line: 1, end_line: 10, content_hash: "sha256:deadbeef" }],
						related: [{ type: "specification", value: "INT-001" }],
					},
				],
			},
		],
		mutation_class: overrides?.mutation_class ?? "INTENT_EVOLUTION",
	}
}

describe("traceStorage", () => {
	let workspaceRoot: string

	beforeEach(async () => {
		workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "trace-storage-"))
	})

	afterEach(async () => {
		try {
			await clearTraceLog(workspaceRoot)
			await fs.rm(workspaceRoot, { recursive: true, force: true })
		} catch {
			// ignore
		}
	})

	describe("appendToTraceLog", () => {
		it("creates file if not exists", async () => {
			const entry = makeValidEntry()
			await appendToTraceLog(workspaceRoot, entry)
			const tracePath = path.join(workspaceRoot, ".orchestration", "agent_trace.jsonl")
			await expect(fs.access(tracePath)).resolves.toBeUndefined()
		})

		it("appends one JSON object per line (JSONL)", async () => {
			const entry1 = makeValidEntry({ id: "id-1" })
			const entry2 = makeValidEntry({ id: "id-2" })
			await appendToTraceLog(workspaceRoot, entry1)
			await appendToTraceLog(workspaceRoot, entry2)
			const content = await fs.readFile(path.join(workspaceRoot, ".orchestration", "agent_trace.jsonl"), "utf8")
			const lines = content.split("\n").filter((l) => l.trim() !== "")
			expect(lines).toHaveLength(2)
			expect(JSON.parse(lines[0]).id).toBe("id-1")
			expect(JSON.parse(lines[1]).id).toBe("id-2")
		})

		it("throws on invalid entry", async () => {
			const invalid = { id: "x", timestamp: "now" } as TraceEntry
			await expect(appendToTraceLog(workspaceRoot, invalid)).rejects.toThrow("Invalid trace entry")
		})
	})

	describe("readTraceLog", () => {
		it("returns empty array when file does not exist", async () => {
			const entries = await readTraceLog(workspaceRoot)
			expect(entries).toEqual([])
		})

		it("parses JSONL correctly and returns valid entries", async () => {
			const entry = makeValidEntry({ id: "read-test" })
			await appendToTraceLog(workspaceRoot, entry)
			const entries = await readTraceLog(workspaceRoot)
			expect(entries).toHaveLength(1)
			expect(entries[0].id).toBe("read-test")
			expect(entries[0].files[0].relative_path).toBe("src/example.ts")
		})

		it("returns multiple entries in order", async () => {
			await appendToTraceLog(workspaceRoot, makeValidEntry({ id: "a" }))
			await appendToTraceLog(workspaceRoot, makeValidEntry({ id: "b" }))
			await appendToTraceLog(workspaceRoot, makeValidEntry({ id: "c" }))
			const entries = await readTraceLog(workspaceRoot)
			expect(entries.map((e) => e.id)).toEqual(["a", "b", "c"])
		})

		it("skips invalid JSON lines and still returns valid ones", async () => {
			const tracePath = path.join(workspaceRoot, ".orchestration")
			await fs.mkdir(tracePath, { recursive: true })
			await fs.writeFile(
				path.join(tracePath, "agent_trace.jsonl"),
				"not json\n" + JSON.stringify(makeValidEntry({ id: "valid" })) + "\n",
				"utf8",
			)
			const entries = await readTraceLog(workspaceRoot)
			expect(entries).toHaveLength(1)
			expect(entries[0].id).toBe("valid")
		})
	})

	describe("clearTraceLog", () => {
		it("removes trace file", async () => {
			await appendToTraceLog(workspaceRoot, makeValidEntry())
			await clearTraceLog(workspaceRoot)
			const entries = await readTraceLog(workspaceRoot)
			expect(entries).toEqual([])
		})

		it("does not throw when file does not exist", async () => {
			await expect(clearTraceLog(workspaceRoot)).resolves.toBeUndefined()
		})
	})
})
