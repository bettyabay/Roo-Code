import { promises as fs } from "fs"
import path from "path"

const INTENT_MAP_FILE = "intent_map.md"

/**
 * Get the full path to the intent map file.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns Full path to intent_map.md
 */
function getMapPath(workspaceRoot: string): string {
	return path.join(workspaceRoot, ".orchestration", INTENT_MAP_FILE)
}

/**
 * Normalize a file path to relative forward slashes (for consistent storage).
 */
function normalizePath(filePath: string): string {
	const normalized = path.normalize(filePath).replace(/\\/g, "/")
	return normalized.startsWith("/") ? normalized.slice(1) : normalized
}

/**
 * Ensure the `.orchestration` directory exists.
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
 * Parse intent map content into a Map of intentId -> Set of file paths.
 * Supports headers like `## INT-001: Name` or `## intent-id: Name` (any id before the colon).
 *
 * @param content - Markdown content of intent_map.md
 * @returns Map of intent IDs to file path sets
 */
function parseIntentMap(content: string): Map<string, Set<string>> {
	const intentMap = new Map<string, Set<string>>()
	const lines = content.split("\n")
	let currentIntent: string | null = null

	for (const line of lines) {
		// Match ## intentId or ## intentId: Name (any non-empty id)
		const headerMatch = line.match(/^##\s+([^\s:]+)(?::\s*(.*))?$/)
		if (headerMatch) {
			currentIntent = headerMatch[1]
			if (!intentMap.has(currentIntent)) {
				intentMap.set(currentIntent, new Set())
			}
			continue
		}

		if (currentIntent && line.trim().startsWith("- ")) {
			const filePath = normalizePath(line.trim().substring(2).trim())
			intentMap.get(currentIntent)?.add(filePath)
		}
	}

	return intentMap
}

/**
 * Build markdown content from intent map.
 *
 * @param intentMap - Map of intent IDs to file path sets
 * @param intentNames - Optional map of intent IDs to display names
 * @returns Markdown content
 */
function buildIntentMapContent(intentMap: Map<string, Set<string>>, intentNames?: Map<string, string>): string {
	let content = "# Intent Map\n\n"
	content += "This file maps business intents to physical files in the codebase.\n\n"

	const sortedIntents = Array.from(intentMap.keys()).sort()

	for (const intentId of sortedIntents) {
		const files = intentMap.get(intentId) ?? new Set<string>()
		const intentName = intentNames?.get(intentId) ?? intentId
		content += `## ${intentId}: ${intentName}\n\n`
		if (files.size === 0) {
			content += "*No files mapped yet*\n\n"
		} else {
			const sortedFiles = Array.from(files).sort()
			for (const file of sortedFiles) {
				content += `- ${file}\n`
			}
			content += "\n"
		}
	}

	return content
}

/**
 * Extract intent names from existing markdown content (## intentId: Name).
 */
function extractIntentNames(content: string): Map<string, string> {
	const intentNames = new Map<string, string>()
	for (const line of content.split("\n")) {
		const match = line.match(/^##\s+([^\s:]+):\s*(.+)$/)
		if (match) {
			intentNames.set(match[1], match[2].trim())
		}
	}
	return intentNames
}

/**
 * Update intent map with a file path for an intent.
 * Creates `.orchestration` and `intent_map.md` if they do not exist.
 * Paths are normalized (relative, forward slashes) and deduplicated.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @param intentId - ID of the intent
 * @param filePath - Path to the file (relative to workspace)
 * @param intentName - Optional display name for the intent section
 */
export async function updateIntentMap(
	workspaceRoot: string,
	intentId: string,
	filePath: string,
	intentName?: string,
): Promise<void> {
	await ensureOrchestrationDir(workspaceRoot)
	const mapPath = getMapPath(workspaceRoot)
	const normalizedPath = normalizePath(filePath)
	let intentMap: Map<string, Set<string>>
	const intentNames = new Map<string, string>()

	try {
		const content = await fs.readFile(mapPath, "utf-8")
		intentMap = parseIntentMap(content)
		extractIntentNames(content).forEach((v, k) => intentNames.set(k, v))
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code
		if (code !== "ENOENT") throw err
		intentMap = new Map()
	}

	if (intentName !== undefined) {
		intentNames.set(intentId, intentName)
	}

	if (!intentMap.has(intentId)) {
		intentMap.set(intentId, new Set())
	}
	intentMap.get(intentId)!.add(normalizedPath)

	const newContent = buildIntentMapContent(intentMap, intentNames)
	await fs.writeFile(mapPath, newContent, "utf-8")
}

/**
 * Remove a file path from an intent's section.
 * If the intent section becomes empty, the section is removed.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @param intentId - ID of the intent
 * @param filePath - Path to remove (normalized for comparison)
 */
export async function removeFromIntentMap(workspaceRoot: string, intentId: string, filePath: string): Promise<void> {
	const mapPath = getMapPath(workspaceRoot)
	const normalizedPath = normalizePath(filePath)

	try {
		const content = await fs.readFile(mapPath, "utf-8")
		const intentMap = parseIntentMap(content)
		const intentNames = extractIntentNames(content)

		const files = intentMap.get(intentId)
		if (files) {
			files.delete(normalizedPath)
			if (files.size === 0) {
				intentMap.delete(intentId)
			}
		}

		const newContent = buildIntentMapContent(intentMap, intentNames)
		await fs.writeFile(mapPath, newContent, "utf-8")
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code
		if (code !== "ENOENT") throw err
	}
}

/**
 * Get all file paths mapped to an intent.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @param intentId - ID of the intent
 * @returns Array of file paths (empty if file or intent missing)
 */
export async function getIntentFiles(workspaceRoot: string, intentId: string): Promise<string[]> {
	const mapPath = getMapPath(workspaceRoot)
	try {
		const content = await fs.readFile(mapPath, "utf-8")
		const intentMap = parseIntentMap(content)
		return Array.from(intentMap.get(intentId) ?? [])
	} catch {
		return []
	}
}
