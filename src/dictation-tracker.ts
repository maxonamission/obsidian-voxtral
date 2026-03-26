// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { Editor } from "obsidian";
import { processText, isSlotActive } from "./voice-commands";
import { correctText } from "./mistral-api";
import { VoxtralSettings } from "./types";
import { vlog } from "./plugin-logger";

/**
 * Tracks which ranges of text were inserted by dictation,
 * so that auto-correct can target only dictated text.
 */
export class DictationTracker {
	private dictatedRanges: Array<{ from: number; to: number }> = [];

	/** Clear all tracked ranges (call when recording starts/stops). */
	reset(): void {
		this.dictatedRanges = [];
	}

	/**
	 * Wrap processText to track what was inserted in the editor.
	 * Records the cursor offset before and after to determine the
	 * range of inserted text, and adjusts existing ranges when an
	 * insertion shifts them.
	 *
	 * @param onSlotActive — optional callback when a slot becomes active
	 */
	trackProcessText(
		editor: Editor,
		text: string,
		onSlotActive?: () => void,
	): void {
		const offsetBefore = editor.posToOffset(editor.getCursor());
		processText(editor, text);
		// If a slot was activated, notify caller
		if (isSlotActive() && onSlotActive) {
			onSlotActive();
		}
		const offsetAfter = editor.posToOffset(editor.getCursor());
		const delta = offsetAfter - offsetBefore;

		if (delta > 0) {
			// Insertion: adjust existing ranges that sit at or after
			// the insertion point, then record the new range.
			for (const range of this.dictatedRanges) {
				if (range.from >= offsetBefore) {
					range.from += delta;
					range.to += delta;
				} else if (range.to > offsetBefore) {
					range.to += delta;
				}
			}
			this.dictatedRanges.push({ from: offsetBefore, to: offsetAfter });
		} else if (delta < 0) {
			// Deletion (voice command like "delete last paragraph"):
			// adjust existing ranges but don't record a new one.
			const deletedLen = -delta;
			const deletedFrom = offsetAfter;
			const deletedTo = offsetBefore;

			for (const range of this.dictatedRanges) {
				if (range.from >= deletedTo) {
					range.from -= deletedLen;
					range.to -= deletedLen;
				} else if (range.from >= deletedFrom) {
					range.from = deletedFrom;
					range.to = range.to <= deletedTo
						? deletedFrom
						: range.to - deletedLen;
				} else if (range.to > deletedFrom) {
					range.to = range.to <= deletedTo
						? deletedFrom
						: range.to - deletedLen;
				}
			}
			this.dictatedRanges = this.dictatedRanges.filter(
				(r) => r.to > r.from,
			);
		}
	}

	/**
	 * Insert text at cursor and track the range for auto-correct.
	 * Handles auto-spacing between existing text and new text.
	 */
	trackInsertAtCursor(editor: Editor, text: string): void {
		const cursor = editor.getCursor();

		// Never start a line with spaces from auto-transcription
		// (preserve newlines — those are intentional formatting)
		if (cursor.ch === 0) {
			text = text.replace(/^ +/, "");
		}

		// Auto-space (skip when slot is active — text follows a
		// formatting prefix like "**" and a space would break markdown)
		if (cursor.ch > 0 && text.length > 0 && !/^[\s\n]/.test(text) && !isSlotActive()) {
			const charBefore = editor.getRange(
				{ line: cursor.line, ch: cursor.ch - 1 },
				cursor,
			);
			if (charBefore && /\S/.test(charBefore)) {
				text = " " + text;
			}
		}

		const offsetBefore = editor.posToOffset(cursor);
		editor.replaceRange(text, cursor);
		const lines = text.split("\n");
		const lastLine = lines[lines.length - 1];
		const newLine = cursor.line + lines.length - 1;
		const newCh =
			lines.length === 1
				? cursor.ch + lastLine.length
				: lastLine.length;
		editor.setCursor({ line: newLine, ch: newCh });
		const offsetAfter = editor.posToOffset(editor.getCursor());
		const delta = offsetAfter - offsetBefore;

		if (delta > 0) {
			for (const range of this.dictatedRanges) {
				if (range.from >= offsetBefore) {
					range.from += delta;
					range.to += delta;
				} else if (range.to > offsetBefore) {
					range.to += delta;
				}
			}
			this.dictatedRanges.push({ from: offsetBefore, to: offsetAfter });
		}
	}

	/** True when at least one dictated range has been recorded. */
	hasRanges(): boolean {
		return this.dictatedRanges.length > 0;
	}

	/** Record a range directly (for dual-delay finalization). */
	addRange(from: number, to: number): void {
		this.dictatedRanges.push({ from, to });
	}

	/**
	 * After stopping realtime recording, correct only the text
	 * that was actually dictated.  Each tracked range is corrected
	 * independently, processed from end to start so that earlier
	 * offsets remain valid after replacements.
	 */
	async autoCorrectAfterStop(
		editor: Editor,
		settings: VoxtralSettings,
	): Promise<void> {
		if (this.dictatedRanges.length === 0) return;

		const merged = DictationTracker.mergeRanges(this.dictatedRanges);
		merged.sort((a, b) => b.from - a.from); // end-to-start

		const fullText = editor.getValue();

		// Pre-compute positions and extract text before making changes
		const corrections: Array<{
			from: { line: number; ch: number };
			to: { line: number; ch: number };
			text: string;
		}> = [];

		for (const range of merged) {
			if (
				range.from >= fullText.length ||
				range.to > fullText.length
			) {
				continue;
			}
			const text = fullText.substring(range.from, range.to);
			if (!text.trim()) continue;
			corrections.push({
				from: editor.offsetToPos(range.from),
				to: editor.offsetToPos(range.to),
				text,
			});
		}

		// Correct each range and replace (end-to-start preserves offsets)
		for (const c of corrections) {
			try {
				const corrected = await correctText(c.text, settings);
				if (corrected && corrected !== c.text) {
					editor.replaceRange(corrected, c.from, c.to);
				}
			} catch (e) {
				vlog.error("Voxtral: Auto-correct failed", e);
			}
		}
	}

	/**
	 * Merge overlapping or adjacent dictated ranges into a minimal set.
	 */
	private static mergeRanges(
		ranges: Array<{ from: number; to: number }>,
	): Array<{ from: number; to: number }> {
		if (ranges.length === 0) return [];

		const sorted = [...ranges].sort((a, b) => a.from - b.from);
		const merged = [sorted[0]];

		for (let i = 1; i < sorted.length; i++) {
			const prev = merged[merged.length - 1];
			const cur = sorted[i];
			if (cur.from <= prev.to) {
				prev.to = Math.max(prev.to, cur.to);
			} else {
				merged.push({ ...cur });
			}
		}
		return merged;
	}
}
