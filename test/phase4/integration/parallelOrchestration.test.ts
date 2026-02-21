import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { fileStateTracker } from "../../../src/hooks/utils/fileState"
import { agentSessionManager } from "../../../src/hooks/utils/agentSession"
import { recordLesson, clearClaudeBrain } from "../../../src/hooks/utils/claudeManager"
import { setupTestWorkspace, cleanupTestWorkspace } from "../../phase2/fixtures"
import * as path from "path"
import { promises as fs } from "fs"

describe("Phase 4 Integration: Parallel Orchestration", () => {
	let workspaceRoot: string
	let agentA: string
	let agentB: string

	beforeEach(async () => {
		workspaceRoot = await setupTestWorkspace()
		agentA = agentSessionManager.createAgentId()
		agentB = agentSessionManager.createAgentId()
		agentSessionManager.registerAgent(agentA)
		agentSessionManager.registerAgent(agentB)
		fileStateTracker.clear()
		await clearClaudeBrain(workspaceRoot)
	})

	afterEach(async () => {
		await cleanupTestWorkspace(workspaceRoot)
		agentSessionManager.clear()
		fileStateTracker.clear()
		vi.clearAllMocks()
	})

	it("should allow two agents to work on different files", async () => {
		const file1 = path.join(workspaceRoot, "src/file1.ts")
		const file2 = path.join(workspaceRoot, "src/file2.ts")

		// Create src directory
		await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true })

		// Create files
		await fs.writeFile(file1, "content1")
		await fs.writeFile(file2, "content2")

		// Agent A reads file1
		const contentA = await fs.readFile(file1, "utf-8")
		fileStateTracker.takeSnapshot(file1, contentA, agentA, workspaceRoot)

		// Agent B reads file2
		const contentB = await fs.readFile(file2, "utf-8")
		fileStateTracker.takeSnapshot(file2, contentB, agentB, workspaceRoot)

		// Both should verify successfully
		const validA = await fileStateTracker.verifySnapshot(file1, agentA, workspaceRoot)
		const validB = await fileStateTracker.verifySnapshot(file2, agentB, workspaceRoot)

		expect(validA).toBe(true)
		expect(validB).toBe(true)
	})

	it("should detect conflict when two agents modify same file", async () => {
		const file = path.join(workspaceRoot, "src/shared.ts")

		// Create src directory
		await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true })

		await fs.writeFile(file, "original content")

		// Agent A reads
		const contentA = await fs.readFile(file, "utf-8")
		fileStateTracker.takeSnapshot(file, contentA, agentA, workspaceRoot)

		// Agent B reads and modifies
		const contentB = await fs.readFile(file, "utf-8")
		fileStateTracker.takeSnapshot(file, contentB, agentB, workspaceRoot)
		await fs.writeFile(file, "modified by B")

		// Agent A tries to verify (should fail)
		const validA = await fileStateTracker.verifySnapshot(file, agentA, workspaceRoot)
		expect(validA).toBe(false)

		// Error message should be helpful
		const error = fileStateTracker.getStaleError(file, agentA)
		expect(error).toContain("Stale File")
		expect(error).toContain("modified by another agent")
	})

	it("should record lessons on failures", async () => {
		await recordLesson(workspaceRoot, "TESTING", "Test failure: missing mock for auth service")

		const claudePath = path.join(workspaceRoot, ".orchestration", "CLAUDE.md")
		const content = await fs.readFile(claudePath, "utf-8")

		expect(content).toContain("[TESTING]")
		expect(content).toContain("missing mock for auth service")
		expect(content).toContain("---")
	})

	it("should prevent duplicate lessons", async () => {
		const lesson = "Always validate API responses"

		// First recording
		const first = await recordLesson(workspaceRoot, "ARCHITECTURE", lesson)
		expect(first).toBe(true)

		// Second recording (duplicate)
		const second = await recordLesson(workspaceRoot, "ARCHITECTURE", lesson)
		expect(second).toBe(false)

		// Should only appear once
		const claudePath = path.join(workspaceRoot, ".orchestration", "CLAUDE.md")
		const content = await fs.readFile(claudePath, "utf-8")
		const occurrences = (content.match(new RegExp(lesson, "g")) || []).length
		expect(occurrences).toBe(1)
	})

	it("should track active agent sessions", () => {
		expect(agentSessionManager.isAgentActive(agentA)).toBe(true)
		expect(agentSessionManager.isAgentActive(agentB)).toBe(true)

		agentSessionManager.unregisterAgent(agentA)

		expect(agentSessionManager.isAgentActive(agentA)).toBe(false)
		expect(agentSessionManager.getActiveAgents()).toContain(agentB)
		expect(agentSessionManager.getActiveAgents()).not.toContain(agentA)
	})

	it("should release snapshots when agent completes", async () => {
		const file = path.join(workspaceRoot, "src/test.ts")

		// Create src directory
		await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true })

		await fs.writeFile(file, "content")

		// Agent takes snapshot
		const content = await fs.readFile(file, "utf-8")
		fileStateTracker.takeSnapshot(file, content, agentA, workspaceRoot)

		// Verify snapshot exists
		expect(fileStateTracker.getAllSnapshots().size).toBe(1)

		// Release snapshot
		fileStateTracker.releaseSnapshot(file, agentA, workspaceRoot)

		// Verify released
		expect(fileStateTracker.getAllSnapshots().size).toBe(0)
	})
})
