# Implementation plan: Parallel Orchestration for Multi-Agent Collaboration

**Feature:** 005-parallel-orchestration  
**Spec:** [spec.md](./spec.md)  
**Constitution:** [.specify/memory/constitution.md](../../memory/constitution.md)

This plan covers **parallel orchestration** that enables multiple AI agents to work simultaneously on the same codebase without conflicts. It builds on Phase 1 (Intent Selection), Phase 2 (Security Boundary), and Phase 3 (Traceability).

---

## Architecture Overview

We'll implement a file state tracker with optimistic locking, plus a lesson recording system that maintains a shared knowledge base. The architecture consists of:

1. **File State Tracker**: Singleton in-memory map tracking file snapshots per agent session
2. **Agent Session Manager**: Unique ID generation and session tracking
3. **Lesson Recorder**: Automatic and manual lesson capture to `CLAUDE.md`
4. **CLAUDE.md Manager**: Shared knowledge base reader and writer
5. **Pre-hooks Integration**: File read hooks for snapshot registration, write hooks for conflict detection
6. **Tool Integration**: `record_lesson` tool for explicit lesson recording

---

## Phase 0: Prerequisites and Dependencies

### 0.1 Verify dependencies

- **uuid package**: Already installed (`uuid@^11.1.0` in `package.json`). Use `v4()` for agent ID generation.
- **crypto module**: Node.js built-in. Use `createHash('sha256')` for content hashing (reuse Phase 3 utilities).
- **fs/promises**: Node.js built-in. Use for reading/writing `CLAUDE.md`.
- **path module**: Node.js built-in. Use for file path normalization.

**No new package installations required.**

### 0.2 Task class extension

- **Location**: `src/core/task/Task.ts`
- **Add**: `agentId: string | null = null` property to track the current agent session ID
- **Add**: `agentIdCreatedAt: number | null = null` timestamp for session tracking
- **Purpose**: Associate agent session with file snapshots and track session lifetime

### 0.3 Context extension

- **Location**: `src/hooks/preHooks/writeFile.ts` (WriteFilePreHookContext)
- **Add**: `agentId?: string` to context interface
- **Location**: New `src/hooks/preHooks/fileReadPreHook.ts` (FileReadPreHookContext)
- **Add**: `agentId?: string` to context interface
- **Purpose**: Pass agent ID through hook chain for snapshot tracking

---

## Phase 1: File State Tracker

### 1.1 Create file state tracker module

- **File**: `src/hooks/utils/fileState.ts`
- **Purpose**: Singleton class to track file snapshots across agent sessions with optimistic locking

### 1.2 Data structures

```typescript
interface FileSnapshot {
	hash: string // Content hash (sha256:...)
	agentId: string // Agent session ID
	timestamp: number // Unix timestamp (ms)
}

interface FileState {
	hash: string // Current file hash
	agentId: string | null // Agent that last modified
	timestamp: number // Last modification time
	snapshots: Map<string, FileSnapshot> // Map<agentId, snapshot>
}

class FileStateTracker {
	private fileStates: Map<string, FileState>
	private cleanupInterval: NodeJS.Timeout | null

	// ... methods
}
```

### 1.3 Implementation

- **`takeSnapshot(filePath: string, content: string, agentId: string): string`**

    - Normalize file path (relative to workspace root)
    - Compute content hash using `computeContentHash` from Phase 3
    - Create or update snapshot in map
    - Update file state with current hash
    - Return hash string

- **`verifySnapshot(filePath: string, agentId: string, workspaceRoot: string): Promise<boolean>`**

    - Read current file content
    - Compute current hash
    - Compare with agent's snapshot hash
    - Return `true` if match, `false` if stale
    - Update file state if match

- **`releaseSnapshot(filePath: string, agentId: string): void`**

    - Remove agent's snapshot from file state
    - If no snapshots remain, optionally remove file state entry
    - Clean up empty entries

- **`getStaleError(filePath: string, agentId: string): string`**

    - Format structured error message
    - Include file path, agent ID, expected vs actual hash
    - Suggest re-reading file and merging changes

- **`cleanupStaleSnapshots(maxAgeMs: number): void`**

    - Iterate through all file states
    - Remove snapshots older than `maxAgeMs`
    - Remove file states with no snapshots
    - Log cleanup statistics

- **`startCleanupInterval(intervalMs: number, maxAgeMs: number): void`**
    - Set up periodic cleanup (default: every 5 minutes)
    - Call `cleanupStaleSnapshots` on interval

### 1.4 Singleton pattern

- Export singleton instance: `export const fileStateTracker = new FileStateTracker()`
- Initialize cleanup interval on first use
- Thread-safe operations (single process, but handle concurrent access)

---

## Phase 2: Agent Session Manager

### 2.1 Create agent session manager module

- **File**: `src/hooks/utils/agentSession.ts`
- **Purpose**: Generate unique agent IDs and track active sessions

### 2.2 Implementation

```typescript
interface AgentSession {
	agentId: string
	createdAt: number
	lastActivity: number
	intentId: string | null
	files: Set<string>
}

class AgentSessionManager {
	private sessions: Map<string, AgentSession>

	createAgentId(): string {
		// Return 'agent-' + short UUID (first 8 chars)
		return `agent-${uuidv4().slice(0, 8)}`
	}

	registerAgent(agentId: string, intentId?: string): void {
		// Create session entry
	}

	unregisterAgent(agentId: string): void {
		// Remove session, release all snapshots
	}

	updateActivity(agentId: string): void {
		// Update lastActivity timestamp
	}

	getActiveAgents(): string[] {
		// Return array of active agent IDs
	}

	isAgentActive(agentId: string): boolean {
		// Check if agent session exists and is recent
	}

	getAgentSession(agentId: string): AgentSession | null {
		// Return session or null
	}
}
```

### 2.3 Integration points

- Call `createAgentId()` when Task is created (or first tool call)
- Call `registerAgent()` when agent starts working
- Call `updateActivity()` on each tool call
- Call `unregisterAgent()` when task completes or times out

---

## Phase 3: Lesson Recorder and CLAUDE.md Manager

### 3.1 Create lesson recorder module

- **File**: `src/hooks/utils/lessonRecorder.ts`
- **Purpose**: Record lessons to `CLAUDE.md` with proper formatting

### 3.2 Lesson categories

```typescript
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
```

### 3.3 Implementation

- **`recordLesson(category: LessonCategory, lesson: string, workspaceRoot: string): Promise<void>`**

    - Format lesson with timestamp and category
    - Append to `.orchestration/CLAUDE.md`
    - Create file if doesn't exist
    - Use atomic append (no file locking needed)

- **`formatLesson(category: LessonCategory, lesson: string): string`**
    - Format as markdown section:
        ```markdown
        ## [CATEGORY] YYYY-MM-DD HH:MM

        ## {lesson}
        ```
    - Use ISO 8601 date format or readable format

### 3.4 Create CLAUDE.md manager module

- **File**: `src/hooks/utils/claudeManager.ts`
- **Purpose**: Read and query the shared knowledge base

### 3.5 Implementation

- **`readClaudeBrain(workspaceRoot: string): Promise<string>`**

    - Read `.orchestration/CLAUDE.md`
    - Return empty string if file doesn't exist
    - Handle file read errors gracefully

- **`appendToClaudeBrain(workspaceRoot: string, content: string): Promise<void>`**

    - Append content to `.orchestration/CLAUDE.md`
    - Create file with header if doesn't exist
    - Ensure `.orchestration/` directory exists

- **`getRelevantLessons(workspaceRoot: string, keywords: string[]): Promise<string[]>`**

    - Read `CLAUDE.md`
    - Parse markdown sections
    - Filter sections containing keywords
    - Return array of lesson strings
    - Simple keyword matching (case-insensitive)

- **`getLessonsByCategory(workspaceRoot: string, category: LessonCategory): Promise<string[]>`**
    - Read `CLAUDE.md`
    - Parse markdown sections
    - Filter by category
    - Return array of lesson strings

### 3.6 Initial CLAUDE.md structure

```markdown
# CLAUDE.md - Shared Project Knowledge

This file contains lessons learned, patterns, and insights accumulated across all agent sessions.

---
```

---

## Phase 4: File Read Pre-Hook

### 4.1 Create file read pre-hook module

- **File**: `src/hooks/preHooks/fileReadPreHook.ts`
- **Purpose**: Intercept read operations to register file snapshots

### 4.2 Hook interfaces

```typescript
export interface FileReadPreHookArgs {
	path?: string
	paths?: string[]
	[key: string]: unknown
}

export interface FileReadPreHookContext {
	agentId?: string
	workspaceRoot?: string
	[key: string]: unknown
}

export interface FileReadPreHookResult {
	snapshots?: Array<{ path: string; hash: string }>
	[key: string]: unknown
}
```

### 4.3 Implementation

- **`fileReadPreHook(args: FileReadPreHookArgs, context: FileReadPreHookContext): Promise<FileReadPreHookResult>`**
    - Extract file path(s) from args
    - Get agent ID from context (or generate if missing)
    - For each file path:
        - Read file content
        - Take snapshot via `fileStateTracker.takeSnapshot()`
        - Register file with agent session manager
    - Return snapshot information (optional, for debugging)

### 4.4 Integration points

- Hook into: `read_file`, `search_files`, `list_files`, `read_directory`, `grep`
- Call before tool execution in `presentAssistantMessage.ts`
- Pass agent ID through context chain

---

## Phase 5: Update writeFilePreHook

### 5.1 Modify existing write file pre-hook

- **File**: `src/hooks/preHooks/writeFile.ts` (update existing)
- **Purpose**: Add optimistic locking check before scope validation

### 5.2 Update flow

Current flow:

1. Scope validation (Phase 2)
2. Tool execution
3. Post-hook (Phase 3)

New flow:

1. **Optimistic locking check** (Phase 4) ← NEW
2. Scope validation (Phase 2)
3. Tool execution
4. Post-hook (Phase 3)

### 5.3 Implementation changes

- Import `fileStateTracker` and `agentSessionManager`
- Extract `agentId` from context (or get from Task)
- Before scope validation:

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

- If valid, proceed with existing scope validation
- After successful write, update file state in post-hook

---

## Phase 6: Record Lesson Tool

### 6.1 Create record_lesson tool

- **File**: `src/core/prompts/tools/native-tools/record_lesson.ts`
- **Purpose**: Native tool for agents to explicitly record lessons

### 6.2 Tool schema

```typescript
export const recordLessonTool: NativeToolDefinition = {
	name: "record_lesson",
	description:
		"Record a lesson learned or insight to the shared knowledge base (CLAUDE.md). Use this when you discover patterns, solve problems, or learn something that would help other agents.",
	parameters: {
		type: "object",
		properties: {
			category: {
				type: "string",
				enum: [
					"ARCHITECTURE",
					"TESTING",
					"LINTER",
					"BUILD",
					"USER_FEEDBACK",
					"STYLE",
					"PERFORMANCE",
					"SECURITY",
					"GENERAL",
				],
				description: "Category of the lesson",
			},
			lesson: {
				type: "string",
				description: "The lesson or insight to record. Be specific and include context.",
			},
		},
		required: ["category", "lesson"],
	},
}
```

### 6.3 Tool handler

- **Location**: `src/core/assistant-message/presentAssistantMessage.ts`
- **Handler**: Add case for `record_lesson` tool
- **Implementation**:
    ```typescript
    case "record_lesson":
      const { category, lesson } = toolParams
      await recordLesson(category as LessonCategory, lesson, cline.cwd)
      pushToolResult("Lesson recorded successfully")
      break
    ```

---

## Phase 7: System Prompt Updates

### 7.1 Update skills section

- **File**: `src/core/prompts/sections/skills.ts`
- **Add instruction**:

    ```markdown
    ## Learning and Knowledge Sharing

    When you encounter:

    - Failing tests → Record lesson with category "TESTING"
    - Linter errors → Record lesson with category "LINTER"
    - Build failures → Record lesson with category "BUILD"
    - User feedback → Record lesson with category "USER_FEEDBACK"
    - Architecture decisions → Record lesson with category "ARCHITECTURE"

    Use the `record_lesson` tool to share insights with other agents. Lessons are stored in CLAUDE.md and help all agents avoid repeating mistakes.
    ```

### 7.2 Update context loading

- **File**: `src/core/prompts/sections/context.ts` (or similar)
- **Add**: Load relevant lessons from `CLAUDE.md` at session start
- **Implementation**:
    ```typescript
    const claudeLessons = await getRelevantLessons(workspaceRoot, ["error", "test", "linter", "build"])
    if (claudeLessons.length > 0) {
    	context += "\n\n## Lessons from CLAUDE.md\n\n"
    	context += claudeLessons.slice(-5).join("\n\n") // Last 5 lessons
    }
    ```

---

## Phase 8: Integration with Verification Failures

### 8.1 Auto-record lessons on failures

- **File**: `src/core/task/Task.ts` (or command execution handler)
- **Purpose**: Automatically record lessons when errors occur

### 8.2 Implementation

- After command execution (linter, test, build):
    - Check stderr/stdout for error patterns
    - Extract error message and context
    - Determine category:
        - Test failures → "TESTING"
        - Linter errors → "LINTER"
        - Build errors → "BUILD"
    - Call `recordLesson()` with extracted information
    - Include file path, error message, and suggested fix (if inferable)

### 8.3 Error pattern detection

```typescript
function detectErrorCategory(stderr: string, stdout: string): LessonCategory | null {
	const combined = stderr + stdout

	if (combined.match(/test.*fail|assertion.*fail|expect.*fail/i)) {
		return "TESTING"
	}
	if (combined.match(/lint|eslint|prettier|style/i)) {
		return "LINTER"
	}
	if (combined.match(/build.*fail|compile.*error|syntax.*error/i)) {
		return "BUILD"
	}

	return null
}
```

---

## Phase 9: Testing

### 9.1 Unit tests

- **File State Tracker**: `src/hooks/utils/__tests__/fileState.spec.ts`

    - Test snapshot creation and verification
    - Test stale snapshot detection
    - Test cleanup of expired snapshots
    - Test concurrent access patterns

- **Agent Session Manager**: `src/hooks/utils/__tests__/agentSession.spec.ts`

    - Test agent ID generation
    - Test session registration/unregistration
    - Test activity tracking

- **Lesson Recorder**: `src/hooks/utils/__tests__/lessonRecorder.spec.ts`

    - Test lesson formatting
    - Test file append operations
    - Test category handling

- **CLAUDE.md Manager**: `src/hooks/utils/__tests__/claudeManager.spec.ts`
    - Test reading and parsing
    - Test keyword filtering
    - Test category filtering

### 9.2 Integration tests

- **File**: `test/phase4/integration/parallelOrchestration.test.ts`
    - Test multiple agents working on different files
    - Test conflict detection when same file modified
    - Test stale file error handling
    - Test lesson recording and retrieval
    - Test lock timeout and cleanup

---

## Technical Decisions

### TD-1: Singleton pattern for FileStateTracker

- **Decision**: Use singleton instance exported from module
- **Rationale**: Single process, need shared state across all agent sessions
- **Alternative considered**: Dependency injection (more complex, not needed)

### TD-2: Snapshot expiration timeout

- **Decision**: Default 5 minutes (configurable)
- **Rationale**: Balance between preventing deadlocks and allowing reasonable work time
- **Alternative considered**: 30 minutes (too long, increases conflict risk)

### TD-3: Agent ID format

- **Decision**: `agent-{short-uuid}` (first 8 chars of UUID)
- **Rationale**: Short, readable, unique enough for single-process use
- **Alternative considered**: Full UUID (too long, unnecessary)

### TD-4: CLAUDE.md location

- **Decision**: `.orchestration/CLAUDE.md` (not workspace root)
- **Rationale**: Consistent with other orchestration files, keeps workspace clean
- **Alternative considered**: Workspace root (more visible but clutters root)

### TD-5: Relevance matching

- **Decision**: Simple keyword matching (case-insensitive)
- **Rationale**: Fast, sufficient for MVP, can be enhanced later with semantic search
- **Alternative considered**: Vector embeddings (overkill for MVP)

### TD-6: In-memory state only

- **Decision**: No persistent storage for file state tracker
- **Rationale**: Rebuilds on restart (acceptable), simpler implementation
- **Alternative considered**: Persistent storage (adds complexity, not critical)

---

## Dependencies

- **No new package dependencies required**
- Reuse existing:
    - `uuid` (agent ID generation)
    - `crypto` (hashing, from Phase 3)
    - `fs/promises` (file I/O)
    - `path` (path normalization)

---

## Implementation Sequence

1. **File State Tracker** (`fileState.ts`) + unit tests
2. **Agent Session Manager** (`agentSession.ts`) + unit tests
3. **Lesson Recorder** (`lessonRecorder.ts`) + unit tests
4. **CLAUDE.md Manager** (`claudeManager.ts`) + unit tests
5. **File Read Pre-Hook** (`fileReadPreHook.ts`) + unit tests
6. **Update writeFilePreHook** (add optimistic locking) + tests
7. **Record Lesson Tool** (`record_lesson.ts`) + integration
8. **System Prompt Updates** (skills, context loading)
9. **Auto-record on Failures** (Task.ts integration)
10. **Integration Tests** (parallel orchestration scenarios)
11. **Documentation** (README updates, architecture notes)

---

## Performance Considerations

- **Snapshot verification**: O(1) lookup in Map, file read is async
- **Cleanup**: O(n) where n is number of snapshots, runs periodically
- **Lesson recording**: O(1) append operation
- **CLAUDE.md reading**: O(n) where n is file size, cached per session

---

## Security Considerations

- **Agent ID validation**: Ensure agent IDs are properly scoped to session
- **File path sanitization**: Normalize paths to prevent directory traversal
- **CLAUDE.md size limits**: Consider max file size to prevent DoS
- **Snapshot cleanup**: Prevent memory leaks with proper cleanup

---

## Future Enhancements

- **Semantic search** for lesson relevance (vector embeddings)
- **Lesson deduplication** (detect similar lessons)
- **Distributed locking** (if multi-process support needed)
- **Persistent file state** (survive restarts)
- **Conflict resolution strategies** (automatic merge hints)
- **Lesson categories** (user-defined categories)
- **Lesson expiration** (remove outdated lessons)
