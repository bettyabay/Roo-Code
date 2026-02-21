import { promises as fs } from "fs"
import * as path from "path"

const CLAUDE_FILE = "CLAUDE.md"
const ORCHESTRATION_DIR = ".orchestration"

/**
 * Lesson categories for organization
 */
export type LessonCategory =
	| "ARCHITECTURE"
	| "TESTING"
	| "LINTER"
	| "BUILD"
	| "USER_FEEDBACK"
	| "STYLE"
	| "PERFORMANCE"
	| "SECURITY"
	| "GENERAL"

/**
 * Get the full path to CLAUDE.md in .orchestration directory
 * @param workspaceRoot - Root directory of the workspace
 * @returns Full path to .orchestration/CLAUDE.md
 */
function getClaudePath(workspaceRoot: string): string {
	return path.join(workspaceRoot, ORCHESTRATION_DIR, CLAUDE_FILE)
}

/**
 * Ensure the .orchestration directory exists
 * @param workspaceRoot - Root directory of the workspace
 */
async function ensureOrchestrationDir(workspaceRoot: string): Promise<void> {
	const orchestrationPath = path.join(workspaceRoot, ORCHESTRATION_DIR)
	try {
		await fs.access(orchestrationPath)
	} catch {
		await fs.mkdir(orchestrationPath, { recursive: true })
	}
}

/**
 * Get the initial CLAUDE.md header content
 * @returns Header content for new CLAUDE.md file
 */
function getInitialHeader(): string {
	return `# CLAUDE.md - Shared Project Knowledge

This file contains lessons learned, patterns, and insights accumulated across all agent sessions.

---
`
}

/**
 * Read the entire CLAUDE.md file
 * @param workspaceRoot - Root directory of the workspace
 * @returns Content of CLAUDE.md, or empty string if not exists
 */
export async function readClaudeBrain(workspaceRoot: string): Promise<string> {
	const claudePath = getClaudePath(workspaceRoot)

	try {
		return await fs.readFile(claudePath, "utf-8")
	} catch (error) {
		// File doesn't exist yet
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return ""
		}
		throw error
	}
}

/**
 * Append content to CLAUDE.md
 * @param workspaceRoot - Root directory of the workspace
 * @param content - Content to append
 */
export async function appendToClaudeBrain(workspaceRoot: string, content: string): Promise<void> {
	await ensureOrchestrationDir(workspaceRoot)
	const claudePath = getClaudePath(workspaceRoot)

	try {
		await fs.appendFile(claudePath, content, "utf-8")
	} catch (error) {
		// Create file with header if it doesn't exist
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			const initialContent = getInitialHeader() + content
			await fs.writeFile(claudePath, initialContent, "utf-8")
		} else {
			throw error
		}
	}
}

/**
 * Format a lesson with timestamp and category
 * @param category - Lesson category
 * @param lesson - Lesson text
 * @returns Formatted lesson string
 */
export function formatLesson(category: LessonCategory, lesson: string): string {
	const now = new Date()
	// Format: YYYY-MM-DD HH:MM
	const timestamp = now.toISOString().slice(0, 16).replace("T", " ")

	return `## [${category}] ${timestamp}\n${lesson}\n---\n`
}

/**
 * Record a lesson to CLAUDE.md
 * @param workspaceRoot - Root directory of the workspace
 * @param category - Lesson category
 * @param lesson - Lesson text
 * @returns true if recorded, false if duplicate
 */
export async function recordLesson(workspaceRoot: string, category: LessonCategory, lesson: string): Promise<boolean> {
	// Check for duplicates (simple contains check on last 5 lessons)
	const existing = await readClaudeBrain(workspaceRoot)
	if (existing) {
		// Get last 5 lessons (split by --- and take last 5)
		const sections = existing.split("---").filter((s) => s.trim())
		const recentLessons = sections.slice(-5).join("\n")

		if (recentLessons.includes(lesson.trim())) {
			console.debug(`[claudeManager] Duplicate lesson skipped: ${lesson.slice(0, 50)}...`)
			return false
		}
	}

	const formatted = formatLesson(category, lesson)
	await appendToClaudeBrain(workspaceRoot, formatted)
	console.debug(`[claudeManager] Lesson recorded: [${category}]`)
	return true
}

/**
 * Parse lessons from CLAUDE.md content
 * @param content - Content of CLAUDE.md
 * @returns Array of parsed lessons with category, timestamp, and content
 */
function parseLessons(content: string): Array<{ category: string; timestamp: string; content: string }> {
	const lessons: Array<{ category: string; timestamp: string; content: string }> = []

	// Split by --- separator
	const sections = content.split("---").filter((s) => s.trim())

	for (const section of sections) {
		// Match: ## [CATEGORY] YYYY-MM-DD HH:MM
		const headerMatch = section.match(/^##\s+\[([^\]]+)\]\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/m)
		if (headerMatch) {
			const category = headerMatch[1]
			const timestamp = headerMatch[2]
			const lessonContent = section
				.replace(/^##\s+\[[^\]]+\]\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*\n?/m, "")
				.trim()

			if (lessonContent) {
				lessons.push({ category, timestamp, content: lessonContent })
			}
		}
	}

	return lessons
}

/**
 * Get lessons relevant to keywords
 * Simple keyword matching - can be enhanced later with semantic search
 * @param workspaceRoot - Root directory of the workspace
 * @param keywords - Array of keywords to match against
 * @returns Array of relevant lesson content strings
 */
export async function getRelevantLessons(workspaceRoot: string, keywords: string[]): Promise<string[]> {
	const content = await readClaudeBrain(workspaceRoot)
	if (!content) {
		return []
	}

	const lessons = parseLessons(content)

	if (keywords.length === 0) {
		return lessons.map((l) => l.content)
	}

	// Score lessons by keyword matches (case-insensitive)
	const scored = lessons.map((lesson) => {
		const lowerContent = lesson.content.toLowerCase()
		const lowerKeywords = keywords.map((k) => k.toLowerCase())
		const score = lowerKeywords.filter((keyword) => lowerContent.includes(keyword)).length
		return { lesson, score }
	})

	// Return lessons with at least one match, sorted by relevance
	return scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((s) => s.lesson.content)
}

/**
 * Get lessons by category
 * @param workspaceRoot - Root directory of the workspace
 * @param category - Lesson category to filter by
 * @returns Array of lesson content strings for the category
 */
export async function getLessonsByCategory(workspaceRoot: string, category: LessonCategory): Promise<string[]> {
	const content = await readClaudeBrain(workspaceRoot)
	if (!content) {
		return []
	}

	const lessons = parseLessons(content)
	return lessons.filter((lesson) => lesson.category === category).map((lesson) => lesson.content)
}

/**
 * Clear CLAUDE.md (for testing)
 * @param workspaceRoot - Root directory of the workspace
 */
export async function clearClaudeBrain(workspaceRoot: string): Promise<void> {
	const claudePath = getClaudePath(workspaceRoot)
	try {
		await fs.unlink(claudePath)
	} catch {
		// Ignore if doesn't exist
	}
}
