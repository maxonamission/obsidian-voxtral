// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe

/**
 * String similarity and normalization utilities for voice command matching.
 */

/**
 * Compute the Levenshtein (edit) distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		Array(n + 1).fill(0)
	);
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] =
				a[i - 1] === b[j - 1]
					? dp[i - 1][j - 1]
					: 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
		}
	}
	return dp[m][n];
}

/**
 * Normalize text for command matching: strip diacritics, punctuation,
 * hyphens → spaces, lowercase, trim.
 */
export function normalizeCommand(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "") // strip diacritics
		.replace(/-/g, " ") // hyphens to spaces
		.replace(/[.,!?;:'"()[\]{}]/g, "") // punctuation
		.toLowerCase()
		.trim();
}
