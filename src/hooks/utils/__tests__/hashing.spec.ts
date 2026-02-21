import { describe, it, expect } from "vitest"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { sha256, computeContentHash, computeFileHash } from "../hashing"

describe("hashing", () => {
	describe("sha256", () => {
		it("returns consistent 64-char hex hash", () => {
			const content = "hello world"
			const hash = sha256(content)
			expect(hash).toMatch(/^[a-f0-9]{64}$/)
			expect(hash).toHaveLength(64)
			expect(sha256(content)).toBe(hash)
		})

		it("same content produces same hash", () => {
			const content = "const x = 1\nconst y = 2"
			expect(sha256(content)).toBe(sha256(content))
		})

		it("different content produces different hashes", () => {
			expect(sha256("a")).not.toBe(sha256("b"))
			expect(sha256("line1")).not.toBe(sha256("line2"))
		})

		it("normalizes line endings for consistency", () => {
			expect(sha256("a\nb")).toBe(sha256("a\r\nb"))
			expect(sha256("a\nb")).toBe(sha256("a\rb"))
		})

		it("empty string has deterministic hash", () => {
			const hash = sha256("")
			expect(hash).toMatch(/^[a-f0-9]{64}$/)
			expect(sha256("")).toBe(hash)
		})
	})

	describe("computeContentHash", () => {
		const content = "line1\nline2\nline3\nline4"

		it("with no range hashes entire content", () => {
			const fullHash = computeContentHash(content)
			expect(fullHash).toBe(sha256(content))
			expect(fullHash).toMatch(/^[a-f0-9]{64}$/)
		})

		it("with range hashes only specified lines (1-based inclusive)", () => {
			const rangeHash = computeContentHash(content, 2, 3)
			expect(rangeHash).toBe(sha256("line2\nline3"))
			expect(rangeHash).not.toBe(sha256(content))
		})

		it("single line range", () => {
			expect(computeContentHash(content, 1, 1)).toBe(sha256("line1"))
			expect(computeContentHash(content, 4, 4)).toBe(sha256("line4"))
		})

		it("full range 1 to N equals full content hash", () => {
			expect(computeContentHash(content, 1, 4)).toBe(sha256(content))
		})

		it("clamps out-of-range: empty range returns hash of empty string", () => {
			const emptyHash = sha256("")
			expect(computeContentHash(content, 10, 20)).toBe(emptyHash)
			expect(computeContentHash(content, 2, 1)).toBe(emptyHash)
		})

		it("same content and range yield same hash (consistency)", () => {
			expect(computeContentHash(content, 2, 3)).toBe(computeContentHash(content, 2, 3))
		})
	})

	describe("computeFileHash", () => {
		it("reads file and returns 64-char hex hash", async () => {
			const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hashing-"))
			const filePath = path.join(dir, "test.txt")
			await fs.writeFile(filePath, "file content", "utf8")
			try {
				const hash = await computeFileHash(filePath)
				expect(hash).toMatch(/^[a-f0-9]{64}$/)
				expect(hash).toBe(sha256("file content"))
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})

		it("same file content produces same hash", async () => {
			const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hashing-"))
			const filePath = path.join(dir, "same.txt")
			await fs.writeFile(filePath, "same", "utf8")
			try {
				const h1 = await computeFileHash(filePath)
				const h2 = await computeFileHash(filePath)
				expect(h1).toBe(h2)
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})

		it("rejects when file does not exist", async () => {
			await expect(computeFileHash("/nonexistent/path/file.txt")).rejects.toThrow()
		})
	})
})
