import { promises as fs } from "fs"
import path from "path"
import type { TraceEntry } from "../models/trace"
import { isValidTraceEntry } from "../models/trace"

const TRACE_FILE = "agent_trace.jsonl"

/**
 * Full path to the trace log file under `.orchestration/`.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns Full path to agent_trace.jsonl
 */
function getTracePath(workspaceRoot: string): string {
	return path.join(workspaceRoot, ".orchestration", TRACE_FILE)
}

/**
 * Ensures the `.orchestration` directory exists (creates it if missing).
 *
 * @param workspaceRoot - Root directory of the workspace
 */
async function ensureOrchestrationDir(workspaceRoot: string): Promise<void> {
	const orchestrationPath = path.join(workspaceRoot, ".orchestration")
	try {
		await fs.access(orchestrationPath)
	} catch {
		await fs.mkdir(orchestrationPath, { recursive: true })
	}
}

/**
 * Appends a trace entry to `.orchestration/agent_trace.jsonl` (one JSON object per line).
 * Creates the file and `.orchestration` directory if they do not exist.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @param entry - Trace entry to append (must pass validation)
 * @throws If the entry is invalid or the write fails
 */
export async function appendToTraceLog(workspaceRoot: string, entry: TraceEntry): Promise<void> {
	if (!isValidTraceEntry(entry)) {
		console.error("[traceStorage] Invalid trace entry:", entry)
		throw new Error("Invalid trace entry")
	}

	await ensureOrchestrationDir(workspaceRoot)
	const tracePath = getTracePath(workspaceRoot)
	const line = JSON.stringify(entry) + "\n"

	try {
		await fs.appendFile(tracePath, line, "utf8")
	} catch (error) {
		console.error("[traceStorage] Error appending to trace log:", error)
		throw error
	}
}

/**
 * Reads all trace entries from `.orchestration/agent_trace.jsonl`.
 * Returns an empty array if the file does not exist. Skips and logs invalid lines.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns Array of valid trace entries (order preserved)
 */
export async function readTraceLog(workspaceRoot: string): Promise<TraceEntry[]> {
	const tracePath = getTracePath(workspaceRoot)

	try {
		const content = await fs.readFile(tracePath, "utf8")
		const lines = content.split("\n").filter((line) => line.trim() !== "")

		return lines
			.map((line) => {
				try {
					return JSON.parse(line) as TraceEntry
				} catch {
					console.warn("[traceStorage] Skipping invalid JSON line:", line)
					return null
				}
			})
			.filter((entry): entry is TraceEntry => entry !== null && isValidTraceEntry(entry))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return []
		}
		throw error
	}
}

/**
 * Removes the trace log file. Useful for tests.
 *
 * @param workspaceRoot - Root directory of the workspace
 */
export async function clearTraceLog(workspaceRoot: string): Promise<void> {
	const tracePath = getTracePath(workspaceRoot)
	try {
		await fs.unlink(tracePath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error
		}
	}
}
