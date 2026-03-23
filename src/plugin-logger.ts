// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe

// ── In-memory log buffer (ring buffer, last 500 entries) ──

const LOG_BUFFER_SIZE = 500;
const logBuffer: string[] = [];

function pushLog(level: string, args: unknown[]): void {
	const ts = new Date().toISOString();
	const msg = args
		.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
		.join(" ");
	logBuffer.push(`[${ts}] [${level}] ${msg}`);
	if (logBuffer.length > LOG_BUFFER_SIZE) {
		logBuffer.shift();
	}
}

/** Voxtral-specific logger that stores entries in the ring buffer. */
export const vlog = {
	debug: (...args: unknown[]): void => {
		pushLog("DEBUG", args);
		console.debug(...args);
	},
	warn: (...args: unknown[]): void => {
		pushLog("WARN", args);
		console.warn(...args);
	},
	error: (...args: unknown[]): void => {
		pushLog("ERROR", args);
		console.error(...args);
	},
};

/**
 * Redact potentially sensitive content from a log line before export.
 * Strips transcription text fragments and API keys that may have
 * ended up in error messages or debug output.
 */
function redactForExport(line: string): string {
	// Redact anything that looks like an API key (32+ hex/alphanumeric chars)
	let redacted = line.replace(/\b[A-Za-z0-9]{32,}\b/g, "[REDACTED]");
	// Redact quoted transcription text (common in debug output)
	redacted = redacted.replace(/"[^"]{20,}"/g, '"[text redacted]"');
	// Redact text after known transcription-related prefixes
	redacted = redacted.replace(
		/(full text:|Hallucination detected —|Discarding hallucinated) .+/gi,
		"$1 [redacted]",
	);
	return redacted;
}

/** Get all buffered log entries as a single string, with sensitive content redacted. */
export function getLogText(): string {
	return logBuffer.map(redactForExport).join("\n");
}

/** Get the number of buffered log entries. */
export function getLogCount(): number {
	return logBuffer.length;
}
