/**
 * Trace models for `.orchestration/agent_trace.jsonl`.
 * Matches the challenge specification for intent–code traceability.
 */

/** Classification of a code mutation for traceability. */
export type MutationClass = "AST_REFACTOR" | "INTENT_EVOLUTION" | "BUG_FIX" | "DOCUMENTATION"

/** Allowed mutation class values (for validation). */
export const MUTATION_CLASSES: readonly MutationClass[] = [
	"AST_REFACTOR",
	"INTENT_EVOLUTION",
	"BUG_FIX",
	"DOCUMENTATION",
] as const

/**
 * Represents a range of lines in a file with its content hash.
 */
export interface TraceRange {
	/** Starting line number (1-based, inclusive). */
	start_line: number
	/** Ending line number (1-based, inclusive). */
	end_line: number
	/** SHA-256 hash of the content in this range (e.g. prefixed with `sha256:`). */
	content_hash: string
}

/**
 * Represents a contributor (AI or human).
 */
export interface TraceContributor {
	/** Type of contributor. */
	entity_type: "AI" | "HUMAN"
	/** Model identifier (for AI) or username (for human). */
	model_identifier?: string
}

/**
 * Represents a related entity (specification, requirement, etc.).
 */
export interface TraceRelated {
	/** Type of relation (e.g. links to intent ID). */
	type: "specification" | "requirement" | "issue" | "task"
	/** Value/ID of the related entity (e.g. intent ID like `INT-001`). */
	value: string
}

/**
 * Represents a conversation/session that produced changes.
 */
export interface TraceConversation {
	/** URL or ID of the conversation/session (e.g. task/session id). */
	url: string
	/** Who contributed this change. */
	contributor: TraceContributor
	/** Ranges of lines changed in this conversation. */
	ranges: TraceRange[]
	/** Related specifications or requirements (e.g. intent ID). */
	related: TraceRelated[]
}

/**
 * Represents a file that was modified.
 */
export interface TraceFile {
	/** Path relative to workspace root. */
	relative_path: string
	/** Conversations that modified this file. */
	conversations: TraceConversation[]
}

/**
 * Complete trace entry for one line in `agent_trace.jsonl`.
 */
export interface TraceEntry {
	/** UUID v4 for this trace. */
	id: string
	/** ISO 8601 timestamp (UTC). */
	timestamp: string
	/** VCS information. */
	vcs: {
		/** Git revision SHA, or `"unknown"` when not in a repo. */
		revision_id: string
	}
	/** Files modified in this operation. */
	files: TraceFile[]
	/** Classification of the mutation. */
	mutation_class?: MutationClass
}

/**
 * Validates a trace range object.
 */
function isValidTraceRange(r: unknown): r is TraceRange {
	if (!r || typeof r !== "object") return false
	const o = r as Record<string, unknown>
	return typeof o.start_line === "number" && typeof o.end_line === "number" && typeof o.content_hash === "string"
}

/**
 * Validates a trace contributor object.
 */
function isValidTraceContributor(c: unknown): c is TraceContributor {
	if (!c || typeof c !== "object") return false
	const o = c as Record<string, unknown>
	return (
		(o.entity_type === "AI" || o.entity_type === "HUMAN") &&
		(o.model_identifier === undefined || typeof o.model_identifier === "string")
	)
}

/**
 * Validates a trace related object.
 */
function isValidTraceRelated(r: unknown): r is TraceRelated {
	if (!r || typeof r !== "object") return false
	const o = r as Record<string, unknown>
	return (
		typeof o.type === "string" &&
		typeof o.value === "string" &&
		["specification", "requirement", "issue", "task"].includes(o.type)
	)
}

/**
 * Validates a trace conversation object.
 */
function isValidTraceConversation(c: unknown): c is TraceConversation {
	if (!c || typeof c !== "object") return false
	const o = c as Record<string, unknown>
	if (typeof o.url !== "string" || !Array.isArray(o.ranges) || !Array.isArray(o.related)) return false
	if (!isValidTraceContributor(o.contributor)) return false
	if (!(o.ranges as unknown[]).every(isValidTraceRange)) return false
	if (!(o.related as unknown[]).every(isValidTraceRelated)) return false
	return true
}

/**
 * Validates a trace file object.
 */
function isValidTraceFile(f: unknown): f is TraceFile {
	if (!f || typeof f !== "object") return false
	const o = f as Record<string, unknown>
	return (
		typeof o.relative_path === "string" &&
		Array.isArray(o.conversations) &&
		(o.conversations as unknown[]).every(isValidTraceConversation)
	)
}

/**
 * Validates that a value is a valid trace entry (all required fields and structure).
 *
 * @param entry - Value to validate (e.g. parsed from JSONL).
 * @returns Type guard: `true` if `entry` is a valid `TraceEntry`.
 */
export function isValidTraceEntry(entry: unknown): entry is TraceEntry {
	if (!entry || typeof entry !== "object") return false
	const o = entry as Record<string, unknown>
	if (typeof o.id !== "string" || typeof o.timestamp !== "string") return false
	if (!o.vcs || typeof (o.vcs as Record<string, unknown>).revision_id !== "string") return false
	if (!Array.isArray(o.files)) return false
	if (!(o.files as unknown[]).every(isValidTraceFile)) return false
	if (o.mutation_class !== undefined && !MUTATION_CLASSES.includes(o.mutation_class as MutationClass)) return false
	return true
}

/**
 * Creates a new trace entry with default values. Caller should set `id` (e.g. UUID v4) and `files`.
 *
 * @param overrides - Override default values (e.g. id, timestamp, vcs, files, mutation_class).
 * @returns A trace entry suitable for appending to `agent_trace.jsonl`.
 */
export function createTraceEntry(overrides?: Partial<TraceEntry>): TraceEntry {
	const now = new Date().toISOString()
	return {
		id: overrides?.id ?? "pending",
		timestamp: overrides?.timestamp ?? now,
		vcs: overrides?.vcs ?? { revision_id: "unknown" },
		files: overrides?.files ?? [],
		mutation_class: overrides?.mutation_class,
	}
}
