# Tasks: 005-parallel-orchestration

**Spec:** [spec.md](./spec.md)  
**Plan:** [plan.md](./plan.md)  
**Constitution:** [.specify/memory/constitution.md](../../memory/constitution.md)  
**Depends on:**

- [003-hook-middleware-security](../003-hook-middleware-security/spec.md) (Phase 2: pre-hooks, writeFilePreHook)
- [004-ai-native-git-layer](../004-ai-native-git-layer/spec.md) (Phase 3: content hashing, traceability)

Executable tasks for implementing parallel orchestration for multi-agent collaboration (Phase 4).

---

## Task 4.1: Create File State Tracker

**File:** `src/hooks/utils/fileState.ts`  
**Status:** ☐ Not started

### Description

Create a singleton class to track file snapshots across agent sessions with optimistic locking support. This enables conflict detection when multiple agents modify the same file.

### Implementation Steps

1. Create `fileState.ts` file
2. Define `FileSnapshot` interface: `{ hash: string, agentId: string, timestamp: number }`
3. Define `FileState` interface: `{ hash: string, agentId: string | null, timestamp: number, snapshots: Map<string, FileSnapshot> }`
4. Implement `FileStateTracker` class with:
    - `fileStates: Map<string, FileState>` (filePath → state)
    - `takeSnapshot(filePath: string, content: string, agentId: string): string`
    - `verifySnapshot(filePath: string, agentId: string, workspaceRoot: string): Promise<boolean>`
    - `releaseSnapshot(filePath: string, agentId: string): void`
    - `getStaleError(filePath: string, agentId: string): string`
    - `cleanupStaleSnapshots(maxAgeMs: number): void`
    - `startCleanupInterval(intervalMs: number, maxAgeMs: number): void`
5. Export singleton instance: `export const fileStateTracker = new FileStateTracker()`
6. Use `computeContentHash` from Phase 3 for hashing
7. Normalize file paths relative to workspace root
8. Add unit tests

### Acceptance Criteria

- ✅ `takeSnapshot` stores file hash with agentId and timestamp
- ✅ `verifySnapshot` returns `true` if hash matches current file
- ✅ `verifySnapshot` returns `false` if file modified or snapshot missing
- ✅ `releaseSnapshot` removes snapshot for agent
- ✅ `cleanupStaleSnapshots` removes snapshots older than maxAge
- ✅ `getStaleError` returns descriptive error message with file path and agent ID
- ✅ Unit tests verify concurrent access patterns (multiple agents, same file)
- ✅ Cleanup interval runs periodically and removes stale entries

### Dependencies

- Phase 3: `computeContentHash` from `src/hooks/utils/hashing.ts`
- `uuid` package (already installed)

---

## Task 4.2: Create Agent Session Manager

**File:** `src/hooks/utils/agentSession.ts`  
**Status:** ☐ Not started

### Description

Create a module to generate unique agent IDs and track active agent sessions for conflict resolution and debugging.

### Implementation Steps

1. Create `agentSession.ts` file
2. Define `AgentSession` interface: `{ agentId: string, createdAt: number, lastActivity: number, intentId: string | null, files: Set<string> }`
3. Implement `AgentSessionManager` class with:
    - `sessions: Map<string, AgentSession>`
    - `createAgentId(): string` (returns `agent-{short-uuid}`)
    - `registerAgent(agentId: string, intentId?: string): void`
    - `unregisterAgent(agentId: string): void`
    - `updateActivity(agentId: string): void`
    - `getActiveAgents(): string[]`
    - `isAgentActive(agentId: string): boolean`
    - `getAgentSession(agentId: string): AgentSession | null`
4. Export singleton instance: `export const agentSessionManager = new AgentSessionManager()`
5. Add unit tests

### Acceptance Criteria

- ✅ `createAgentId` returns unique IDs in format `agent-{uuid}` (first 8 chars)
- ✅ `registerAgent` tracks active agents with timestamps
- ✅ `unregisterAgent` removes agent and cleans up
- ✅ `getActiveAgents` returns list of active agent IDs
- ✅ `isAgentActive` checks if agent exists and is recent
- ✅ `updateActivity` updates lastActivity timestamp
- ✅ Unit tests verify tracking and cleanup

### Dependencies

- `uuid` package (already installed)

---

## Task 4.3: Create Lesson Recorder

**File:** `src/hooks/utils/lessonRecorder.ts`  
**Status:** ☐ Not started

### Description

Create a module to record lessons learned to `CLAUDE.md` with proper formatting and categorization.

### Implementation Steps

1. Create `lessonRecorder.ts` file
2. Define `LessonCategory` type: `"ARCHITECTURE" | "TESTING" | "LINTER" | "BUILD" | "USER_FEEDBACK" | "STYLE" | "PERFORMANCE" | "SECURITY" | "GENERAL"`
3. Implement `formatLesson(category: LessonCategory, lesson: string): string`
    - Format: `## [CATEGORY] YYYY-MM-DD HH:MM\n{lesson}\n---\n`
    - Use ISO 8601 or readable date format
4. Implement `recordLesson(category: LessonCategory, lesson: string, workspaceRoot: string): Promise<void>`
    - Ensure `.orchestration/` directory exists
    - Append formatted lesson to `.orchestration/CLAUDE.md`
    - Create file with header if doesn't exist
    - Basic deduplication: check last 5 lessons to avoid exact duplicates
5. Add unit tests with temporary files

### Acceptance Criteria

- ✅ `recordLesson` appends to `CLAUDE.md` with timestamp
- ✅ Creates `CLAUDE.md` if not exists (with header)
- ✅ Supports all categories: ARCHITECTURE, TESTING, LINTER, BUILD, USER_FEEDBACK, STYLE, PERFORMANCE, SECURITY, GENERAL
- ✅ Format matches: `## [CATEGORY] YYYY-MM-DD HH:MM\nLesson\n---`
- ✅ Basic deduplication avoids exact duplicates (checks last 5 lessons)
- ✅ Unit tests with temp files verify formatting and appending

### Dependencies

- `fs/promises` (Node.js built-in)
- `path` (Node.js built-in)

---

## Task 4.4: Create CLAUDE.md Manager

**File:** `src/hooks/utils/claudeManager.ts`  
**Status:** ☐ Not started

### Description

Create a module to read and query the shared knowledge base (`CLAUDE.md`) for relevant lessons.

### Implementation Steps

1. Create `claudeManager.ts` file
2. Implement `readClaudeBrain(workspaceRoot: string): Promise<string>`
    - Read `.orchestration/CLAUDE.md`
    - Return empty string if file doesn't exist
    - Handle errors gracefully
3. Implement `appendToClaudeBrain(workspaceRoot: string, content: string): Promise<void>`
    - Append content with newlines
    - Create file with header if doesn't exist
4. Implement `parseLessons(content: string): Array<{ category: string, timestamp: string, content: string }>`
    - Parse markdown sections (## [CATEGORY] TIMESTAMP)
    - Extract lesson content between sections
5. Implement `getRelevantLessons(workspaceRoot: string, keywords: string[]): Promise<string[]>`
    - Read and parse `CLAUDE.md`
    - Filter sections containing keywords (case-insensitive)
    - Return array of lesson strings
6. Implement `getLessonsByCategory(workspaceRoot: string, category: LessonCategory): Promise<string[]>`
    - Filter by category
    - Return array of lesson strings
7. Add unit tests with sample content

### Acceptance Criteria

- ✅ `readClaudeBrain` returns full content or empty string if missing
- ✅ `appendToClaudeBrain` adds content with proper newlines
- ✅ `getRelevantLessons` returns lessons containing keywords from context
- ✅ `getLessonsByCategory` filters by category correctly
- ✅ Handles missing file gracefully (returns empty array)
- ✅ Unit tests with sample content verify parsing and filtering

### Dependencies

- `fs/promises` (Node.js built-in)
- `path` (Node.js built-in)

---

## Task 4.5: Create File Read Pre-Hook

**File:** `src/hooks/preHooks/fileReadPreHook.ts`  
**Status:** ☐ Not started

### Description

Create a pre-hook that intercepts read operations to register file snapshots for optimistic locking.

### Implementation Steps

1. Create `fileReadPreHook.ts` file
2. Define interfaces:
    - `FileReadPreHookArgs` (path or paths)
    - `FileReadPreHookContext` (agentId, workspaceRoot)
    - `FileReadPreHookResult` (snapshots info)
3. Implement `fileReadPreHook(args: FileReadPreHookArgs, context: FileReadPreHookContext): Promise<FileReadPreHookResult>`
    - Extract file path(s) from args (handle single path or array)
    - Get agent ID from context (or generate if missing)
    - For each file path:
        - Read file content
        - Call `fileStateTracker.takeSnapshot()`
        - Register file with `agentSessionManager.updateActivity()`
    - Return snapshot information (optional, for debugging)
4. Handle multiple files in one operation (e.g. `search_files`)
5. Add unit tests with mocked fileState

### Acceptance Criteria

- ✅ Intercepts `read_file`, `search_files`, `list_files`, `read_directory`, `grep`
- ✅ Takes snapshot of files being read
- ✅ Returns unmodified result (doesn't block read operations)
- ✅ Handles multiple files in one operation
- ✅ Associates snapshots with agent ID
- ✅ Unit tests with mocked fileState verify snapshot registration

### Dependencies

- Task 4.1: File State Tracker
- Task 4.2: Agent Session Manager
- `fs/promises` (Node.js built-in)

---

## Task 4.6: Update writeFilePreHook with Optimistic Locking

**File:** `src/hooks/preHooks/writeFile.ts` (update existing)  
**Status:** ☐ Not started

### Description

Add optimistic locking check to the write file pre-hook to detect conflicts before scope validation.

### Implementation Steps

1. Import `fileStateTracker` and `agentSessionManager`
2. Extract `agentId` from context (or get from Task if available)
3. Add optimistic locking check **before** scope validation:

    ```typescript
    const isValid = await fileStateTracker.verifySnapshot(filePath, agentId, workspaceRoot)

    if (!isValid) {
    	return {
    		blocked: true,
    		error: fileStateTracker.getStaleError(filePath, agentId),
    		recoverable: true,
    	}
    }
    ```

4. If valid, proceed with existing scope validation (Phase 2)
5. After successful write (in post-hook), update file state
6. Release snapshot after successful write
7. Add unit tests with stale/valid scenarios

### Acceptance Criteria

- ✅ Calls `fileState.verifySnapshot` before scope validation
- ✅ If stale → blocks with "Stale File" error
- ✅ Error message includes file path, agent ID, and suggestion to re-read
- ✅ If valid → proceeds to scope validation (Phase 2)
- ✅ Releases snapshot after successful write
- ✅ Unit tests with stale/valid scenarios verify blocking and proceeding

### Dependencies

- Task 4.1: File State Tracker
- Task 4.2: Agent Session Manager
- Phase 2: Existing `writeFilePreHook` (scope validation)

---

## Task 4.7: Create record_lesson Tool

**Files:**

- `src/core/prompts/tools/native-tools/record_lesson.ts`
- `src/core/tools/recordLessonTool.ts` (handler)  
  **Status:** ☐ Not started

### Description

Create a native tool that allows agents to explicitly record lessons to the shared knowledge base.

### Implementation Steps

1. Create `record_lesson.ts` file with tool definition:
    ```typescript
    export const recordLessonTool: NativeToolDefinition = {
      name: "record_lesson",
      description: "Record a lesson learned or insight to the shared knowledge base (CLAUDE.md)...",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...] },
          lesson: { type: "string" }
        },
        required: ["category", "lesson"]
      }
    }
    ```
2. Create `recordLessonTool.ts` handler class extending `BaseTool`
3. Implement `handle()` method:
    - Extract `category` and `lesson` from parameters
    - Call `recordLesson(category, lesson, workspaceRoot)`
    - Return success/failure message
4. Add tool to native tools array in `presentAssistantMessage.ts`
5. Add case handler in `presentAssistantMessage.ts`:
    ```typescript
    case "record_lesson":
      await recordLessonTool.handle(cline, block, { ... })
      break
    ```
6. Add unit tests with mocked recorder

### Acceptance Criteria

- ✅ Tool definition with category and lesson parameters
- ✅ Handler calls `lessonRecorder.recordLesson`
- ✅ Returns success/failure message to LLM
- ✅ Added to native tools array
- ✅ Unit tests with mocked recorder verify tool execution

### Dependencies

- Task 4.3: Lesson Recorder
- Existing tool infrastructure (`BaseTool`, `presentAssistantMessage.ts`)

---

## Task 4.8: Update System Prompt

**File:** `src/core/prompts/sections/skills.ts`  
**Status:** ☐ Not started

### Description

Add instructions to the system prompt about recording lessons and sharing knowledge between agents.

### Implementation Steps

1. Add new section "Learning and Knowledge Sharing" to skills prompt
2. Include instructions:
    - When to record lessons (test failures, linter errors, build failures, user feedback)
    - How to use `record_lesson` tool
    - Explain that lessons are shared with other agents via `CLAUDE.md`
    - List available categories
3. Update context loading to include relevant lessons from `CLAUDE.md`:
    - Call `getRelevantLessons()` at session start
    - Append last 5 lessons to context
4. Add integration test to verify prompt contains instruction

### Acceptance Criteria

- ✅ Adds instruction about recording lessons
- ✅ Explains sharing knowledge between agents
- ✅ Mentions all categories
- ✅ Context loading includes relevant lessons from `CLAUDE.md`
- ✅ Integration test verifies prompt contains instruction

### Dependencies

- Task 4.3: Lesson Recorder
- Task 4.4: CLAUDE.md Manager
- Existing prompt system

---

## Task 4.9: Auto-record on Verification Failures

**Files:**

- `src/core/task/Task.ts` (update)
- `src/core/tools/executeCommandTool.ts` (update)  
  **Status:** ☐ Not started

### Description

Automatically record lessons when test failures, linter errors, or build failures occur.

### Implementation Steps

1. Create `src/hooks/utils/errorDetector.ts`:
    - `detectErrorCategory(stderr: string, stdout: string): LessonCategory | null`
    - Pattern matching for test/linter/build errors
2. Update command execution handler (in `Task.ts` or `executeCommandTool.ts`):
    - After command execution, check stderr/stdout
    - Call `detectErrorCategory()` to determine category
    - If category detected, extract error message and context
    - Call `recordLesson()` with appropriate category
    - Don't block execution on recording failure (catch errors)
3. Format lesson with:
    - Error message
    - File path (if available)
    - Command that failed
    - Suggested fix (if inferable)
4. Add unit tests with mocked command output

### Acceptance Criteria

- ✅ After command execution, checks stderr for test/linter/build failures
- ✅ Auto-calls `record_lesson` with appropriate category
    - Test failures → "TESTING"
    - Linter errors → "LINTER"
    - Build errors → "BUILD"
- ✅ Doesn't block execution on recording failure (error handling)
- ✅ Extracts relevant context (error message, file path, command)
- ✅ Unit tests with mocked command output verify auto-recording

### Dependencies

- Task 4.3: Lesson Recorder
- Existing command execution infrastructure

---

## Task 4.10: Write Integration Tests

**File:** `test/phase4/integration/parallelOrchestration.test.ts`  
**Status:** ☐ Not started

### Description

Create comprehensive integration tests for parallel orchestration scenarios.

### Implementation Steps

1. Create test file `test/phase4/integration/parallelOrchestration.test.ts`
2. Set up test fixtures (workspace, multiple agents)
3. Test scenarios:
    - **Two parallel agents modifying different files**: Should succeed without conflicts
    - **Conflict when modifying same file**: Should detect stale file error
    - **Stale file detection and recovery**: Agent should re-read and merge
    - **Lesson recording on failures**: Auto-record when test/linter fails
    - **CLAUDE.md updates**: Verify lessons are appended correctly
    - **Lock timeout**: Verify stale locks are cleaned up
    - **Agent session tracking**: Verify agents are registered/unregistered
4. Use mocked timers for concurrency testing
5. Mock file system operations
6. Verify file state tracker behavior

### Acceptance Criteria

- ✅ Tests two parallel agents modifying different files (no conflicts)
- ✅ Tests conflict when modifying same file (stale file error)
- ✅ Tests stale file detection and recovery (agent re-reads)
- ✅ Tests lesson recording on failures (auto-record)
- ✅ Tests `CLAUDE.md` updates (lessons appended)
- ✅ Uses mocked timers for concurrency testing
- ✅ All integration tests pass

### Dependencies

- All previous tasks (4.1-4.9)
- Test fixtures from Phase 2
- Vitest testing framework

---

## Task 4.11: Update Documentation

**Files:**

- `docs/phase4/parallel-orchestration.md` (new)
- `README.md` (update)
- `ARCHITECTURE_NOTES.md` (update)  
  **Status:** ☐ Not started

### Description

Document the parallel orchestration system, optimistic locking, and lesson recording.

### Implementation Steps

1. Create `docs/phase4/parallel-orchestration.md`:
    - Overview of parallel orchestration
    - How optimistic locking works
    - File state tracking explanation
    - Lesson recording system
    - `CLAUDE.md` format and usage
    - Troubleshooting guide
    - Examples of conflict resolution
2. Update `README.md`:
    - Add Phase 4 section
    - Link to documentation
    - Mention multi-agent support
3. Update `ARCHITECTURE_NOTES.md`:
    - Add architecture diagram (text-based)
    - Document file state tracker singleton
    - Document agent session lifecycle
    - Document lesson recording flow

### Acceptance Criteria

- ✅ Documents optimistic locking mechanism
- ✅ Explains lesson recording system
- ✅ Shows `CLAUDE.md` format with examples
- ✅ Includes troubleshooting guide
- ✅ Explains conflict detection and recovery
- ✅ Documents agent session management
- ✅ All documentation files updated

### Dependencies

- All implementation tasks complete
- Understanding of system behavior

---

## Implementation Checklist

- [ ] Task 4.1: File State Tracker
- [ ] Task 4.2: Agent Session Manager
- [ ] Task 4.3: Lesson Recorder
- [ ] Task 4.4: CLAUDE.md Manager
- [ ] Task 4.5: File Read Pre-Hook
- [ ] Task 4.6: Update writeFilePreHook
- [ ] Task 4.7: record_lesson Tool
- [ ] Task 4.8: System Prompt Updates
- [ ] Task 4.9: Auto-record on Failures
- [ ] Task 4.10: Integration Tests
- [ ] Task 4.11: Documentation

---

## Notes

- **Order matters**: Tasks 4.1-4.4 should be completed before 4.5-4.6 (dependencies)
- **Testing**: Unit tests should be written alongside implementation
- **Performance**: File state tracker uses in-memory Map (fast lookups)
- **Cleanup**: Stale snapshot cleanup runs every 5 minutes (configurable)
- **Agent IDs**: Format is `agent-{short-uuid}` for readability
