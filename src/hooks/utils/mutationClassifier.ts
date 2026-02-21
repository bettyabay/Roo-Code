/**
 * Classification of code mutations for traceability.
 */

export enum MutationClass {
	/** Syntax or structure change, same intent (renaming, restructuring). */
	AST_REFACTOR = "AST_REFACTOR",
	/** New feature or changed behavior. */
	INTENT_EVOLUTION = "INTENT_EVOLUTION",
	/** Defect resolution. */
	BUG_FIX = "BUG_FIX",
	/** Comments or documentation-only changes. */
	DOCUMENTATION = "DOCUMENTATION",
}

const BUG_FIX_PATTERNS = [
	/fix(e[ds])?|bug|issue|repair|patch/i,
	/undefined|null|error|exception|crash/i,
	/should|expected|actual|assert/i,
]

/**
 * Strips comment lines and block comments from code for comparison.
 */
function removeComments(code: string): string {
	return code
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "")
		.replace(/^\s*\*.*$/gm, "")
		.trim()
}

/**
 * Returns true if the only changes between old and new content are in comments/docs.
 */
function isDocumentationChange(oldContent: string, newContent: string): boolean {
	const oldCode = removeComments(oldContent)
	const newCode = removeComments(newContent)
	return oldCode === newCode && oldContent !== newContent
}

/**
 * Returns true if the diff text matches bug-fix-like patterns.
 */
function isBugFix(diff: string): boolean {
	return BUG_FIX_PATTERNS.some((pattern) => pattern.test(diff))
}

/**
 * Classifies a code mutation based on before/after content using heuristics.
 *
 * @param oldContent - Original file content
 * @param newContent - New file content
 * @returns Classification of the mutation
 */
export function classifyMutation(oldContent: string, newContent: string): MutationClass {
	if (oldContent === newContent) {
		return MutationClass.DOCUMENTATION
	}

	if (isDocumentationChange(oldContent, newContent)) {
		return MutationClass.DOCUMENTATION
	}

	const lines = newContent.split("\n")
	const oldLines = oldContent.split("\n")
	const added = lines.filter((l) => !oldLines.includes(l)).join("\n")
	const removed = oldLines.filter((l) => !lines.includes(l)).join("\n")
	const diff = `+${added}\n-${removed}`

	if (isBugFix(diff)) {
		return MutationClass.BUG_FIX
	}

	const oldLen = oldContent.length || 1
	const sizeChange = Math.abs(newContent.length - oldContent.length) / oldLen
	if (sizeChange > 0.2) {
		return MutationClass.INTENT_EVOLUTION
	}

	return MutationClass.AST_REFACTOR
}

/**
 * Returns the mutation class to use: explicit value if valid, otherwise inferred from content.
 *
 * @param explicitClass - Value from tool parameters (e.g. write_to_file mutation_class)
 * @param oldContent - Original content (for inference when explicit is missing/invalid)
 * @param newContent - New content (for inference)
 * @returns Mutation class to record in trace
 */
export function getMutationClass(
	explicitClass: string | undefined,
	oldContent: string,
	newContent: string,
): MutationClass {
	if (explicitClass && Object.values(MutationClass).includes(explicitClass as MutationClass)) {
		return explicitClass as MutationClass
	}
	return classifyMutation(oldContent, newContent)
}
