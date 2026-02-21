import type OpenAI from "openai"

const RECORD_LESSON_DESCRIPTION = `Record a lesson learned for other agents to benefit from.

Use this tool when:
- You encounter a failing test and discover the cause
- A linter error teaches you about project style rules
- You learn something about the project architecture
- You find a workaround for a common issue
- You discover a performance optimization
- The user provides feedback that reveals important project conventions

Lessons are stored in CLAUDE.md and shared with all agents working on this project. This helps build collective knowledge and prevents repeating the same mistakes.`

const CATEGORY_PARAMETER_DESCRIPTION = `Category of the lesson. Use ARCHITECTURE for design decisions and patterns, TESTING for test-related insights, LINTER for style and linting rules, STYLE for code style conventions, PERFORMANCE for optimization tips, SECURITY for security-related lessons, and GENERAL for other insights.`

const LESSON_PARAMETER_DESCRIPTION = `The lesson text. Be specific and include details that will help other agents. Include context about what went wrong, what the solution was, and why it matters.`

export default {
	type: "function",
	function: {
		name: "record_lesson",
		description: RECORD_LESSON_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				category: {
					type: "string",
					enum: ["ARCHITECTURE", "TESTING", "LINTER", "STYLE", "PERFORMANCE", "SECURITY", "GENERAL"],
					description: CATEGORY_PARAMETER_DESCRIPTION,
				},
				lesson: {
					type: "string",
					description: LESSON_PARAMETER_DESCRIPTION,
				},
			},
			required: ["category", "lesson"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
