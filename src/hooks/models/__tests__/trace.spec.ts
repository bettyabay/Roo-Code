import { describe, it, expect } from "vitest"
import { type TraceEntry, type TraceFile, isValidTraceEntry, createTraceEntry, MUTATION_CLASSES } from "../trace"

describe("trace models", () => {
	describe("isValidTraceEntry", () => {
		const validEntry: TraceEntry = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			timestamp: "2026-02-21T12:00:00.000Z",
			vcs: { revision_id: "a1b2c3d4e5f6" },
			files: [
				{
					relative_path: "src/auth/middleware.ts",
					conversations: [
						{
							url: "session-1",
							contributor: { entity_type: "AI", model_identifier: "claude-3-5-sonnet" },
							ranges: [
								{
									start_line: 15,
									end_line: 45,
									content_hash: "sha256:a8f5f167f44f4964e6c998dee827110c",
								},
							],
							related: [{ type: "specification", value: "INT-001" }],
						},
					],
				},
			],
			mutation_class: "AST_REFACTOR",
		}

		it("returns true for a valid trace entry", () => {
			expect(isValidTraceEntry(validEntry)).toBe(true)
		})

		it("returns true for entry with empty files array", () => {
			expect(
				isValidTraceEntry({
					...validEntry,
					files: [],
				}),
			).toBe(true)
		})

		it("returns false for null or non-object", () => {
			expect(isValidTraceEntry(null)).toBe(false)
			expect(isValidTraceEntry(undefined)).toBe(false)
			expect(isValidTraceEntry("string")).toBe(false)
			expect(isValidTraceEntry(42)).toBe(false)
		})

		it("returns false when id is missing or not string", () => {
			expect(isValidTraceEntry({ ...validEntry, id: 123 as unknown as string })).toBe(false)
			expect(isValidTraceEntry({ ...validEntry, id: "" })).toBe(true) // empty string allowed
		})

		it("returns false when timestamp is missing or not string", () => {
			expect(isValidTraceEntry({ ...validEntry, timestamp: 123 as unknown as string })).toBe(false)
		})

		it("returns false when vcs.revision_id is missing", () => {
			expect(isValidTraceEntry({ ...validEntry, vcs: {} as { revision_id: string } })).toBe(false)
		})

		it("returns false when files is not an array", () => {
			expect(isValidTraceEntry({ ...validEntry, files: {} as TraceFile[] })).toBe(false)
		})

		it("returns false when mutation_class is invalid", () => {
			expect(
				isValidTraceEntry({
					...validEntry,
					mutation_class: "INVALID" as TraceEntry["mutation_class"],
				}),
			).toBe(false)
		})

		it("returns true for all valid mutation_class values", () => {
			for (const mc of MUTATION_CLASSES) {
				expect(isValidTraceEntry({ ...validEntry, mutation_class: mc })).toBe(true)
			}
		})
	})

	describe("createTraceEntry", () => {
		it("returns entry with defaults when no overrides", () => {
			const entry = createTraceEntry()
			expect(entry.id).toBe("pending")
			expect(entry.vcs.revision_id).toBe("unknown")
			expect(entry.files).toEqual([])
			expect(typeof entry.timestamp).toBe("string")
			expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
		})

		it("merges overrides into entry", () => {
			const entry = createTraceEntry({
				id: "custom-id",
				vcs: { revision_id: "abc123" },
				mutation_class: "INTENT_EVOLUTION",
			})
			expect(entry.id).toBe("custom-id")
			expect(entry.vcs.revision_id).toBe("abc123")
			expect(entry.mutation_class).toBe("INTENT_EVOLUTION")
		})
	})
})
