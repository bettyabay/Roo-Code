# Spec: AI-Native Git Layer for Intent-Code Traceability

**Feature:** 004-ai-native-git-layer  
**Status:** Draft  
**Constitution:** [.specify/memory/constitution.md](../../memory/constitution.md)  
**Depends on / extends:**

- [001-intent-orchestration](../001-intent-orchestration/spec.md) (orchestration layer and `.orchestration/` as source of truth)
- [002-intent-system](../002-intent-system/spec.md) (intent IDs, scope, `active_intents.yaml`)
- [003-hook-middleware-security](../003-hook-middleware-security/spec.md) (pre-hooks, write_file flow, intent scope)

---

## 1. Overview

Implement the **semantic tracking ledger** that creates an immutable, verifiable link between business intents and code changes. Phase 1 (Intent Selection) and Phase 2 (Security Boundary) are in place; Phase 3 adds **spatial hashing** (content-based, line-number-independent), **mutation classification**, an **append-only trace** (`agent_trace.jsonl`), and a **human-readable intent map** (`intent_map.md`). Every file write produces a trace entry with content hash and intent reference; the intent map stays in sync so stakeholders can see which files belong to which intent.

---

## 2. User stories

| ID   | As a…       | I want…                                                               | So that…                                                                |
| ---- | ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| US-1 | Developer   | code changes to be hashed by content, not line numbers                | moving or refactoring code does not break traceability                  |
| US-2 | Developer   | every mutation to be recorded with intent ID and content hash         | I can audit and verify which intent drove which change                  |
| US-3 | Developer   | mutation type to be recorded (refactor vs feature vs bug fix vs docs) | I can filter and analyze traces by change kind                          |
| US-4 | Stakeholder | a human-readable map of intents to files                              | I can see at a glance which files are touched by each intent            |
| US-5 | System      | trace to be append-only and machine-readable                          | tools and scripts can consume trace history without parsing ad-hoc logs |
| US-6 | System      | trace to include VCS revision (e.g. git SHA)                          | mutations are tied to a specific repository state                       |

---

## 3. Functional requirements

### 3.1 Spatial hashing

- **FR-1** The system MUST compute a **SHA-256 hash of code content**, not of line numbers or file paths. The hash MUST remain valid when code moves to different line numbers (spatial independence).
- **FR-2** Hashing MUST support **specific line ranges**: given full file content and `start_line` / `end_line` (1-based inclusive), the system MUST hash only the slice of content for that range. Normalization (e.g. line ending, trailing newline) MUST be consistent so the same logical content yields the same hash.
- **FR-3** The system MUST export:
    - **`sha256(content: string): string`** — returns a hex SHA-256 hash of the given string (e.g. for full file or a range slice).
    - **`computeContentHash(content: string, startLine: number, endLine: number): string`** — returns the hash of the content between `start_line` and `end_line` (inclusive). Out-of-range lines MUST be handled (e.g. clamp or return defined value); behavior MUST be documented.
- **FR-4** Hash format in the trace MUST use a **prefix** for clarity (e.g. `sha256:a8f5f167f44f4964e6c998dee827110c...`). The same content MUST always produce the same hash (deterministic).

### 3.2 Mutation classification

- **FR-5** The system MUST distinguish and record **mutation class** for each trace entry. Allowed values:
    - **`AST_REFACTOR`** — syntax or structure change, same intent (e.g. renaming, restructuring).
    - **`INTENT_EVOLUTION`** — new feature or changed behavior.
    - **`BUG_FIX`** — defect resolution.
    - **`DOCUMENTATION`** — comment or documentation-only changes.
- **FR-6** Mutation class MAY be **passed from the tool call** (e.g. optional parameter from the agent or UI). If not provided, the system MAY **infer** from context (e.g. file extension, diff heuristics) or default to a defined value (e.g. `INTENT_EVOLUTION`). Inference rules MUST be documented; default MUST be specified.
- **FR-7** The chosen mutation class MUST be stored in each trace entry and MUST be one of the four values above.

### 3.3 Trace schema (agent_trace.jsonl)

- **FR-8** Trace data MUST be stored in **`.orchestration/agent_trace.jsonl`**. Each line MUST be a single JSON object (JSONL format). The file MUST be **append-only** (entries are never modified or deleted by the system).
- **FR-9** Each trace entry MUST conform to the following schema (aligned with challenge specification):

```json
{
	"id": "uuid-v4",
	"timestamp": "2026-02-21T12:00:00Z",
	"vcs": { "revision_id": "git_sha_hash" },
	"files": [
		{
			"relative_path": "src/auth/middleware.ts",
			"conversations": [
				{
					"url": "session_log_id",
					"contributor": {
						"entity_type": "AI",
						"model_identifier": "claude-3-5-sonnet"
					},
					"ranges": [
						{
							"start_line": 15,
							"end_line": 45,
							"content_hash": "sha256:a8f5f167f44f4964e6c998dee827110c"
						}
					],
					"related": [
						{
							"type": "specification",
							"value": "INT-001"
						}
					]
				}
			]
		}
	],
	"mutation_class": "AST_REFACTOR"
}
```

- **FR-10** Field semantics:

    - **id**: UUID v4, unique per entry.
    - **timestamp**: ISO 8601 UTC (e.g. `2026-02-21T12:00:00Z`).
    - **vcs.revision_id**: Current VCS revision (e.g. `git rev-parse HEAD`); use `"unknown"` when not in a repo or when revision cannot be determined.
    - **files**: Array of file objects; each has **relative_path** (relative to workspace root) and **conversations**.
    - **conversations**: Array of conversation objects; each has **url** (session/conversation identifier), **contributor** (entity_type `"AI"`, model_identifier e.g. model name), **ranges** (array of { start_line, end_line, content_hash }), **related** (array of { type, value } linking to intent, e.g. type `"specification"`, value `"INT-001"`).
    - **mutation_class**: One of `AST_REFACTOR`, `INTENT_EVOLUTION`, `BUG_FIX`, `DOCUMENTATION`.

- **FR-11** All trace entries MUST link back to an **intent_id** via `related` (e.g. `{ "type": "specification", "value": "INT-001" }`). If no intent is active, the plan MUST define behavior (e.g. omit entry, or use a sentinel value).

### 3.4 Intent map (intent_map.md)

- **FR-12** The system MUST maintain **`.orchestration/intent_map.md`**: a human-readable Markdown mapping of intents to files. It MUST be updated automatically when files are modified under an intent (e.g. after a successful write that was traced).
- **FR-13** Format MUST be Markdown with:
    - A top-level heading: `# Intent Map`
    - One section per intent: `## INT-XXX: Intent title or description`
    - Under each section, a list of file paths (one per line, e.g. `- src/auth/middleware.ts`). Paths MUST be relative to workspace root. Duplicates per intent SHOULD be avoided; order is implementation-defined.
- **FR-14** Example:

```markdown
# Intent Map

## INT-001: JWT Authentication Migration

- src/auth/middleware.ts
- src/auth/jwt.ts

## INT-002: Weather API

- src/api/weather/service.ts
- tests/weather/api.test.ts
```

- **FR-15** When a file is written under an intent, that file MUST be added to (or already present in) that intent’s section in `intent_map.md`. Intent titles MAY be read from `active_intents.yaml` when available; otherwise the section heading MAY be `## INT-XXX` only.

### 3.5 Post-hook integration

- **FR-16** The **writeFilePostHook** (or equivalent post-hook for write operations) MUST:
    1. Compute the **content hash** of the changed range(s) for the written file (using the spatial hashing utilities).
    2. Build a **trace entry** with: id, timestamp, vcs.revision_id, files (with relative_path, conversations including ranges and content_hash, and related intent), and mutation_class.
    3. **Append** the entry to `.orchestration/agent_trace.jsonl` (one JSON object per line).
    4. **Update** `.orchestration/intent_map.md` so the written file is listed under the active intent.
- **FR-17** Post-hook execution MUST be **efficient**: no unnecessary file reads, and no blocking of the main tool flow. Performance MUST not degrade noticeably (e.g. append and intent-map update in the same order of magnitude as Phase 2).

### 3.6 Git integration

- **FR-18** The system MUST obtain the **current git revision ID** (e.g. `git rev-parse HEAD`) when writing a trace entry. Execution MUST be non-blocking where possible (e.g. spawn or cached value).
- **FR-19** When the workspace is **not** a git repository or revision cannot be determined, the trace MUST use a **fallback** value (e.g. `"unknown"`) for `vcs.revision_id`. The system MUST NOT fail the post-hook or the tool execution when git is unavailable.

---

## 4. Acceptance criteria (for this spec)

- [ ] Every file write (that goes through the write post-hook) generates a trace entry with content hash.
- [ ] Trace entries are append-only (never modified or deleted by the system).
- [ ] Content hashes are deterministic: same content (and range) yields the same hash.
- [ ] Mutation class is correctly recorded (from tool/context or inferred/default).
- [ ] `intent_map.md` stays in sync with file changes (updated when files are written under an intent).
- [ ] All traces link back to intent_id via `related` (e.g. type `specification`, value `INT-001`).
- [ ] Spatial independence: moving code to different lines preserves the hash of unchanged blocks.
- [ ] Tests verify hash consistency (same content → same hash; range extraction correct).
- [ ] Tests verify trace format (valid JSONL, required fields, allowed mutation_class values).
- [ ] Git revision is recorded when available; fallback to `"unknown"` when not in a repo.
- [ ] Constitution and 001/002/003 specs are not violated (`.orchestration/` source of truth, hook middleware pattern).

---

## 5. Constraints (from constitution)

- TypeScript strict mode; follow existing repo patterns.
- `.orchestration/` is source of truth for trace and intent map; do not duplicate trace data elsewhere.
- Hook middleware pattern: trace and intent-map updates happen in the post-hook pipeline, not ad-hoc.

---

## 6. Out of scope for this spec

- Full diff-based inference of mutation class (simple heuristics or default only).
- Trace query API or UI (consumption is file-based / external tooling).
- Purging or rotation of `agent_trace.jsonl` (retention policy is separate).
- Multiple VCS backends (git only for revision_id).
- Trace entries for operations other than file write (e.g. delete, command) — can be added in a follow-up.

---

## 7. Technical notes

### 7.1 Hashing implementation

- Use Node `crypto.createHash('sha256')` (or equivalent) for SHA-256. Normalize line endings (e.g. `\n`) before hashing when extracting ranges. Document whether trailing newline is included.

### 7.2 Ranges in trace

- For a full-file write, a single range may be `start_line: 1`, `end_line: number_of_lines`. For partial edits, the tool or post-hook should pass the affected line range(s); if not available, one range covering the whole file is acceptable.

### 7.3 Session / contributor

- **url**: May be task id, session id, or conversation id from the runtime. **contributor**: `entity_type: "AI"`, `model_identifier` from current model name if available.

### 7.4 Intent map updates

- Read current `intent_map.md`, parse sections by `## INT-XXX`, add or merge the file path under the active intent, write back. Preserve existing intents and ordering; avoid duplicate paths per intent.

---

## 8. Review & acceptance checklist

- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous
- [ ] Trace schema matches challenge specification
- [ ] Success criteria are measurable
- [ ] Aligned with constitution and 001/002/003 specs

---

_Next: run `/speckit.clarify` to resolve ambiguities, or `/speckit.plan` to produce the technical implementation plan (spatial hashing module, mutation classification, trace writer, intent-map updater, writeFilePostHook integration, git revision helper, tests)._
