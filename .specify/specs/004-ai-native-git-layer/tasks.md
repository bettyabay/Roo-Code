# Tasks: 004-ai-native-git-layer

**Spec:** [spec.md](./spec.md)  
**Plan:** [plan.md](./plan.md)  
**Constitution:** [.specify/memory/constitution.md](../../memory/constitution.md)  
**Depends on:** [003-hook-middleware-security](../003-hook-middleware-security/spec.md) (Phase 2: write_file pre-hook, post-hook hook point)

Executable tasks for implementing the AI-Native Git Layer (Phase 3): spatial hashing, trace storage, intent map, mutation classification, and writeFilePostHook integration.

---

## Task 3.1: Create Hashing Utilities

**File:** `src/hooks/utils/hashing.ts` (new)  
**Status:** ✅ Done

### Description

Create a utility module for SHA-256 content hashing with optional line-range extraction (spatial hashing). Exports `sha256`, `computeContentHash`, and `computeFileHash`.

### Implementation steps

1. Create `src/hooks/utils/hashing.ts`; use Node `crypto.createHash("sha256")`.
2. Implement `sha256(content: string): string` — normalize line endings to `\n`, return 64-char hex digest (no prefix).
3. Implement `computeContentHash(content: string, startLine?: number, endLine?: number): string` — if no range, hash entire content; else extract lines (1-based inclusive), clamp to valid range, join with `\n`, hash. Return 64-char hex.
4. Implement `computeFileHash(filePath: string): Promise<string>` — read file with `fs.promises.readFile`, then `sha256(content)`.
5. Add unit tests in `src/hooks/utils/__tests__/hashing.spec.ts`.

### Acceptance criteria

- ✅ `sha256` returns consistent 64-char hex hash.
- ✅ `computeContentHash` with no range hashes entire content.
- ✅ `computeContentHash` with range hashes only specified lines.
- ✅ `computeFileHash` reads file and returns hash.
- ✅ Unit tests verify hash consistency.
- ✅ Different content → different hashes.
- ✅ Same content → same hash.

### Dependencies

- None (crypto, fs built-in).

---

## Task 3.2: Create Git Utilities

**File:** `src/hooks/utils/git.ts` (new)  
**Status:** ✅ Done

### Description

Get current git revision for trace `vcs.revision_id`; fallback to `"unknown"` when not in a repo or when git is unavailable.

### Implementation steps

1. Create `src/hooks/utils/git.ts`.
2. Implement `getCurrentRevision(workspaceRoot: string): Promise<string>` — run `git rev-parse HEAD` with `cwd: workspaceRoot` (e.g. `execa` or `child_process`). Trim stdout; on error return `"unknown"` (do not throw).
3. Handle non-git directories (e.g. `ENOENT` or git error) → return `"unknown"`.
4. Handle git not installed (e.g. spawn error) → return `"unknown"`.
5. Optional: cache revision per `workspaceRoot` for performance (short TTL or same-tick).
6. Add unit tests in `src/hooks/utils/__tests__/git.spec.ts` with mock git commands.

### Acceptance criteria

- ✅ `getCurrentRevision` returns git SHA when in a git repo.
- ✅ Handles non-git repos gracefully (returns `"unknown"`).
- ✅ Handles git not installed (returns `"unknown"`).
- ✅ Caches revision for performance (optional).
- ✅ Unit tests with mock git commands.

### Dependencies

- None (execa or child_process; align with repo patterns).

---

## Task 3.3: Create Trace Models

**File:** `src/hooks/models/trace.ts` (new)  
**Status:** ✅ Done

### Description

Define TypeScript interfaces for the trace schema matching the challenge specification. Export types and validation helpers.

### Implementation steps

1. Create `src/hooks/models/trace.ts`.
2. Export interfaces: `TraceRange`, `TraceContributor`, `TraceRelated`, `TraceConversation`, `TraceFile`, `TraceEntry` — all matching challenge schema (id, timestamp, vcs.revision_id, files[].relative_path, conversations[].url, contributor, ranges[].content_hash, related, mutation_class).
3. Export `MutationClass` type or enum: `AST_REFACTOR` | `INTENT_EVOLUTION` | `BUG_FIX` | `DOCUMENTATION`.
4. Add JSDoc comments to all exported types and fields.
5. Add validation helpers: e.g. `isValidTraceEntry(entry: unknown): entry is TraceEntry`, and helpers for nested types if useful.

### Acceptance criteria

- ✅ All interfaces match challenge schema.
- ✅ Export types for `TraceEntry`, `TraceFile`, `TraceConversation`, `TraceRange` (and related).
- ✅ Include JSDoc comments.
- ✅ Validation helpers (e.g. `isValidTraceEntry`, etc.).

### Dependencies

- None.

---

## Task 3.4: Create Trace Storage

**File:** `src/hooks/utils/traceStorage.ts` (new)  
**Status:** ✅ Done

### Description

Append-only JSONL write and read for `.orchestration/agent_trace.jsonl`. Safe for concurrent appends.

### Implementation steps

1. Create `src/hooks/utils/traceStorage.ts`.
2. Implement `appendToTraceLog(workspaceRoot: string, entry: TraceEntry): Promise<void>`:
    - Ensure `.orchestration` exists (`fs.mkdir(..., { recursive: true })`).
    - Create `agent_trace.jsonl` if it does not exist (e.g. first append).
    - Append one line: `JSON.stringify(entry) + "\n"` (use `fs.promises.appendFile`). Optionally use a lock or atomic append to handle concurrent writes safely.
3. Implement `readTraceLog(workspaceRoot: string): Promise<TraceEntry[]>` — read file; if missing return `[]`; split by newline, filter empty, parse each line with `JSON.parse`.
4. Add unit tests in `src/hooks/utils/__tests__/traceStorage.spec.ts` using temp directories/files.

### Acceptance criteria

- ✅ `appendToTraceLog` creates file if not exists.
- ✅ Appends one JSON object per line (JSONL).
- ✅ Handles concurrent writes safely (e.g. append-only, no read-modify-write of full file).
- ✅ `readTraceLog` parses JSONL correctly.
- ✅ Unit tests with temp files.

### Dependencies

- Task 3.3 (Trace models).

---

## Task 3.5: Create Mutation Classifier

**File:** `src/hooks/utils/mutationClassifier.ts` (new)  
**Status:** ✅ Done

### Description

Classify mutation type from old/new content for trace `mutation_class`. Supports DOCUMENTATION, AST_REFACTOR, INTENT_EVOLUTION, BUG_FIX.

### Implementation steps

1. Create `src/hooks/utils/mutationClassifier.ts`.
2. Export `MutationClass` enum: `AST_REFACTOR`, `INTENT_EVOLUTION`, `BUG_FIX`, `DOCUMENTATION`.
3. Implement `classifyMutation(oldContent: string, newContent: string): MutationClass`:
    - **DOCUMENTATION**: Detect comments-only or docs-only changes (e.g. only lines that are comments/docs changed).
    - **AST_REFACTOR**: Detect structural changes with same behavior (e.g. rename, reorder, format; heuristics or simple diff).
    - **INTENT_EVOLUTION**: New or changed code (new logic, new features).
    - **BUG_FIX**: Pattern-based (e.g. small change touching conditionals, error handling, assertions).
4. Add unit tests in `src/hooks/utils/__tests__/mutationClassifier.spec.ts` with various diffs (comment-only, structural, new code, bug-fix-like).

### Acceptance criteria

- ✅ Export `MutationClass` enum.
- ✅ `classifyMutation` detects DOCUMENTATION changes (comments only).
- ✅ `classifyMutation` detects AST_REFACTOR (structural with same behavior).
- ✅ `classifyMutation` detects INTENT_EVOLUTION (new code).
- ✅ `classifyMutation` detects BUG_FIX (pattern-based).
- ✅ Unit tests with various diffs.

### Dependencies

- None (or reuse MutationClass from trace model if preferred).

---

## Task 3.6: Create Intent Map Updater

**File:** `src/hooks/utils/intentMap.ts` (new)  
**Status:** ✅ Done

### Description

Update `.orchestration/intent_map.md` when files are written under an intent; support multiple files per intent and removal.

### Implementation steps

1. Create `src/hooks/utils/intentMap.ts`.
2. Implement `updateIntentMap(workspaceRoot: string, intentId: string, filePath: string): Promise<void>`:
    - Ensure `.orchestration` exists.
    - If `intent_map.md` does not exist, create it with `# Intent Map\n\n` and section `## ${intentId}\n- ${filePath}\n`.
    - Otherwise read file, parse markdown sections (`## INT-XXX` or `## intentId`), add `- ${filePath}` under the matching section if not already present (dedupe). Normalize path (relative, forward slashes). Write back full file.
3. Implement `removeFromIntentMap(workspaceRoot: string, intentId: string, filePath: string): Promise<void>` — remove the line `- ${filePath}` from the intent’s section; if section becomes empty, optionally remove section or leave empty.
4. Add unit tests in `src/hooks/utils/__tests__/intentMap.spec.ts` with markdown parsing (new file, add path, no duplicates, multiple files per intent, remove).

### Acceptance criteria

- ✅ `updateIntentMap` creates file if not exists.
- ✅ Adds file path under correct intent section.
- ✅ Does not create duplicates.
- ✅ Handles multiple files per intent.
- ✅ `removeFromIntentMap` removes file paths.
- ✅ Unit tests with markdown parsing.

### Dependencies

- None.

---

## Task 3.7: Update writeFilePostHook

**File:** `src/hooks/postHooks/writeFile.ts` (update)  
**Status:** ✅ Done

### Description

Implement the full post-hook: generate trace entry (UUID v4, git revision, content hash, intent_id), append to agent_trace.jsonl, update intent_map.md. Handle errors gracefully.

### Implementation steps

1. Import hashing (`computeContentHash`, `sha256`), git (`getCurrentRevision`), trace types and `appendToTraceLog`, intent map (`updateIntentMap`), mutation classifier, `uuid` v4.
2. Extend `WriteFilePostHookContext` with `sessionId?: string`, `modelIdentifier?: string`.
3. In `writeFilePostHook`:
    - If `context.intentId` missing, skip trace and intent map (no-op).
    - Generate trace id: `uuidv4()`.
    - Get git revision: `await getCurrentRevision(workspaceRoot ?? "")`.
    - Compute content hash of written content: one range `start_line: 1`, `end_line: content.split("\n").length`; `content_hash`: `"sha256:" + computeContentHash(content, 1, endLine)`.
    - Resolve mutation_class: from args if valid, else from classifier (if old content available) or default (per Task 3.8, default AST_REFACTOR when not specified).
    - Build full trace entry: id, timestamp (ISO UTC), vcs.revision_id, files[].relative_path, conversations[].url (sessionId), contributor (modelIdentifier), ranges, related (type `"specification"`, value intentId), mutation_class.
    - `await appendToTraceLog(workspaceRoot, entry)`.
    - `await updateIntentMap(workspaceRoot, intentId, args.path)`.
    - Wrap in try/catch; on error log only, do not throw (post-hook must not block tool result).
4. Add unit tests with mocked dependencies (hashing, git, traceStorage, intentMap).

### Acceptance criteria

- ✅ Generates UUID v4 for each trace.
- ✅ Gets git revision from git utility.
- ✅ Computes content hash of written content.
- ✅ Creates complete trace entry with intent_id (in `related`).
- ✅ Appends to agent_trace.jsonl.
- ✅ Updates intent_map.md.
- ✅ Handles errors gracefully (logs but doesn’t block).
- ✅ Unit tests with mocked dependencies.

### Dependencies

- Tasks 3.1, 3.2, 3.3, 3.4, 3.5, 3.6.

---

## Task 3.8: Add mutation_class to Tool Schema

**Files:** `src/core/prompts/tools/native-tools/write_to_file.ts`, `src/core/assistant-message/presentAssistantMessage.ts`  
**Status:** ☐ Not started

### Description

Add optional `mutation_class` parameter to write_to_file tool schema; pass value through to post-hook; default to AST_REFACTOR when not specified.

### Implementation steps

1. In `write_to_file.ts`: add optional property `mutation_class`: `{ type: "string", enum: ["AST_REFACTOR", "INTENT_EVOLUTION", "BUG_FIX", "DOCUMENTATION"], description: "Optional. Type of change for traceability." }`. Do not add to `required` array. Ensure `additionalProperties` allows or explicitly includes `mutation_class` if using strict schema.
2. In `presentAssistantMessage.ts`: when calling `writeFilePostHook`, pass `mutation_class` from tool params (e.g. `writeParams.mutation_class`) in args or context so the post-hook can read it.
3. In `writeFilePostHook`: when `mutation_class` is not provided or invalid, use default **AST_REFACTOR** (not INTENT_EVOLUTION).

### Acceptance criteria

- ✅ Tool schema includes optional `mutation_class` parameter.
- ✅ Value is passed through to post-hook.
- ✅ Defaults to AST_REFACTOR if not specified.

### Dependencies

- Task 3.7 (post-hook reads mutation_class).

---

## Task 3.9: Add Session ID to Task

**Files:** `src/core/task/Task.ts`, `src/hooks/postHooks/writeFile.ts`  
**Status:** ☐ Not started

### Description

Generate a unique session ID per task and pass it to the post-hook so trace entries can record conversation.url.

### Implementation steps

1. In `Task.ts`: add property `sessionId: string`. Set it on task creation (e.g. in constructor or factory: `crypto.randomUUID()` or `uuidv4()`). Must be stable for the lifetime of the task.
2. In `writeFile.ts`: ensure `WriteFilePostHookContext` includes `sessionId?: string` (already in Task 3.7).
3. In `presentAssistantMessage.ts`: when calling `writeFilePostHook`, pass `sessionId: cline.sessionId` in context.
4. In `writeFilePostHook`: use `context.sessionId` for trace entry `conversations[].url`.

### Acceptance criteria

- ✅ Task generates unique sessionId on creation.
- ✅ Session ID passed to post-hook context.
- ✅ Used in trace entry’s `conversation.url`.

### Dependencies

- Task 3.7 (context and trace building).

---

## Task 3.10: Write Integration Tests

**File:** `test/phase3/integration/traceability.test.ts` (new)  
**Status:** ☐ Not started

### Description

End-to-end tests for Phase 3: full trace generation flow, agent_trace.jsonl format, intent_map.md updates, multiple writes, mutation classes, error handling.

### Implementation steps

1. Create `test/phase3/integration/traceability.test.ts` (or `src/__tests__/phase3/integration/traceability.test.ts` if tests run from src). Use temp workspace and fixtures (e.g. similar to phase2 fixtures: setupTestWorkspace, cleanupTestWorkspace, create `.orchestration` and optional `active_intents.yaml`).
2. Test: single write with intent → one trace entry in agent_trace.jsonl; entry has id, timestamp, vcs.revision_id, files[].conversations[].ranges[].content_hash, related with intent_id, mutation_class; intent_map.md contains file under intent section.
3. Test: multiple writes (same or different intents) → multiple entries; intent_map has all files under correct intents.
4. Test: different mutation_class values (when passed or default) → correct mutation_class in entries.
5. Test: write without intent → no trace entry and no intent_map update (or defined behavior).
6. Test: error handling — e.g. invalid workspace, git unavailable — post-hook does not throw; trace may be skipped or use "unknown" revision.
7. Optionally: same content → same content_hash in two entries (determinism).

### Acceptance criteria

- ✅ Tests full trace generation flow.
- ✅ Verifies agent_trace.jsonl format.
- ✅ Verifies intent_map.md updates.
- ✅ Tests with multiple writes.
- ✅ Tests with different mutation classes.
- ✅ Tests error handling.

### Dependencies

- Tasks 3.1–3.9.

---

## Task 3.11: Update Documentation

**Files:** `docs/phase3/traceability.md` (new), `README.md`, `ARCHITECTURE_NOTES.md`  
**Status:** ☐ Not started

### Description

Document Phase 3 traceability: trace schema, content hashing, example agent_trace.jsonl, and troubleshooting.

### Implementation steps

1. Create `docs/phase3/traceability.md`:
    - Overview of Phase 3 (AI-Native Git layer, intent–code traceability).
    - Trace schema: description of agent_trace.jsonl (id, timestamp, vcs, files, conversations, ranges, content_hash, related, mutation_class). Include example JSON/JSONL snippet.
    - Content hashing: how spatial hashing works (SHA-256 of content, range support, sha256: prefix); same content → same hash.
    - Intent map: format of intent_map.md (# Intent Map, ## INT-XXX, - path).
    - Mutation classes: AST_REFACTOR, INTENT_EVOLUTION, BUG_FIX, DOCUMENTATION and when they are used.
    - Troubleshooting: common issues (e.g. no trace when no intent, "unknown" revision, file not in intent map).
2. Update `README.md`: add short section or link to Phase 3 / traceability (e.g. "Intent–code traceability" or "Agent trace").
3. Update `ARCHITECTURE_NOTES.md`: document post-hook flow, .orchestration/agent_trace.jsonl and intent_map.md, and how they tie to intent selection and write_file.

### Acceptance criteria

- ✅ Documents trace schema.
- ✅ Explains content hashing.
- ✅ Shows example agent_trace.jsonl.
- ✅ Includes troubleshooting guide.
- ✅ README and ARCHITECTURE_NOTES updated.

### Dependencies

- Tasks 3.1–3.10 (implementation complete).

---

## Implementation sequence

1. **Task 3.1** — Create Hashing Utilities
2. **Task 3.2** — Create Git Utilities
3. **Task 3.3** — Create Trace Models
4. **Task 3.4** — Create Trace Storage
5. **Task 3.5** — Create Mutation Classifier
6. **Task 3.6** — Create Intent Map Updater
7. **Task 3.7** — Update writeFilePostHook
8. **Task 3.8** — Add mutation_class to Tool Schema
9. **Task 3.9** — Add Session ID to Task
10. **Task 3.10** — Write Integration Tests
11. **Task 3.11** — Update Documentation

---

## Status legend

- ☐ Not started
- ☑ In progress
- ✅ Done

Update task status in this file as you implement.
