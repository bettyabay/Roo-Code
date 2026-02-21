import { createHash } from "crypto"
import { promises as fs } from "fs"

/**
 * Normalize line endings to `\n` for consistent hashing across platforms.
 * @internal
 */
function normalizeLineEndings(content: string): string {
	return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

/**
 * Compute SHA-256 hash of a string.
 * Line endings are normalized to `\n` before hashing so that the same logical
 * content yields the same hash regardless of CRLF/LF/CR.
 *
 * @param content - String content to hash
 * @returns Hex-encoded SHA-256 hash (64 characters)
 */
export function sha256(content: string): string {
	const normalized = normalizeLineEndings(content)
	return createHash("sha256").update(normalized, "utf8").digest("hex")
}

/**
 * Compute content hash of a specific range of lines (1-based, inclusive).
 * If no range is provided, hashes the entire content. Out-of-range indices
 * are clamped to valid line bounds; an empty range returns the hash of the
 * empty string.
 *
 * @param content - Full file content
 * @param startLine - Starting line number (1-based, inclusive). Omit to hash entire content.
 * @param endLine - Ending line number (1-based, inclusive). Omit to hash entire content.
 * @returns Hex-encoded SHA-256 hash (64 characters) of the specified line range or full content
 *
 * @example
 * const content = 'line1\nline2\nline3\nline4'
 * computeContentHash(content)           // hashes full content
 * computeContentHash(content, 2, 3)     // hashes 'line2\nline3'
 */
export function computeContentHash(content: string, startLine?: number, endLine?: number): string {
	if (startLine === undefined || endLine === undefined) {
		return sha256(content)
	}

	const lines = normalizeLineEndings(content).split("\n")
	const start = Math.max(0, startLine - 1)
	const end = Math.min(lines.length, endLine)

	if (start >= end) {
		return sha256("")
	}

	const block = lines.slice(start, end).join("\n")
	return sha256(block)
}

/**
 * Compute SHA-256 hash of a file's contents.
 *
 * @param filePath - Path to the file (relative or absolute)
 * @returns Hex-encoded SHA-256 hash (64 characters) of the file contents
 * @throws If the file cannot be read (e.g. missing, permission denied)
 */
export async function computeFileHash(filePath: string): Promise<string> {
	const content = await fs.readFile(filePath, "utf8")
	return sha256(content)
}
