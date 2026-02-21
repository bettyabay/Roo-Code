# Implementation plan: AI-Native Git Layer for Intent-Code Traceability

**Feature:** 004-ai-native-git-layer  
**Spec:** [spec.md](./spec.md)  
**Constitution:** [.specify/memory/constitution.md](../../memory/constitution.md)

This plan implements the **semantic tracking ledger** (Phase 3): spatial hashing, mutation classification, append-only `agent_trace.jsonl`, and human-readable `intent_map.md`. A post-hook for `write_file` captures cryptographic hashes and updates traceability artifacts after each successful write.

---

## Architecture overview

We implement a **post-hook for write_file** that runs after the file is written:

1. **Hashing**: Compute SHA-256 of the written content (full file or ranges) via `src/hooks/utils/hashing.ts`.
2. **Git**: Resolve current revision via `src/hooks/utils/git.ts` (e.g. `git rev-parse HEAD`; fallback `"unknown"`).
3. **Trace**: Build a trace entry (schema in `src/hooks/models/trace.ts`), append one JSON line to `.orchestration/agent_trace.jsonl` via `src/hooks/utils/traceStorage.ts`.
4. **Intent map**: Update `.orchestration/intent_map.md` so the file is listed under the active intent via `src/hooks/utils/intentMap.ts`.
5. **Mutation class**: Use explicit value from tool call or infer via `src/hooks/utils/mutationClassifier.ts` (simple heuristics; default `INTENT_EVOLUTION`).

Session identifier and model name are passed via post-hook context (from `Task.sessionId` and provider/model info).

---

## Phase 0: Prerequisites and dependencies

### 0.1 Dependencies

- **uuid**: Already in `src/package.json` (`"uuid": "^11.1.0"`). Use `v4` for trace entry IDs: `import { v4 as uuidv4 } from "uuid"`.
- **crypto**: Node.js built-in. Use `crypto.createHash("sha256")` for hashing.
- **fs/promises**: Node.js built-in for reading/writing `.orchestration/agent_trace.jsonl` and `intent_map.md`.

No new package install required.

### 0.2 Session ID and context

- **Task**: Add `sessionId: string` (set once at task creation, e.g. `uuidv4()` or existing task id if available). Used as `conversations[].url` in trace.
- **Post-hook context**: Extend `WriteFilePostHookContext` to include `sessionId?: string`, `modelIdentifier?: string` so the trace can record contributor and session.

---

## Phase 1: Hashing utilities

### 1.1 Create hashing module

- **File**: `src/hooks/utils/hashing.ts` (new)
- **Purpose**: SHA-256 content hashing; range extraction for spatial hashing (line-number independent).

### 1.2 Implementation

- **`sha256(content: string): string`**

    - Normalize line endings to `\n` (optional but recommended for consistency).
    - Compute SHA-256 hex digest via `crypto.createHash("sha256").update(content, "utf8").digest("hex")`.
    - Return raw hex (caller adds `sha256:` prefix when writing to trace).

- **`computeContentHash(content: string, startLine?: number, endLine?: number): string`**

    - If `startLine` and `endLine` omitted (or invalid), hash entire `content`.
    - Otherwise: split content by `\n`, extract lines from `startLine` to `endLine` (1-based inclusive). Clamp to `[1, lines.length]`. Join with `\n`, then hash. Normalize line endings before hashing.
    - Return hex digest (no prefix); trace writer adds `sha256:`.

- **`computeFileHash(filePath: string): Promise<string>`**
    - Read file with `fs.promises.readFile(path, "utf8")`, then `sha256(content)`. Re-export or use for tests. Handle missing file (reject or return sentinel per spec).

### 1.3 Hash prefix for trace

- In trace storage, when writing `content_hash`, use format `sha256:<hex>` (e.g. `sha256:a8f5f167f44f4964e6c998dee827110c`).

### 1.4 Tests

- **File**: `src/hooks/utils/__tests__/hashing.spec.ts`
- **Cases**: Same content → same hash; range extraction (first line, last line, middle, out-of-range clamp); empty content; line-ending normalization; `computeFileHash` for existing file.

---

## Phase 2: Git utilities

### 2.1 Create git module

- **File**: `src/hooks/utils/git.ts` (new)
- **Purpose**: Get current VCS revision for trace `vcs.revision_id`.

### 2.2 Implementation

- **`getCurrentRevision(workspaceRoot: string): Promise<string>`**
    - Run `git rev-parse HEAD` in `workspaceRoot` (e.g. `child_process.execFile` or `execa` with `cwd: workspaceRoot`). Capture stdout (trimmed).
    - On error (not a repo, git not installed, etc.) return `"unknown"`. Do not throw.
    - Optional: short-lived in-memory cache keyed by `workspaceRoot` to avoid repeated spawns in same tick; TTL or no TTL as needed.

### 2.3 Tests

- **File**: `src/hooks/utils/__tests__/git.spec.ts`
- **Cases**: Mock exec; when git returns SHA, result is that SHA; when command fails, result is `"unknown"`; empty workspaceRoot behavior.

---

## Phase 3: Trace models and storage

### 3.1 Trace models

- **File**: `src/hooks/models/trace.ts` (new)
- **Interfaces** (match spec schema):
    - `TraceRange`: `{ start_line: number; end_line: number; content_hash: string }`
    - `TraceContributor`: `{ entity_type: "AI"; model_identifier: string }`
    - `TraceRelated`: `{ type: string; value: string }` (e.g. `type: "specification", value: "INT-001"`)
    - `TraceConversation`: `{ url: string; contributor: TraceContributor; ranges: TraceRange[]; related: TraceRelated[] }`
    - `TraceFile`: `{ relative_path: string; conversations: TraceConversation[] }`
    - `TraceEntry`: `{ id: string; timestamp: string; vcs: { revision_id: string }; files: TraceFile[]; mutation_class: MutationClass }`
- **MutationClass**: Type or enum: `"AST_REFACTOR" | "INTENT_EVOLUTION" | "BUG_FIX" | "DOCUMENTATION"`.
- **Validation**: Optional helper `validateTraceEntry(entry: unknown): entry is TraceEntry` (check required fields and types) for tests and storage.

### 3.2 Trace storage

- **File**: `src/hooks/utils/traceStorage.ts` (new)
- **`appendToTraceLog(workspaceRoot: string, entry: TraceEntry): Promise<void>`**
    - Path: `path.join(workspaceRoot, ".orchestration", "agent_trace.jsonl")`.
    - Ensure `.orchestration` directory exists (`fs.mkdir(..., { recursive: true })`).
    - Append one line: `JSON.stringify(entry) + "\n"` (no pretty-print). Use `fs.promises.appendFile`.
- **`readTraceLog(workspaceRoot: string): Promise<TraceEntry[]>`**
    - Read file; if missing, return `[]`. Split by newline, filter empty, parse each line with `JSON.parse`. Return array (for tests and tooling).

### 3.3 Tests

- **File**: `src/hooks/models/__tests__/trace.spec.ts` (or `utils/__tests__/traceStorage.spec.ts`): Build sample entry, validate shape, append then read back.

---

## Phase 4: Mutation classifier

### 4.1 Create mutation classifier module

- **File**: `src/hooks/utils/mutationClassifier.ts` (new)
- **Purpose**: Infer mutation class when not provided by tool call.

### 4.2 Implementation

- **Export enum or const**: `MutationClass`: `AST_REFACTOR`, `INTENT_EVOLUTION`, `BUG_FIX`, `DOCUMENTATION`.
- **`classifyMutation(oldContent: string, newContent: string): MutationClass`**
    - **DOCUMENTATION**: Heuristic: strip comments and whitespace from both; if resulting “code” is identical, return `DOCUMENTATION`. Or: if only lines that look like comments/docs changed (e.g. start with `//`, `/*`, `*`, `#`, `<!--`).
    - **AST_REFACTOR**: Heuristic: small structural change, same line count or similar; e.g. rename-only or reorder (could use simple diff: only identifier-like or whitespace changes). If hard to detect, can default to INTENT_EVOLUTION for now.
    - **BUG_FIX**: Heuristic: e.g. change set is small and touches conditional/error handling keywords; or leave for later.
    - **Default**: `INTENT_EVOLUTION`.
- Start with a simple implementation: if “only comment/docs lines changed” → `DOCUMENTATION`, else `INTENT_EVOLUTION`. Extend later with AST or better heuristics.

### 4.3 Tests

- **File**: `src/hooks/utils/__tests__/mutationClassifier.spec.ts`
- **Cases**: Comment-only change → DOCUMENTATION; code change → INTENT_EVOLUTION (or AST_REFACTOR if heuristic added).

---

## Phase 5: Intent map updater

### 5.1 Create intent map module

- **File**: `src/hooks/utils/intentMap.ts` (new)
- **Purpose**: Keep `.orchestration/intent_map.md` in sync when a file is written under an intent.

### 5.2 Implementation

- **`updateIntentMap(workspaceRoot: string, intentId: string, filePath: string): Promise<void>`**
    - Path: `path.join(workspaceRoot, ".orchestration", "intent_map.md")`.
    - Ensure `.orchestration` exists.
    - Read existing file; if missing, create content with `# Intent Map\n\n` and one section `## ${intentId}\n- ${filePath}\n`.
    - Parse: find section `## INT-XXX` (or `## ${intentId}`); if section exists, add `- ${filePath}` if not already in list (normalize path to relative, forward slashes). If section does not exist, append `\n## ${intentId}\n- ${filePath}\n`.
    - Write back entire file (no in-place patch required for simplicity). Deduplicate paths within same section.
- **`removeFromIntentMap(workspaceRoot: string, intentId: string, filePath: string): Promise<void>`**
    - Remove the line `- ${filePath}` from the intent’s section; if section empty, optionally remove section or leave empty. (Used for future use, e.g. delete_file.)

### 5.3 Intent title

- Optionally resolve intent title from `active_intents.yaml` (e.g. `findIntentById`) and use `## INT-001: Title` when available; otherwise `## INT-001`.

### 5.4 Tests

- **File**: `src/hooks/utils/__tests__/intentMap.spec.ts`
- **Cases**: New file → creates section; existing section → appends path; duplicate path not added; new intent → new section.

---

## Phase 6: writeFilePostHook implementation

### 6.1 Update writeFilePostHook

- **File**: `src/hooks/postHooks/writeFile.ts` (existing)
- **Imports**: hashing (`computeContentHash`, `sha256`), git (`getCurrentRevision`), trace models and storage (`appendToTraceLog`, TraceEntry, etc.), intent map (`updateIntentMap`), mutation classifier (`MutationClass`, `classifyMutation`), uuid v4.

### 6.2 Logic (after successful write)

1. **Intent**: If `context.intentId` is null/undefined, skip trace and intent-map update (or document: no trace when no intent).
2. **Revision**: `const revisionId = await getCurrentRevision(context.workspaceRoot ?? "")`.
3. **Ranges**: For a full-file write, use one range: `start_line: 1`, `end_line: content.split("\n").length`. Hash: `computeContentHash(content, 1, endLine)` with `sha256:` prefix.
4. **Mutation class**: If tool args include `mutation_class` and it’s valid, use it; else `classifyMutation(oldContent, content)` (if we had old content from read; otherwise default `INTENT_EVOLUTION`). For full-file write without old content, default `INTENT_EVOLUTION`.
5. **Build entry**:
    - `id`: `uuidv4()`
    - `timestamp`: `new Date().toISOString()` (UTC)
    - `vcs`: `{ revision_id: revisionId }`
    - `files`: `[{ relative_path: normalizePath(args.path, workspaceRoot), conversations: [{ url: context.sessionId ?? "", contributor: { entity_type: "AI", model_identifier: context.modelIdentifier ?? "unknown" }, ranges: [{ start_line, end_line, content_hash }], related: [{ type: "specification", value: context.intentId }] }] }]`
    - `mutation_class`: chosen value
6. **Append**: `await appendToTraceLog(workspaceRoot, entry)`.
7. **Intent map**: `await updateIntentMap(workspaceRoot, context.intentId, args.path)`.
8. Do not throw: catch errors, log, and avoid failing the tool result (post-hook is side-effect only).

### 6.3 Context extension

- **WriteFilePostHookContext** (in `writeFile.ts`): Add `sessionId?: string`, `modelIdentifier?: string`. Callers in `presentAssistantMessage` pass `cline.sessionId`, and model from `cline.cachedStreamingModel?.id` or equivalent.

---

## Phase 7: Task and caller updates

### 7.1 Task: sessionId

- **File**: `src/core/task/Task.ts`
- Add `sessionId: string` (e.g. set in constructor or at task creation: `this.sessionId = crypto.randomUUID()` or `uuidv4()`). Use a single stable id per task for the trace `url` field.

### 7.2 presentAssistantMessage: post-hook context

- **File**: `src/core/assistant-message/presentAssistantMessage.ts`
- When calling `writeFilePostHook`, pass:
    - `sessionId: cline.sessionId` (or task id if preferred),
    - `modelIdentifier: cline.cachedStreamingModel?.id ?? "unknown"` (or from provider),
    - `intentId`, `workspaceRoot` (already passed).

### 7.3 Tool schema: optional mutation_class

- **File**: `src/core/prompts/tools/native-tools/write_to_file.ts`
- Add optional parameter `mutation_class`: `{ type: "string", enum: ["AST_REFACTOR", "INTENT_EVOLUTION", "BUG_FIX", "DOCUMENTATION"], description: "Optional. Type of change for traceability." }`. Do not add to `required`. If present in tool call, post-hook uses it; otherwise infer or default.

---

## Phase 8: Integration tests and documentation

### 8.1 Integration tests

- **File**: `test/phase3/integration/traceability.test.ts` (or under `src/__tests__/phase3/`)
- **Scenarios**: Write file with intent → `agent_trace.jsonl` has one entry with correct hash and intent in `related`; `intent_map.md` contains the file under the intent. No intent → no trace (or defined behavior). Hash determinism: same content → same hash in two writes.

### 8.2 Documentation

- Update `ARCHITECTURE_NOTES.md` or add `docs/phase3/traceability.md`: describe `agent_trace.jsonl` schema, `intent_map.md` format, and how the post-hook ties them together. Document mutation_class semantics and default.

---

## File creation/modification summary

### New files

| File                                                                        | Purpose                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/hooks/utils/hashing.ts`                                                | `sha256`, `computeContentHash`, `computeFileHash` |
| `src/hooks/utils/git.ts`                                                    | `getCurrentRevision(workspaceRoot)`               |
| `src/hooks/models/trace.ts`                                                 | Trace types and MutationClass                     |
| `src/hooks/utils/traceStorage.ts`                                           | `appendToTraceLog`, `readTraceLog`                |
| `src/hooks/utils/mutationClassifier.ts`                                     | `MutationClass`, `classifyMutation`               |
| `src/hooks/utils/intentMap.ts`                                              | `updateIntentMap`, `removeFromIntentMap`          |
| `src/hooks/utils/__tests__/hashing.spec.ts`                                 | Hashing tests                                     |
| `src/hooks/utils/__tests__/git.spec.ts`                                     | Git revision tests                                |
| `src/hooks/utils/__tests__/traceStorage.spec.ts`                            | Append/read trace tests                           |
| `src/hooks/utils/__tests__/mutationClassifier.spec.ts`                      | Classification tests                              |
| `src/hooks/utils/__tests__/intentMap.spec.ts`                               | Intent map tests                                  |
| `test/phase3/integration/traceability.test.ts` (or `src/__tests__/phase3/`) | Integration tests                                 |

### Modified files

| File                                                    | Changes                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/hooks/postHooks/writeFile.ts`                      | Implement post-hook: hash, build entry, append trace, update intent map |
| `src/hooks/postHooks/writeFile.ts`                      | Extend `WriteFilePostHookContext` with `sessionId`, `modelIdentifier`   |
| `src/core/task/Task.ts`                                 | Add `sessionId: string`                                                 |
| `src/core/assistant-message/presentAssistantMessage.ts` | Pass `sessionId`, `modelIdentifier` into `writeFilePostHook`            |
| `src/core/prompts/tools/native-tools/write_to_file.ts`  | Optional `mutation_class` in parameters                                 |

---

## Implementation sequence

1. **Phase 1**: Hashing utilities + tests
2. **Phase 2**: Git utilities + tests
3. **Phase 3**: Trace models + trace storage + tests
4. **Phase 4**: Mutation classifier + tests
5. **Phase 5**: Intent map updater + tests
6. **Phase 6**: writeFilePostHook implementation
7. **Phase 7**: Task sessionId, presentAssistantMessage context, write_to_file schema
8. **Phase 8**: Integration tests and documentation

---

## Technical decisions

- **Trace ID**: UUID v4 via `uuid` package (already present).
- **Hash**: Node `crypto.createHash("sha256")`; prefix `sha256:` in trace only.
- **Revision**: `git rev-parse HEAD`; on failure use `"unknown"` so post-hook never fails.
- **Mutation class**: Optional from tool; else simple heuristics (comment-only → DOCUMENTATION, else INTENT_EVOLUTION); can enhance with AST later.
- **JSONL**: One JSON object per line for append-only, streaming-friendly format.
- **Intent map**: Full file read/parse/write; dedupe paths per section.
- **Performance**: Post-hook is fire-and-forget (already `.catch` in caller); keep append and intent-map update fast (< ~50ms typical).

---

_This plan implements the AI-Native Git layer (Phase 3) for intent–code traceability with spatial hashing, mutation classification, and append-only trace plus intent map._
