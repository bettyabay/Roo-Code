import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

/** Cache entry for a workspace's git revision. */
interface CacheEntry {
	revision: string
	timestamp: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5000 // 5 seconds

/**
 * Get the current git revision (SHA) for a workspace.
 * Returns `"unknown"` when not in a git repo or when git is not available.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns Git revision SHA (trimmed), or `"unknown"` if not in a git repo or on error
 */
export async function getCurrentRevision(workspaceRoot: string): Promise<string> {
	const now = Date.now()
	const cached = cache.get(workspaceRoot)
	if (cached && now - cached.timestamp < CACHE_TTL_MS) {
		return cached.revision
	}

	try {
		const { stdout, stderr } = await execAsync("git rev-parse HEAD", {
			cwd: workspaceRoot,
			encoding: "utf8",
		})

		if (stderr) {
			console.warn("[git] warning:", stderr)
		}

		const revision = stdout.trim()
		cache.set(workspaceRoot, { revision, timestamp: now })
		return revision
	} catch {
		cache.set(workspaceRoot, { revision: "unknown", timestamp: now })
		return "unknown"
	}
}

/**
 * Clear the git revision cache. Useful for tests or when workspace state may have changed.
 */
export function clearGitCache(): void {
	cache.clear()
}

/**
 * Check if a directory is inside a git repository.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns `true` if the directory is in a git repo
 */
export async function isGitRepository(workspaceRoot: string): Promise<boolean> {
	try {
		const { stdout } = await execAsync("git rev-parse --git-dir", {
			cwd: workspaceRoot,
			encoding: "utf8",
		})
		return stdout.trim().length > 0
	} catch {
		return false
	}
}
