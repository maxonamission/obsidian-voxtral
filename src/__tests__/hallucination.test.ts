import { describe, it, expect, vi } from "vitest";
import { isLikelyHallucination } from "../mistral-api";

vi.mock("obsidian", () => ({
	requestUrl: vi.fn(),
}));

describe("isLikelyHallucination", () => {
	// ── Normal transcriptions (should NOT be flagged) ──

	it("accepts empty text", () => {
		expect(isLikelyHallucination("", 5)).toBe(false);
	});

	it("accepts whitespace-only text", () => {
		expect(isLikelyHallucination("   ", 5)).toBe(false);
	});

	it("accepts normal short transcription", () => {
		expect(isLikelyHallucination("Hello world", 3)).toBe(false);
	});

	it("accepts normal-speed transcription (2-3 w/s)", () => {
		// 15 words in 5 seconds = 3 w/s (normal)
		const text = "This is a normal sentence that someone would say during dictation to their phone";
		expect(isLikelyHallucination(text, 5)).toBe(false);
	});

	it("accepts slightly fast transcription (4 w/s)", () => {
		// 20 words in 5 seconds = 4 w/s (fast but OK)
		const words = Array(20).fill("word").join(" ");
		expect(isLikelyHallucination(words, 5)).toBe(false);
	});

	it("accepts text with 5 w/s but only 20 words (boundary)", () => {
		// Exactly 20 words at exactly 5 w/s — should NOT trigger (requires >5 AND >20)
		const words = Array(20).fill("word").join(" ");
		expect(isLikelyHallucination(words, 4)).toBe(false);
	});

	it("accepts text with exactly 20 words at 5.1 w/s (boundary — words not >20)", () => {
		// 20 words is the boundary — must be >20 to trigger
		const words = Array(20).fill("word").join(" ");
		expect(isLikelyHallucination(words, 3.9)).toBe(false);
	});

	// ── Speed-based hallucination detection ──

	it("flags text with >5 words/sec AND >20 words", () => {
		// 25 words in 2 seconds = 12.5 w/s
		const words = Array(25).fill("word").join(" ");
		expect(isLikelyHallucination(words, 2)).toBe(true);
	});

	it("flags text with 21 words at 6 w/s", () => {
		const words = Array(21).fill("word").join(" ");
		expect(isLikelyHallucination(words, 3)).toBe(true);
	});

	it("flags impossibly fast transcription", () => {
		// 100 words in 1 second
		const words = Array(100).fill("word").join(" ");
		expect(isLikelyHallucination(words, 1)).toBe(true);
	});

	it("flags when audioDurationSec is 0 (all words = infinite w/s)", () => {
		const words = Array(25).fill("word").join(" ");
		expect(isLikelyHallucination(words, 0)).toBe(true);
	});

	it("does NOT flag >5 w/s if words ≤ 20 (short audio artifact)", () => {
		// 10 words in 1 second = 10 w/s but only 10 words
		const words = Array(10).fill("word").join(" ");
		expect(isLikelyHallucination(words, 1)).toBe(false);
	});

	// ── Repeated blocks (horizontal rules) ──

	it("flags text with 3+ blocks separated by ---", () => {
		const text = "Block one.\n---\nBlock two.\n---\nBlock three.";
		expect(isLikelyHallucination(text, 30)).toBe(true);
	});

	it("flags text with many repeated blocks", () => {
		const text = "Block.\n---\nBlock.\n---\nBlock.\n---\nBlock.";
		expect(isLikelyHallucination(text, 30)).toBe(true);
	});

	it("does NOT flag text with only 2 blocks", () => {
		const text = "Block one.\n---\nBlock two.";
		expect(isLikelyHallucination(text, 30)).toBe(false);
	});

	it("does NOT flag text with --- inside a sentence", () => {
		const text = "This is a normal sentence without horizontal rules.";
		expect(isLikelyHallucination(text, 30)).toBe(false);
	});

	// ── Repeated sentences ──

	it("flags text with 3+ identical sentences", () => {
		const text = "Hello world. Hello world. Hello world. Hello world. Hello world. Hello world.";
		expect(isLikelyHallucination(text, 30)).toBe(true);
	});

	it("flags text with 3+ near-identical sentences (case/spacing differences)", () => {
		const text = "Hello world.  Hello World. hello world. Other. Different. Another.";
		expect(isLikelyHallucination(text, 30)).toBe(true);
	});

	it("does NOT flag text with fewer than 6 sentences total", () => {
		// The check only runs when there are ≥6 sentences
		const text = "A. B. C. D. E.";
		expect(isLikelyHallucination(text, 30)).toBe(false);
	});

	it("does NOT flag text with 6+ unique sentences", () => {
		const text = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. Sixth sentence.";
		expect(isLikelyHallucination(text, 30)).toBe(false);
	});

	it("does NOT flag text with only 2 repeated sentences among 6+", () => {
		const text = "Hello. Hello. World. Different. Another. Unique.";
		expect(isLikelyHallucination(text, 30)).toBe(false);
	});

	// ── Combined checks priority ──

	it("flags speed before repeated blocks", () => {
		// Both speed and blocks would trigger — speed check comes first
		const words = Array(30).fill("word").join(" ");
		const text = words + "\n---\n" + words + "\n---\n" + words;
		expect(isLikelyHallucination(text, 1)).toBe(true);
	});

	// ── Realistic hallucination examples ──

	it("flags typical Whisper hallucination: repeated thank you", () => {
		const text = "Thank you. Thank you. Thank you. Thank you. Thank you. Thank you.";
		expect(isLikelyHallucination(text, 2)).toBe(true);
	});

	it("flags typical silence hallucination: music descriptions", () => {
		// Whisper often generates this for silence
		const text = "Music playing in the background.\n---\nMusic playing in the background.\n---\nMusic playing in the background.";
		expect(isLikelyHallucination(text, 5)).toBe(true);
	});
});
