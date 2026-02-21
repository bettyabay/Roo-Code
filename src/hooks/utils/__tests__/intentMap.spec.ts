import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { updateIntentMap, removeFromIntentMap, getIntentFiles } from "../intentMap"

describe("intentMap", () => {
	let workspaceRoot: string

	beforeEach(async () => {
		workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "intent-map-"))
	})

	afterEach(async () => {
		try {
			await fs.rm(workspaceRoot, { recursive: true, force: true })
		} catch {
			// ignore
		}
	})

	describe("updateIntentMap", () => {
		it("creates file if not exists", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/foo.ts")
			const mapPath = path.join(workspaceRoot, ".orchestration", "intent_map.md")
			await expect(fs.access(mapPath)).resolves.toBeUndefined()
			const content = await fs.readFile(mapPath, "utf-8")
			expect(content).toContain("# Intent Map")
			expect(content).toContain("## INT-001")
			expect(content).toContain("- src/foo.ts")
		})

		it("adds file path under correct intent section", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/a.ts")
			await updateIntentMap(workspaceRoot, "INT-002", "src/b.ts")
			const content = await fs.readFile(path.join(workspaceRoot, ".orchestration", "intent_map.md"), "utf-8")
			expect(content).toMatch(/## INT-001[\s\S]*?- src\/a\.ts/)
			expect(content).toMatch(/## INT-002[\s\S]*?- src\/b\.ts/)
		})

		it("does not create duplicates", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/foo.ts")
			await updateIntentMap(workspaceRoot, "INT-001", "src/foo.ts")
			const files = await getIntentFiles(workspaceRoot, "INT-001")
			expect(files).toHaveLength(1)
			expect(files[0]).toBe("src/foo.ts")
		})

		it("handles multiple files per intent", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/a.ts")
			await updateIntentMap(workspaceRoot, "INT-001", "src/b.ts")
			await updateIntentMap(workspaceRoot, "INT-001", "src/c.ts")
			const files = await getIntentFiles(workspaceRoot, "INT-001")
			expect(files).toHaveLength(3)
			expect(files.sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"])
		})

		it("normalizes path to forward slashes", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src\\sub\\file.ts")
			const files = await getIntentFiles(workspaceRoot, "INT-001")
			expect(files[0]).toBe("src/sub/file.ts")
		})

		it("preserves intent names from existing content", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/a.ts", "First intent")
			await updateIntentMap(workspaceRoot, "INT-001", "src/b.ts")
			const content = await fs.readFile(path.join(workspaceRoot, ".orchestration", "intent_map.md"), "utf-8")
			expect(content).toContain("## INT-001: First intent")
		})
	})

	describe("removeFromIntentMap", () => {
		it("removes file path from intent section", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/a.ts")
			await updateIntentMap(workspaceRoot, "INT-001", "src/b.ts")
			await removeFromIntentMap(workspaceRoot, "INT-001", "src/a.ts")
			const files = await getIntentFiles(workspaceRoot, "INT-001")
			expect(files).toEqual(["src/b.ts"])
		})

		it("removes intent section when last file is removed", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/only.ts")
			await removeFromIntentMap(workspaceRoot, "INT-001", "src/only.ts")
			const files = await getIntentFiles(workspaceRoot, "INT-001")
			expect(files).toEqual([])
			const content = await fs.readFile(path.join(workspaceRoot, ".orchestration", "intent_map.md"), "utf-8")
			expect(content).not.toContain("## INT-001")
		})

		it("does not throw when file does not exist", async () => {
			await expect(removeFromIntentMap(workspaceRoot, "INT-001", "src/missing.ts")).resolves.toBeUndefined()
		})
	})

	describe("getIntentFiles", () => {
		it("returns empty array when map file does not exist", async () => {
			const files = await getIntentFiles(workspaceRoot, "INT-001")
			expect(files).toEqual([])
		})

		it("returns empty array when intent is missing", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/a.ts")
			const files = await getIntentFiles(workspaceRoot, "INT-999")
			expect(files).toEqual([])
		})

		it("returns files for intent", async () => {
			await updateIntentMap(workspaceRoot, "INT-001", "src/a.ts")
			await updateIntentMap(workspaceRoot, "INT-001", "src/b.ts")
			const files = await getIntentFiles(workspaceRoot, "INT-001")
			expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"])
		})
	})

	describe("markdown parsing", () => {
		it("parses existing intent_map with multiple sections", async () => {
			const mapPath = path.join(workspaceRoot, ".orchestration", "intent_map.md")
			await fs.mkdir(path.dirname(mapPath), { recursive: true })
			await fs.writeFile(
				mapPath,
				`# Intent Map

This file maps business intents to physical files in the codebase.

## INT-001: Alpha

- src/alpha.ts

## INT-002: Beta

- src/beta.ts
- src/beta2.ts
`,
				"utf-8",
			)
			await updateIntentMap(workspaceRoot, "INT-001", "src/alpha2.ts")
			const files1 = await getIntentFiles(workspaceRoot, "INT-001")
			const files2 = await getIntentFiles(workspaceRoot, "INT-002")
			expect(files1.sort()).toEqual(["src/alpha.ts", "src/alpha2.ts"])
			expect(files2.sort()).toEqual(["src/beta.ts", "src/beta2.ts"])
			const content = await fs.readFile(mapPath, "utf-8")
			expect(content).toContain("## INT-001: Alpha")
			expect(content).toContain("## INT-002: Beta")
		})
	})
})
