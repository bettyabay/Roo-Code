/**
 * Post-hook for write_file
 *
 * Implements the AI-Native Git layer by:
 * 1. Computing SHA-256 content hash of changed code
 * 2. Creating trace entry with intent ID and hash
 * 3. Appending to .orchestration/agent_trace.jsonl
 * 4. Updating intent_map.md
 *
 * This repays Trust Debt with cryptographic verification.
 */

import { v4 as uuidv4 } from "uuid"
import type { TraceEntry, TraceFile, TraceConversation, TraceRange, MutationClass } from "../models/trace"
import { computeContentHash } from "../utils/hashing"
import { getCurrentRevision } from "../utils/git"
import { appendToTraceLog } from "../utils/traceStorage"
import { updateIntentMap } from "../utils/intentMap"
import { getMutationClass } from "../utils/mutationClassifier"
import { MUTATION_CLASSES } from "../models/trace"
import { fileStateTracker } from "../utils/fileState"

export interface WriteFilePostHookArgs {
	path: string
	content: string
	mutation_class?: string
	[key: string]: unknown
}

export interface WriteFilePostHookResult {
	success?: boolean
	error?: string
	[key: string]: unknown
}

export interface WriteFilePostHookContext {
	intentId: string | null
	workspaceRoot?: string
	vcsRevisionId?: string
	/** Session or conversation ID for trace (e.g. task id). */
	sessionId?: string
	/** AI model identifier for contributor. */
	modelIdentifier?: string
	/** Previous file content (for mutation classification when mutation_class not provided). */
	oldContent?: string
	/** Agent session ID for optimistic locking. */
	agentId?: string
	[key: string]: unknown
}

function isValidMutationClass(value: string): value is MutationClass {
	return (MUTATION_CLASSES as readonly string[]).includes(value)
}

/**
 * Post-hook for write_file that creates traceability artifacts.
 *
 * Generates a trace entry (UUID v4, git revision, content hash, intent_id),
 * appends to agent_trace.jsonl, and updates intent_map.md. On error, logs only
 * and does not throw so the tool result is not blocked.
 *
 * @param args - The write_file arguments (path, content, optional mutation_class)
 * @param result - Result from the tool execution
 * @param context - Context including intentId, workspaceRoot, optional sessionId, modelIdentifier, oldContent
 */
export async function writeFilePostHook(
	args: WriteFilePostHookArgs,
	result: WriteFilePostHookResult,
	context: WriteFilePostHookContext,
): Promise<void> {
	const { path: filePath, content, mutation_class: explicitClass } = args
	const { intentId, workspaceRoot = "", sessionId, modelIdentifier, oldContent, agentId } = context

	if (!intentId) {
		return
	}

	try {
		const revisionId = await getCurrentRevision(workspaceRoot)

		let mutationClass: MutationClass
		if (explicitClass && isValidMutationClass(explicitClass)) {
			mutationClass = explicitClass
		} else if (oldContent !== undefined) {
			mutationClass = getMutationClass(explicitClass, oldContent, content)
		} else {
			mutationClass = "AST_REFACTOR"
		}

		const lineCount = Math.max(1, content.split("\n").length)
		const contentHash = "sha256:" + computeContentHash(content, 1, lineCount)

		const ranges: TraceRange[] = [
			{
				start_line: 1,
				end_line: lineCount,
				content_hash: contentHash,
			},
		]

		const conversation: TraceConversation = {
			url: sessionId ?? `session://${Date.now()}`,
			contributor: {
				entity_type: "AI",
				model_identifier: modelIdentifier ?? "unknown",
			},
			ranges,
			related: [{ type: "specification", value: intentId }],
		}

		const file: TraceFile = {
			relative_path: filePath,
			conversations: [conversation],
		}

		const traceEntry: TraceEntry = {
			id: uuidv4(),
			timestamp: new Date().toISOString(),
			vcs: { revision_id: revisionId },
			files: [file],
			mutation_class: mutationClass,
		}

		await appendToTraceLog(workspaceRoot, traceEntry)
		await updateIntentMap(workspaceRoot, intentId, filePath)

		// Release the snapshot after successful write
		if (agentId && workspaceRoot) {
			try {
				fileStateTracker.releaseSnapshot(filePath, agentId, workspaceRoot)
			} catch (error) {
				// Don't fail the post-hook if snapshot release fails
				console.debug(`[writeFilePostHook] Error releasing snapshot for ${filePath}:`, error)
			}
		}
	} catch (error) {
		console.error("[hooks] writeFilePostHook error:", error)
	}
}
