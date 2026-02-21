import { defineConfig } from "vitest/config"
import path from "path"
import { resolveVerbosity } from "./utils/vitest-verbosity"

const { silent, reporters, onConsoleLog } = resolveVerbosity()

export default defineConfig({
	test: {
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		watch: false,
		reporters,
		silent,
		testTimeout: 20_000,
		hookTimeout: 20_000,
		onConsoleLog,
		include: [
			"**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
			"../test/phase2/**/*.test.ts",
			"../test/phase3/**/*.test.ts",
			"../test/phase4/**/*.test.ts",
		],
	},
	resolve: {
		alias: {
			vscode: path.resolve(__dirname, "./__mocks__/vscode.js"),
		},
	},
})
