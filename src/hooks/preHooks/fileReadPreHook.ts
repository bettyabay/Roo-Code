/**
 * Pre-hook for file read operations that takes snapshots for optimistic locking
 *
 * This hook intercepts:
 * - read_file
 * - search_files
 * - list_files
 * - read_directory
 * - grep
 * - Any other tool that reads files
 *
 * It takes snapshots of files being read so that later write operations
 * can detect if files were modified by other agents.
 */

import { fileStateTracker } from "../utils/fileState"
import { agentSessionManager } from "../utils/agentSession"
import * as path from "path"

export interface FileReadPreHookArgs {
	path?: string
	paths?: string[]
	[key: string]: unknown
}

export interface FileReadPreHookContext {
	agentId?: string
	workspaceRoot?: string
	[key: string]: unknown
}

export interface FileReadPreHookResult {
	blocked: false // Never blocks, just tracks
	modifiedArgs?: FileReadPreHookArgs
}

/**
 * Pre-hook for file read operations that takes snapshots for optimistic locking.
 *
 * This hook intercepts read operations to register file snapshots. It never blocks
 * read operations - it only tracks files being read so that write operations can
 * detect conflicts.
 *
 * @param args - Tool arguments (may contain `path` or `paths`)
 * @param context - Context with agentId and workspaceRoot
 * @returns Unmodified result (never blocks)
 */
export async function fileReadPreHook(
	args: FileReadPreHookArgs,
	context: FileReadPreHookContext,
): Promise<FileReadPreHookResult> {
	const { agentId, workspaceRoot } = context

	// If no agent ID or workspace root, skip snapshotting
	if (!agentId || !workspaceRoot) {
		return { blocked: false }
	}

	try {
		// Update agent activity
		agentSessionManager.updateActivity(agentId)

		// Handle different argument patterns
		const filesToSnapshot: string[] = []

		// Single file path (read_file)
		if (args.path && typeof args.path === "string") {
			filesToSnapshot.push(args.path)
		}

		// Multiple file paths (search_files, list_files)
		if (args.paths && Array.isArray(args.paths)) {
			for (const p of args.paths) {
				if (typeof p === "string") {
					filesToSnapshot.push(p)
				}
			}
		}

		// For search/list operations without specific paths, we can't snapshot everything
		// Just mark that agent is active and return
		if (filesToSnapshot.length === 0) {
			return { blocked: false }
		}

		// Take snapshots of each file
		for (const filePath of filesToSnapshot) {
			try {
				// Use takeSnapshotFromDisk which handles path resolution and reading
				await fileStateTracker.takeSnapshotFromDisk(filePath, agentId, workspaceRoot)

				// Track file in agent session
				agentSessionManager.addFile(agentId, filePath)

				console.debug(`[fileReadPreHook] Snapshot taken for ${filePath} by ${agentId}`)
			} catch (error) {
				// File might not exist or permission error - that's okay, just skip
				// Don't block the read operation
				console.debug(`[fileReadPreHook] Could not snapshot ${filePath}:`, error)
			}
		}
	} catch (error) {
		// Never block read operations, just log errors
		console.error("[fileReadPreHook] Error in fileReadPreHook:", error)
	}

	// Never block read operations
	return { blocked: false }
}
