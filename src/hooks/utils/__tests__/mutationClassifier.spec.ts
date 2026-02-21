import { describe, it, expect } from "vitest"
import { MutationClass, classifyMutation, getMutationClass } from "../mutationClassifier"

describe("mutationClassifier", () => {
	describe("classifyMutation", () => {
		it("returns DOCUMENTATION when only comments changed", () => {
			const oldContent = "const x = 1\nconst y = 2"
			const newContent = "// Added comment\nconst x = 1\nconst y = 2"
			expect(classifyMutation(oldContent, newContent)).toBe(MutationClass.DOCUMENTATION)
		})

		it("returns DOCUMENTATION when only JSDoc/block comments changed", () => {
			const oldContent = "function foo() { return 1; }"
			const newContent = "/**\n * JSDoc for foo\n */\nfunction foo() { return 1; }"
			expect(classifyMutation(oldContent, newContent)).toBe(MutationClass.DOCUMENTATION)
		})

		it("returns DOCUMENTATION when content is identical", () => {
			const content = "const a = 1"
			expect(classifyMutation(content, content)).toBe(MutationClass.DOCUMENTATION)
		})

		it("returns BUG_FIX when diff contains fix/bug/error-like patterns", () => {
			const oldContent = "if (x) { doSomething() }"
			const newContent = "// fix: handle undefined\nif (x != null) { doSomething() }"
			expect(classifyMutation(oldContent, newContent)).toBe(MutationClass.BUG_FIX)
		})

		it("returns BUG_FIX when diff contains error/exception pattern", () => {
			const oldContent = "return value"
			const newContent = "if (value === undefined) throw new Error('required')"
			expect(classifyMutation(oldContent, newContent)).toBe(MutationClass.BUG_FIX)
		})

		it("returns INTENT_EVOLUTION when size change is large (>20%)", () => {
			const oldContent = "const a = 1"
			const newContent = "const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\nconst e = 5\nconst f = 6"
			expect(classifyMutation(oldContent, newContent)).toBe(MutationClass.INTENT_EVOLUTION)
		})

		it("returns INTENT_EVOLUTION when substantial new code added", () => {
			const oldContent = "function old() { return 1; }"
			const newContent =
				"function old() { return 1; }\nfunction newFeature() { return 2; }\nfunction another() { return 3; }"
			expect(classifyMutation(oldContent, newContent)).toBe(MutationClass.INTENT_EVOLUTION)
		})

		it("returns AST_REFACTOR for small structural change without bug patterns", () => {
			const oldContent = "const foo = 1;\nconst bar = 2;"
			const newContent = "const bar = 2;\nconst foo = 1;"
			expect(classifyMutation(oldContent, newContent)).toBe(MutationClass.AST_REFACTOR)
		})

		it("returns AST_REFACTOR for rename-like change (small diff)", () => {
			const oldContent = "function oldName() {}\noldName()"
			const newContent = "function newName() {}\nnewName()"
			expect(classifyMutation(oldContent, newContent)).toBe(MutationClass.AST_REFACTOR)
		})
	})

	describe("getMutationClass", () => {
		it("returns explicit class when valid", () => {
			expect(getMutationClass("BUG_FIX", "old", "new")).toBe(MutationClass.BUG_FIX)
			expect(getMutationClass("INTENT_EVOLUTION", "old", "new")).toBe(MutationClass.INTENT_EVOLUTION)
			expect(getMutationClass("DOCUMENTATION", "old", "new")).toBe(MutationClass.DOCUMENTATION)
			expect(getMutationClass("AST_REFACTOR", "old", "new")).toBe(MutationClass.AST_REFACTOR)
		})

		it("falls back to classifyMutation when explicit is undefined", () => {
			const oldContent = "const x = 1"
			const newContent = "// comment\nconst x = 1"
			expect(getMutationClass(undefined, oldContent, newContent)).toBe(MutationClass.DOCUMENTATION)
		})

		it("falls back to classifyMutation when explicit is invalid", () => {
			const oldContent = "const x = 1"
			const newContent = "// comment\nconst x = 1"
			expect(getMutationClass("INVALID", oldContent, newContent)).toBe(MutationClass.DOCUMENTATION)
		})
	})
})
