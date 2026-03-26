import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		// Mock the obsidian module (not available in Node.js)
		alias: {
			obsidian: path.resolve(__dirname, "src/__tests__/__mocks__/obsidian.ts"),
		},
	},
});
