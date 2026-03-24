import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		files: ["src/**/*.ts"],
		extends: [
			...tseslint.configs.recommendedTypeChecked,
		],
		plugins: {
			obsidianmd,
		},
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"src/__tests__/*.test.ts",
						"src/__tests__/__mocks__/*.ts",
					],
					maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16,
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			...obsidianmd.configs.recommended,
			// Allow @ts-expect-error for accessing internal Obsidian APIs
			"@typescript-eslint/ban-ts-comment": "off",
			// Allow unused vars prefixed with _
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			// Disable strict any rules — too noisy for WS message handling
			// and console interception patterns
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
		},
	},
);
