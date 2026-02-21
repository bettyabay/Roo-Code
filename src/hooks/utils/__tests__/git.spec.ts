import { describe, it, expect, beforeEach } from "vitest"
import { execSync } from "child_process"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { getCurrentRevision, clearGitCache, isGitRepository } from "../git"

/** Create a temp directory and optionally init a git repo with one commit so HEAD exists. */
async function setupTempDir(initGit: boolean): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "git-spec-"))
	if (initGit) {
		execSync("git init", { cwd: dir, stdio: "pipe" })
		execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" })
		execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" })
		execSync("git commit --allow-empty -m first", { cwd: dir, stdio: "pipe" })
	}
	return dir
}

describe("git", () => {
	beforeEach(() => {
		clearGitCache()
	})

	describe("getCurrentRevision", () => {
		it("returns git SHA when in a git repo", async () => {
			const dir = await setupTempDir(true)
			try {
				const revision = await getCurrentRevision(dir)
				expect(revision).toMatch(/^[a-f0-9]{40}$/)
				expect(revision).not.toBe("unknown")
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})

		it("trims whitespace from stdout", async () => {
			const dir = await setupTempDir(true)
			try {
				const revision = await getCurrentRevision(dir)
				expect(revision).toBe(revision.trim())
				expect(revision).not.toContain("\n")
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})

		it("returns 'unknown' when not in a git repo", async () => {
			const dir = await setupTempDir(false)
			try {
				const revision = await getCurrentRevision(dir)
				expect(revision).toBe("unknown")
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})

		it("caches revision for performance (same result within TTL)", async () => {
			const dir = await setupTempDir(true)
			try {
				const r1 = await getCurrentRevision(dir)
				const r2 = await getCurrentRevision(dir)
				expect(r1).toBe(r2)
				expect(r1).not.toBe("unknown")
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})

		it("different workspace roots are cached separately", async () => {
			const dir1 = await setupTempDir(true)
			const dir2 = await setupTempDir(true)
			try {
				const r1 = await getCurrentRevision(dir1)
				const r2 = await getCurrentRevision(dir2)
				expect(r1).not.toBe("unknown")
				expect(r2).not.toBe("unknown")
				expect(r1).not.toBe(r2)
			} finally {
				await fs.rm(dir1, { recursive: true, force: true })
				await fs.rm(dir2, { recursive: true, force: true })
			}
		})
	})

	describe("clearGitCache", () => {
		it("clears cache so next getCurrentRevision calls git again", async () => {
			const dir = await setupTempDir(true)
			try {
				const r1 = await getCurrentRevision(dir)
				clearGitCache()
				const r2 = await getCurrentRevision(dir)
				expect(r1).toBe(r2)
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})
	})

	describe("isGitRepository", () => {
		it("returns true when in a git repo", async () => {
			const dir = await setupTempDir(true)
			try {
				const result = await isGitRepository(dir)
				expect(result).toBe(true)
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})

		it("returns false when not in a git repo", async () => {
			const dir = await setupTempDir(false)
			try {
				const result = await isGitRepository(dir)
				expect(result).toBe(false)
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})
	})
})
