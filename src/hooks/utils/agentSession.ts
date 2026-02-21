import { v4 as uuidv4 } from "uuid"

interface AgentSession {
	agentId: string
	createdAt: number
	lastActivity: number
	intentId: string | null
	files: Set<string>
}

/**
 * Manages agent sessions for parallel orchestration.
 * Tracks active agents, their activity, and associated files.
 */
export class AgentSessionManager {
	private static instance: AgentSessionManager
	private sessions: Map<string, AgentSession> = new Map()
	private readonly SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes
	private cleanupInterval: NodeJS.Timeout | null = null

	private constructor() {
		// Periodic cleanup of stale sessions (every 5 minutes)
		this.startCleanupInterval(5 * 60 * 1000, this.SESSION_TIMEOUT)
	}

	public static getInstance(): AgentSessionManager {
		if (!AgentSessionManager.instance) {
			AgentSessionManager.instance = new AgentSessionManager()
		}
		return AgentSessionManager.instance
	}

	/**
	 * Create a new unique agent ID
	 * @returns Unique agent ID (agent-{short-uuid})
	 */
	public createAgentId(): string {
		return `agent-${uuidv4().slice(0, 8)}`
	}

	/**
	 * Register an agent as active
	 * @param agentId - ID of the agent
	 * @param intentId - Optional intent ID the agent is working on
	 */
	public registerAgent(agentId: string, intentId?: string): void {
		const now = Date.now()
		this.sessions.set(agentId, {
			agentId,
			createdAt: now,
			lastActivity: now,
			intentId: intentId ?? null,
			files: new Set(),
		})
		console.debug(`[agentSession] Agent registered: ${agentId}${intentId ? ` (intent: ${intentId})` : ""}`)
	}

	/**
	 * Unregister an agent (session ended)
	 * @param agentId - ID of the agent
	 */
	public unregisterAgent(agentId: string): void {
		this.sessions.delete(agentId)
		console.debug(`[agentSession] Agent unregistered: ${agentId}`)
	}

	/**
	 * Update agent's last activity timestamp
	 * @param agentId - ID of the agent
	 */
	public updateActivity(agentId: string): void {
		const session = this.sessions.get(agentId)
		if (session) {
			session.lastActivity = Date.now()
		}
	}

	/**
	 * Add a file to agent's tracked files
	 * @param agentId - ID of the agent
	 * @param filePath - Path to the file
	 */
	public addFile(agentId: string, filePath: string): void {
		const session = this.sessions.get(agentId)
		if (session) {
			session.files.add(filePath)
			this.updateActivity(agentId)
		}
	}

	/**
	 * Remove a file from agent's tracked files
	 * @param agentId - ID of the agent
	 * @param filePath - Path to the file
	 */
	public removeFile(agentId: string, filePath: string): void {
		const session = this.sessions.get(agentId)
		if (session) {
			session.files.delete(filePath)
		}
	}

	/**
	 * Get all active agent IDs
	 * @returns Array of active agent IDs
	 */
	public getActiveAgents(): string[] {
		return Array.from(this.sessions.keys())
	}

	/**
	 * Check if an agent is active
	 * @param agentId - ID of the agent
	 * @returns true if agent is active
	 */
	public isAgentActive(agentId: string): boolean {
		return this.sessions.has(agentId)
	}

	/**
	 * Get agent session info
	 * @param agentId - ID of the agent
	 * @returns Agent session or null if not found
	 */
	public getAgentSession(agentId: string): AgentSession | null {
		return this.sessions.get(agentId) ?? null
	}

	/**
	 * Clean up sessions that haven't had activity for too long
	 * @param maxAgeMs - Maximum age in milliseconds (default: 30 minutes)
	 */
	public cleanupStaleSessions(maxAgeMs: number = this.SESSION_TIMEOUT): void {
		const now = Date.now()
		let cleaned = 0

		for (const [agentId, session] of this.sessions.entries()) {
			if (now - session.lastActivity > maxAgeMs) {
				this.sessions.delete(agentId)
				cleaned++
			}
		}

		if (cleaned > 0) {
			console.debug(`[agentSession] Cleaned up ${cleaned} stale agent sessions`)
		}
	}

	/**
	 * Start periodic cleanup interval
	 * @param intervalMs - Interval in milliseconds (default: 5 minutes)
	 * @param maxAgeMs - Maximum age in milliseconds (default: 30 minutes)
	 */
	public startCleanupInterval(intervalMs: number = 5 * 60 * 1000, maxAgeMs: number = this.SESSION_TIMEOUT): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
		}

		this.cleanupInterval = setInterval(() => {
			this.cleanupStaleSessions(maxAgeMs)
		}, intervalMs)
	}

	/**
	 * Stop periodic cleanup interval
	 */
	public stopCleanupInterval(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = null
		}
	}

	/**
	 * Get session statistics
	 * @returns Statistics about active sessions
	 */
	public getStats(): { total: number; active: number } {
		return {
			total: this.sessions.size,
			active: this.sessions.size,
		}
	}

	/**
	 * Clear all sessions (for testing)
	 */
	public clear(): void {
		this.sessions.clear()
	}
}

// Export singleton instance
export const agentSessionManager = AgentSessionManager.getInstance()

// Convenience functions
export function createAgentId(): string {
	return agentSessionManager.createAgentId()
}

export function registerAgent(agentId: string, intentId?: string): void {
	agentSessionManager.registerAgent(agentId, intentId)
}

export function unregisterAgent(agentId: string): void {
	agentSessionManager.unregisterAgent(agentId)
}

export function updateActivity(agentId: string): void {
	agentSessionManager.updateActivity(agentId)
}

export function getActiveAgents(): string[] {
	return agentSessionManager.getActiveAgents()
}

export function isAgentActive(agentId: string): boolean {
	return agentSessionManager.isAgentActive(agentId)
}

export function getAgentSession(agentId: string): AgentSession | null {
	return agentSessionManager.getAgentSession(agentId)
}
