import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { recordLesson, type LessonCategory } from "../../hooks/utils/claudeManager"

interface RecordLessonParams {
	category: string
	lesson: string
}

export class RecordLessonTool extends BaseTool<"record_lesson"> {
	readonly name = "record_lesson" as const

	async execute(params: RecordLessonParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError } = callbacks

		try {
			const { category, lesson } = params

			if (!category || !lesson) {
				task.consecutiveMistakeCount++
				task.recordToolError("record_lesson")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("Missing category or lesson parameter"))
				return
			}

			// Validate category is one of the allowed values
			const validCategories: LessonCategory[] = [
				"ARCHITECTURE",
				"TESTING",
				"LINTER",
				"STYLE",
				"PERFORMANCE",
				"SECURITY",
				"GENERAL",
			]

			if (!validCategories.includes(category as LessonCategory)) {
				task.consecutiveMistakeCount++
				task.recordToolError("record_lesson")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						`Invalid category '${category}'. Must be one of: ${validCategories.join(", ")}`,
					),
				)
				return
			}

			const recorded = await recordLesson(task.cwd, category as LessonCategory, lesson)

			if (recorded) {
				pushToolResult(formatResponse.toolResult(`Lesson recorded in CLAUDE.md under [${category}]`))
			} else {
				pushToolResult(formatResponse.toolResult(`Lesson skipped (duplicate detected)`))
			}
		} catch (error) {
			console.error("[recordLessonTool] Error recording lesson:", error)
			await handleError("record lesson", error as Error)
		} finally {
			this.resetPartialState()
		}
	}
}

export const recordLessonTool = new RecordLessonTool()
