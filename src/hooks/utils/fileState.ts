import { sha256 } from "./hashing"
import { promises as fs } from "fs"
import * as path from "path"

interface FileSnapshot {
	/** Hash of the file content when snapshot taken */
	hash: string
	/** ID of the agent that took the snapshot */
	agentId: string
	/** Timestamp when snapshot was taken */
	timestamp: number
	/** Path to the file (normalized) */
	filePath: string
}

/**
 * Manages file snapshots for optimistic locking across parallel agent sessions.
 * Uses singleton pattern to maintain state across all agent sessions.
 */
export class FileStateTracker {
	private static instance: FileStateTracker
	private snapshots: Map<string, FileSnapshot> = new Map()
	private readonly DEFAULT_MAX_AGE = 5 * 60 * 1000 // 5 minutes
	private cleanupInterval: NodeJS.Timeout | null = null

	private constructor() {
		// Start periodic cleanup (every minute)
		this.startCleanupInterval(60 * 1000, this.DEFAULT_MAX_AGE)
	}

	/**
	 * Get the singleton instance
	 */
	public static getInstance(): FileStateTracker {
		if (!FileStateTracker.instance) {
			FileStateTracker.instance = new FileStateTracker()
		}
		return FileStateTracker.instance
	}

	/**
	 * Normalize file path relative to workspace root
	 * @param filePath - Absolute or relative file path
	 * @param workspaceRoot - Root directory of the workspace
	 * @returns Normalized relative path (forward slashes)
	 */
	private normalizePath(filePath: string, workspaceRoot: string): string {
		const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath)
		const normalized = path.normalize(absolutePath)
		const relative = path.relative(workspaceRoot, normalized)
		return relative.split(path.sep).join("/") // Normalize to forward slashes
	}

	/**
	 * Take a snapshot of a file for an agent
	 * @param filePath - Path to the file (absolute or relative)
	 * @param content - File content
	 * @param agentId - ID of the agent taking the snapshot
	 * @param workspaceRoot - Root directory of the workspace
	 * @returns The hash of the file content
	 */
	public takeSnapshot(filePath: string, content: string, agentId: string, workspaceRoot: string): string {
		const normalizedPath = this.normalizePath(filePath, workspaceRoot)
		const hash = sha256(content)

		this.snapshots.set(normalizedPath, {
			hash,
			agentId,
			timestamp: Date.now(),
			filePath: normalizedPath,
		})

		return hash
	}

	/**
	 * Take a snapshot by reading the file from disk
	 * @param filePath - Path to the file (absolute or relative)
	 * @param agentId - ID of the agent
	 * @param workspaceRoot - Root directory of the workspace
	 * @returns The hash of the file content
	 */
	public async takeSnapshotFromDisk(filePath: string, agentId: string, workspaceRoot: string): Promise<string> {
		try {
			const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath)
			const content = await fs.readFile(absolutePath, "utf-8")
			return this.takeSnapshot(filePath, content, agentId, workspaceRoot)
		} catch (error) {
			console.error(`[fileState] Error taking snapshot for ${filePath}:`, error)
			throw error
		}
	}

	/**
	 * Verify that a file hasn't changed since the agent took a snapshot
	 * @param filePath - Path to the file (absolute or relative)
	 * @param agentId - ID of the agent
	 * @param workspaceRoot - Root directory of the workspace
	 * @returns true if file unchanged or no snapshot, false if stale
	 */
	public async verifySnapshot(filePath: string, agentId: string, workspaceRoot: string): Promise<boolean> {
		const normalizedPath = this.normalizePath(filePath, workspaceRoot)
		const snapshot = this.snapshots.get(normalizedPath)

		// No snapshot means this agent hasn't read the file yet
		// We'll consider it valid (will be caught by pre-hook if needed)
		if (!snapshot) {
			return true
		}

		// Verify the current file hash matches the snapshot hash
		try {
			const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath)
			const currentContent = await fs.readFile(absolutePath, "utf-8")
			const currentHash = sha256(currentContent)

			const isValid = currentHash === snapshot.hash

			if (!isValid) {
				console.debug(
					`[fileState] Stale file detected: ${normalizedPath} (agent: ${agentId}, expected: ${snapshot.hash.slice(0, 8)}..., actual: ${currentHash.slice(0, 8)}...)`,
				)
			}

			return isValid
		} catch (error) {
			// File might not exist anymore or permission error
			console.error(`[fileState] Error verifying snapshot for ${filePath}:`, error)
			return false
		}
	}

	/**
	 * Release a snapshot (agent done with file)
	 * @param filePath - Path to the file (absolute or relative)
	 * @param agentId - ID of the agent (for verification)
	 * @param workspaceRoot - Root directory of the workspace
	 */
	public releaseSnapshot(filePath: string, agentId: string, workspaceRoot: string): void {
		const normalizedPath = this.normalizePath(filePath, workspaceRoot)
		const snapshot = this.snapshots.get(normalizedPath)

		// Only release if it belongs to this agent
		if (snapshot && snapshot.agentId === agentId) {
			this.snapshots.delete(normalizedPath)
		}
	}

	/**
	 * Release all snapshots for an agent (agent disconnecting)
	 * @param agentId - ID of the agent
	 */
	public releaseAllForAgent(agentId: string): void {
		for (const [filePath, snapshot] of this.snapshots.entries()) {
			if (snapshot.agentId === agentId) {
				this.snapshots.delete(filePath)
			}
		}
	}

	/**
	 * Get error message for stale file
	 * @param filePath - Path to the stale file
	 * @param agentId - ID of the agent that detected the stale file
	 * @returns Formatted error message
	 */
	public getStaleError(filePath: string, agentId: string): string {
		return `Stale File: ${filePath} has been modified by another agent. Please re-read the file and merge changes before writing.`
	}

	/**
	 * Clean up snapshots older than maxAge
	 * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
	 */
	public cleanupStaleSnapshots(maxAgeMs: number = this.DEFAULT_MAX_AGE): void {
		const now = Date.now()
		let cleaned = 0

		for (const [filePath, snapshot] of this.snapshots.entries()) {
			if (now - snapshot.timestamp > maxAgeMs) {
				this.snapshots.delete(filePath)
				cleaned++
			}
		}

		if (cleaned > 0) {
			console.debug(`[fileState] Cleaned up ${cleaned} stale snapshots`)
		}
	}

	/**
	 * Start periodic cleanup interval
	 * @param intervalMs - Interval in milliseconds (default: 60 seconds)
	 * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
	 */
	public startCleanupInterval(intervalMs: number = 60 * 1000, maxAgeMs: number = this.DEFAULT_MAX_AGE): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
		}

		this.cleanupInterval = setInterval(() => {
			this.cleanupStaleSnapshots(maxAgeMs)
		}, intervalMs)
	}

	/**
	 * Stop periodic cleanup interval
	 */
	public stopCleanupInterval(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = null
		}
	}

	/**
	 * Get all active snapshots (for debugging)
	 */
	public getAllSnapshots(): Map<string, FileSnapshot> {
		return new Map(this.snapshots)
	}

	/**
	 * Get snapshot for a specific file (for debugging)
	 */
	public getSnapshot(filePath: string, workspaceRoot: string): FileSnapshot | undefined {
		const normalizedPath = this.normalizePath(filePath, workspaceRoot)
		return this.snapshots.get(normalizedPath)
	}

	/**
	 * Clear all snapshots (for testing)
	 */
	public clear(): void {
		this.snapshots.clear()
	}
}

// Export singleton instance
export const fileStateTracker = FileStateTracker.getInstance()
