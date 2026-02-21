# Spec: Parallel Orchestration for Multi-Agent Collaboration

**Feature:** 005-parallel-orchestration  
**Status:** Draft  
**Constitution:** [.specify/memory/constitution.md](../../memory/constitution.md)  
**Depends on / extends:**

- [001-intent-orchestration](../001-intent-orchestration/spec.md) (orchestration layer and `.orchestration/` as source of truth)
- [002-intent-system](../002-intent-system/spec.md) (intent IDs, scope, `active_intents.yaml`)
- [003-hook-middleware-security](../003-hook-middleware-security/spec.md) (pre-hooks, write_file flow, intent scope)
- [004-ai-native-git-layer](../004-ai-native-git-layer/spec.md) (traceability, content hashing, mutation classification)

---

## 1. Overview

Implement **parallel orchestration** that enables multiple AI agents to work simultaneously on the same codebase without conflicts. Phase 1 (Intent Selection), Phase 2 (Security Boundary), and Phase 3 (Traceability) are in place; Phase 4 adds **optimistic locking** for conflict detection, **file state tracking** for concurrent access management, **lesson recording** for shared knowledge, and a **shared brain** (`CLAUDE.md`) that accumulates project knowledge across all agent sessions. Agents can work in parallel on different files, detect conflicts when modifying the same file, and learn from each other's mistakes through the shared knowledge base.

---

## 2. User stories

| ID   | As a…     | I want…                                                                    | So that…                                                                       |
| ---- | --------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| US-1 | Developer | multiple agents to work on different files simultaneously                  | I can parallelize work across multiple tasks or features                       |
| US-2 | Developer | agents to detect when another agent modified a file they're working on     | conflicts are caught early and agents can merge changes instead of overwriting |
| US-3 | Developer | agents to automatically learn from failures (linter errors, test failures) | common mistakes are captured and shared across all agent sessions              |
| US-4 | Developer | a central knowledge base that grows with project insights                  | agents become smarter over time and avoid repeating past mistakes              |
| US-5 | System    | file locks to timeout automatically                                        | deadlocks are prevented and stale locks don't block agents indefinitely        |
| US-6 | System    | conflict detection to force agents to re-read files before writing         | agents always work with the latest file content                                |
| US-7 | Developer | lessons to be categorized and timestamped                                  | I can understand when and why certain patterns or solutions were discovered    |

---

## 3. Functional requirements

### 3.1 Optimistic Locking

- **FR-1** Each agent session MUST take a **snapshot** of file hashes when it starts working on a file. The snapshot MUST include:
    - File path (normalized relative to workspace root)
    - Content hash (SHA-256, matching Phase 3 format: `sha256:...`)
    - Agent session ID
    - Timestamp when snapshot was taken
- **FR-2** Before executing a write operation, the system MUST verify that the current file hash matches the snapshot hash. If the hashes match, the write MAY proceed. If the hashes differ, the write MUST be blocked with a "Stale File" error.
- **FR-3** When a "Stale File" error occurs, the system MUST:
    - Return a structured error message indicating the file was modified by another agent
    - Include the current file hash and the snapshot hash
    - Suggest that the agent re-read the file and merge changes
    - Provide the agent session ID that last modified the file (if available)
- **FR-4** File snapshots MUST be tracked per-agent-session. Multiple agents MAY have snapshots for the same file if they are working on different parts or at different times. The system MUST track which agent owns each snapshot.
- **FR-5** Snapshot verification MUST occur in the `writeFilePreHook` (or equivalent pre-hook for write operations). The verification MUST happen after scope validation (Phase 2) but before the actual write operation.

### 3.2 File State Tracker

- **FR-6** The system MUST maintain an **in-memory map** of file paths to state information. The map structure MUST be:
    ```
    Map<filePath, {
      hash: string,           // Current content hash (sha256:...)
      agentId: string,        // Agent session ID that last modified
      timestamp: ISO8601,     // When the file was last modified
      snapshots: Map<agentId, {
        hash: string,         // Snapshot hash
        timestamp: ISO8601    // When snapshot was taken
      }>
    }>
    ```
- **FR-7** Agents MUST register files they are working on by calling a registration function (e.g. `registerFileSnapshot(filePath, agentId, hash)`). Registration MUST occur:
    - When an agent reads a file for the first time in a session
    - Before any write operation (to establish baseline)
    - Automatically via pre-hooks for read operations
- **FR-8** The system MUST provide a verification function (e.g. `verifyFileSnapshot(filePath, agentId, expectedHash): boolean`) that:
    - Checks if the current file hash matches the agent's snapshot hash
    - Returns `true` if matches, `false` if mismatch
    - Updates the file state map with current hash and timestamp if verification passes
- **FR-9** Stale snapshots MUST be cleaned up automatically:
    - Snapshots older than a configurable timeout (default: 1 hour) MUST be removed
    - Cleanup MUST run periodically (e.g. every 5 minutes) or on-demand
    - Cleanup MUST NOT affect active agent sessions (only remove snapshots for inactive agents)

### 3.3 Lesson Recording

- **FR-10** The system MUST provide a new tool: `record_lesson(category: string, lesson: string)`. The tool MUST:
    - Accept a category (e.g. "LINTER", "TEST", "BUILD", "USER_FEEDBACK", "ARCHITECTURE")
    - Accept a lesson description (string, may contain markdown)
    - Append the lesson to `.orchestration/CLAUDE.md` with proper formatting
- **FR-11** Lesson format MUST be:
    ```markdown
    ## [CATEGORY] YYYY-MM-DD HH:MM

    ## Lesson description with details
    ```
    - Category MUST be uppercase and enclosed in square brackets
    - Timestamp MUST be in ISO 8601 format (YYYY-MM-DD HH:MM) or ISO 8601 full format
    - Lesson description MUST support multi-line markdown
    - Lessons MUST be separated by `---` (horizontal rule)
- **FR-12** Lessons MUST be automatically recorded when:
    - Linter errors occur (category: `LINTER`)
    - Test failures occur (category: `TEST`)
    - Build errors occur (category: `BUILD`)
    - User provides explicit feedback (category: `USER_FEEDBACK`)
    - Architecture decisions are made (category: `ARCHITECTURE`)
- **FR-13** Automatic lesson recording MUST extract relevant context:
    - Error messages or failure details
    - File paths involved
    - Intent ID (if available)
    - Suggested solutions or patterns (if inferable)
- **FR-14** The `record_lesson` tool MUST be callable by agents explicitly (not just automatic). Agents MAY record lessons for:
    - Discovered patterns or best practices
    - Solutions to recurring problems
    - Architecture decisions
    - Code review insights

### 3.4 Shared Brain (CLAUDE.md)

- **FR-15** The system MUST maintain a shared knowledge file: `.orchestration/CLAUDE.md`. This file MUST:
    - Be readable by all agents at the start of their session
    - Be append-only (lessons are added, never deleted or modified)
    - Contain categorized lessons with timestamps
    - Support markdown formatting for readability
- **FR-16** The file structure MUST be:

    ```markdown
    # CLAUDE.md - Shared Project Knowledge

    This file contains lessons learned, patterns, and insights accumulated across all agent sessions.

    ## [CATEGORY] YYYY-MM-DD HH:MM

    ## Lesson content...

    ## [CATEGORY] YYYY-MM-DD HH:MM

    ## Another lesson...
    ```

- **FR-17** Agents MUST read `CLAUDE.md` at session start (or when explicitly requested). The content MUST be:
    - Parsed and made available to the agent's context
    - Filtered by category if needed (e.g. only show LINTER lessons)
    - Summarized if too long (e.g. last N lessons or most recent)
- **FR-18** The file MUST be created automatically if it doesn't exist. Initial content MUST be a header explaining the file's purpose.

### 3.5 Agent Session Management

- **FR-19** Each agent session MUST have a **unique identifier** in the format: `agent-{uuid}`. The UUID MUST be generated when the session starts and MUST persist for the session lifetime.
- **FR-20** The system MUST track active agent sessions:
    - Session ID
    - Start timestamp
    - Last activity timestamp
    - Associated intent ID (if any)
    - List of files being worked on
- **FR-21** Deadlock prevention MUST be implemented:
    - File locks MUST timeout after a configurable period (default: 30 minutes)
    - Timeout MUST be based on last activity timestamp, not snapshot creation time
    - Expired locks MUST be released automatically, allowing other agents to proceed
    - Lock expiration MUST be logged for debugging
- **FR-22** Conflict logging MUST record:
    - File path
    - Conflicting agent IDs
    - Snapshot hashes (expected vs actual)
    - Timestamp
    - Resolution (if any)

### 3.6 Integration with Existing Hooks

- **FR-23** The `writeFilePreHook` MUST check optimistic locking:
    - After scope validation (Phase 2)
    - Before mutation classification (Phase 3)
    - Must verify file snapshot matches current file hash
    - Must block write if snapshot is stale
- **FR-24** A new pre-hook MUST be created for read operations (e.g. `readFilePreHook`):
    - Must register file snapshot when agent reads a file
    - Must update file state tracker with current hash
    - Must associate snapshot with agent session ID
- **FR-25** Post-hooks MUST release locks on completion:
    - `writeFilePostHook` MUST update file state tracker with new hash after successful write
    - Post-hooks MUST clean up snapshots for the agent session when task completes
    - Post-hooks MUST handle failures gracefully (cleanup still occurs)
- **FR-26** Hook integration MUST be non-blocking:
    - Snapshot registration MUST not delay read operations
    - Lock verification MUST be fast (in-memory lookup)
    - File hash computation MUST reuse Phase 3 hashing utilities

---

## 4. Acceptance criteria

- ✅ **AC-1** Multiple agents can work on different files simultaneously without conflicts
- ✅ **AC-2** Agents detect conflicts when modifying the same file (stale file error)
- ✅ **AC-3** Stale file errors force agents to re-read files and merge changes
- ✅ **AC-4** Lessons are automatically recorded on linter errors, test failures, and build errors
- ✅ **AC-5** `CLAUDE.md` grows with project knowledge and is readable by all agents
- ✅ **AC-6** No deadlocks occur (locks timeout and release automatically)
- ✅ **AC-7** Tests verify concurrent access patterns (multiple agents, same file)
- ✅ **AC-8** File state tracker maintains accurate snapshots and cleans up stale entries
- ✅ **AC-9** Agent sessions are uniquely identified and tracked
- ✅ **AC-10** Integration with existing hooks (Phase 2 and Phase 3) works seamlessly

---

## 5. Technical constraints

- **TC-1** File state tracker MUST be in-memory only (no persistent storage). State is rebuilt on system restart.
- **TC-2** Snapshot cleanup MUST be efficient (O(n) where n is number of snapshots, not files).
- **TC-3** Hash computation MUST reuse existing utilities from Phase 3 (`computeContentHash`).
- **TC-4** Lesson recording MUST be atomic (append operation, no file locking needed for JSONL-like append).
- **TC-5** `CLAUDE.md` MUST be human-readable markdown (not JSON or binary format).

---

## 6. Out of scope

- **OOS-1** Automatic merge resolution (agents must handle merges manually)
- **OOS-2** Distributed locking across multiple machines (single-process only)
- **OOS-3** Persistent file state across restarts (rebuilds on startup)
- **OOS-4** Lesson deduplication (same lesson may be recorded multiple times)
- **OOS-5** Advanced conflict resolution strategies (simple stale detection only)

---

## 7. Dependencies

- Phase 1: Intent orchestration (`.orchestration/` directory structure)
- Phase 2: Hook middleware (pre-hooks, writeFilePreHook)
- Phase 3: Content hashing (`computeContentHash`, `sha256`), traceability
- Node.js `crypto` module for hashing (already available)
- UUID generation (already available via `uuid` package)

---

## 8. Success metrics

- **SM-1** Zero data loss from concurrent writes (conflicts detected before overwrite)
- **SM-2** Average conflict detection time < 10ms (in-memory lookup)
- **SM-3** `CLAUDE.md` contains at least one lesson per day of active development
- **SM-4** Lock timeout prevents deadlocks (no locks held > 30 minutes)
- **SM-5** Test coverage > 80% for concurrent access scenarios
