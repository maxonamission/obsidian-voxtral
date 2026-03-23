// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { requestUrl } from "obsidian";
import { VoxtralSettings, DEFAULT_CORRECT_PROMPT } from "./types";
import {
	createAuthenticatedWebSocket,
	WS_OPEN,
	type AuthenticatedWsConnection,
} from "./authenticated-websocket";

const BASE_URL = "https://api.mistral.ai";

/**
 * Extract a user-friendly error message from an API response.
 * Avoids leaking raw response bodies (which may contain internal
 * details, stack traces, or echoed credentials) to the UI.
 */
function sanitizeApiError(status: number, rawBody: string): string {
	// Try to extract a clean "message" field from JSON error responses
	try {
		const parsed = JSON.parse(rawBody);
		const msg = parsed?.message || parsed?.error?.message;
		if (typeof msg === "string" && msg.length < 200) {
			return `HTTP ${status}: ${msg}`;
		}
	} catch {
		// Not JSON — fall through
	}

	// Common status codes with human-readable descriptions
	switch (status) {
		case 401:
			return "HTTP 401: Invalid or expired API key";
		case 403:
			return "HTTP 403: Access denied";
		case 404:
			return "HTTP 404: API endpoint not found (check model name)";
		case 413:
			return "HTTP 413: Audio file too large";
		case 429:
			return "HTTP 429: Rate limit exceeded — try again later";
		case 500:
		case 502:
		case 503:
			return `HTTP ${status}: Mistral API server error — try again later`;
		default:
			return `HTTP ${status}: Request failed`;
	}
}

// ── Model listing ──

export interface MistralModel {
	id: string;
	type?: string;
	capabilities?: Record<string, boolean>;
}

/**
 * Fetch available models from the Mistral API.
 * Returns model IDs sorted alphabetically.
 */
export async function listModels(
	apiKey: string
): Promise<MistralModel[]> {
	if (!apiKey) return [];

	try {
		const response = await requestUrl({
			url: `${BASE_URL}/v1/models`,
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (response.status !== 200) {
			console.warn(
				`Voxtral: Failed to list models (${response.status})`
			);
			return [];
		}

		const data = response.json;
		const models: MistralModel[] = (data.data || []).map(
			(m: { id: string; type?: string; capabilities?: Record<string, boolean> }) => ({
				id: m.id,
				type: m.type,
				capabilities: m.capabilities,
			})
		);

		models.sort((a, b) => a.id.localeCompare(b.id));
		return models;
	} catch (e) {
		console.warn("Voxtral: Could not fetch models", e);
		return [];
	}
}

// ── Hallucination detection ──

/**
 * Detect likely hallucinated transcription output.
 * Whisper-style models hallucinate when given silence or very short audio,
 * producing repetitive or impossibly long text.
 */
export function isLikelyHallucination(
	text: string,
	audioDurationSec: number
): boolean {
	if (!text.trim()) return false;

	const words = text.trim().split(/\s+/).length;
	const wordsPerSec = audioDurationSec > 0 ? words / audioDurationSec : words;

	// Normal speech is ~2-3 words/sec. Allow generous headroom but
	// flag anything over 5 words/sec as suspicious.
	if (wordsPerSec > 5 && words > 20) {
		console.warn(
			`Voxtral: Hallucination detected — ${words} words in ${audioDurationSec.toFixed(1)}s (${wordsPerSec.toFixed(1)} w/s)`
		);
		return true;
	}

	// Detect repetitive blocks: split on horizontal rules or repeated
	// sentence patterns.  3+ similar blocks = hallucination.
	const blocks = text.split(/\n---\n|^---$/m).filter((b) => b.trim());
	if (blocks.length >= 3) {
		console.warn(
			`Voxtral: Hallucination detected — ${blocks.length} repeated blocks separated by ---`
		);
		return true;
	}

	// Detect repeated sentences (3+ identical or near-identical)
	const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
	if (sentences.length >= 6) {
		const normalized = sentences.map((s) =>
			s.trim().toLowerCase().replace(/\s+/g, " ")
		);
		const counts = new Map<string, number>();
		for (const s of normalized) {
			counts.set(s, (counts.get(s) || 0) + 1);
		}
		for (const [, count] of counts) {
			if (count >= 3) {
				console.warn(
					"Voxtral: Hallucination detected — repeated sentences"
				);
				return true;
			}
		}
	}

	return false;
}

// ── Batch transcription ──

export async function transcribeBatch(
	audioBlob: Blob,
	settings: VoxtralSettings,
	diarize = false
): Promise<string> {
	// Derive filename extension from the blob's actual mime type
	const ext = audioBlob.type.includes("mp4")
		? "m4a"
		: audioBlob.type.includes("ogg")
			? "ogg"
			: "webm";
	const mimeType = audioBlob.type || `audio/${ext}`;

	// Use Obsidian's requestUrl with a manually built multipart body,
	// since requestUrl does not support FormData.
	const boundary = `----VoxtralBoundary${Date.now()}`;
	const arrayBuf = await audioBlob.arrayBuffer();
	const fileBytes = new Uint8Array(arrayBuf);

	let textParts = "";
	textParts += `--${boundary}\r\n`;
	textParts += `Content-Disposition: form-data; name="file"; filename="recording.${ext}"\r\n`;
	textParts += `Content-Type: ${mimeType}\r\n\r\n`;

	const afterFile = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${settings.batchModel}\r\n`;

	let extraFields = "";
	if (settings.language) {
		extraFields += `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${settings.language}\r\n`;
	}
	if (diarize) {
		extraFields += `--${boundary}\r\nContent-Disposition: form-data; name="diarize"\r\n\r\ntrue\r\n`;
	}
	extraFields += `--${boundary}--\r\n`;

	const enc = new TextEncoder();
	const headerBuf = enc.encode(textParts);
	const tailBuf = enc.encode(afterFile + extraFields);
	const body = new Uint8Array(headerBuf.length + fileBytes.length + tailBuf.length);
	body.set(headerBuf, 0);
	body.set(fileBytes, headerBuf.length);
	body.set(tailBuf, headerBuf.length + fileBytes.length);

	const response = await requestUrl({
		url: `${BASE_URL}/v1/audio/transcriptions`,
		method: "POST",
		headers: {
			Authorization: `Bearer ${settings.apiKey}`,
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
		},
		body: body.buffer,
	});

	if (response.status !== 200) {
		throw new Error(
			`Transcription failed: ${sanitizeApiError(response.status, response.text)}`
		);
	}
	return response.json?.text || "";
}

// ── Text correction ──

export async function correctText(
	text: string,
	settings: VoxtralSettings
): Promise<string> {
	const systemPrompt = settings.systemPrompt || DEFAULT_CORRECT_PROMPT;

	const body = {
		model: settings.correctModel,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: text },
		],
		temperature: 0.1,
	};

	const response = await requestUrl({
		url: `${BASE_URL}/v1/chat/completions`,
		method: "POST",
		headers: {
			Authorization: `Bearer ${settings.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (response.status !== 200) {
		throw new Error(
			`Correction failed: ${sanitizeApiError(response.status, response.text)}`
		);
	}

	const data = response.json;
	let result = data.choices?.[0]?.message?.content?.trim() || text;

	// Strip any parenthesized commentary the LLM may have added that
	// was not present in the original text.  We only remove trailing
	// parenthesized blocks and standalone parenthesized lines that
	// don't appear in the input.
	result = stripLlmCommentary(result, text);

	// Guard against hallucination: if the correction is significantly
	// longer than the input, the model likely added invented content.
	// A corrected text should never be much longer than the original
	// (minor growth from e.g. expanding abbreviations is fine).
	if (result.length > text.length * 1.5 + 50) {
		console.warn(
			"Voxtral: Correction rejected — output is suspiciously longer than input",
			{ inputLen: text.length, outputLen: result.length }
		);
		return text;
	}

	return result;
}

/**
 * Remove parenthesized text blocks that the correction LLM added
 * but were NOT in the original transcription.
 */
function stripLlmCommentary(corrected: string, original: string): string {
	// Match parenthesized blocks (including multi-line)
	const parenPattern = /\s*\([^)]{10,}\)\s*/g;
	let cleaned = corrected;
	let match;

	while ((match = parenPattern.exec(corrected)) !== null) {
		const block = match[0].trim();
		// If this parenthesized block wasn't in the original, remove it
		if (!original.includes(block)) {
			cleaned = cleaned.replace(match[0], " ");
		}
	}

	return cleaned.trim();
}

// ── Realtime streaming transcription via WebSocket ──

export interface RealtimeCallbacks {
	onSessionCreated: () => void;
	onDelta: (text: string) => void;
	onDone: (text: string) => void;
	onError: (message: string) => void;
	onDisconnect: () => void;
}

export class RealtimeTranscriber {
	private ws: AuthenticatedWsConnection | null = null;
	private settings: VoxtralSettings;
	private callbacks: RealtimeCallbacks;
	private intentionallyClosed = false;
	private delayOverrideMs: number | null = null;

	constructor(settings: VoxtralSettings, callbacks: RealtimeCallbacks, delayOverrideMs?: number) {
		this.settings = settings;
		this.callbacks = callbacks;
		this.delayOverrideMs = delayOverrideMs ?? null;
	}

	async connect(): Promise<void> {
		this.intentionallyClosed = false;

		const params = new URLSearchParams({
			model: this.settings.realtimeModel,
		});

		const url = `wss://api.mistral.ai/v1/audio/transcriptions/realtime?${params}`;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.ws?.close();
				reject(new Error("WebSocket connection timeout"));
			}, 10000);

			this.ws = createAuthenticatedWebSocket(
				url,
				{ Authorization: `Bearer ${this.settings.apiKey}` },
				{
					onOpen: () => {
						// Wait for session.created
					},
					onMessage: (data: string) => {
						try {
							const msg = JSON.parse(data);
							console.debug(
								`Voxtral WS ← ${msg.type}`,
								msg.type === "transcription.text.delta"
									? msg.text?.slice(0, 50)
									: ""
							);
							switch (msg.type) {
								case "session.created":
									clearTimeout(timeout);
									this.sendSessionUpdate();
									this.callbacks.onSessionCreated();
									resolve();
									break;
								case "session.updated":
									console.debug(
										"Voxtral WS: session updated",
										JSON.stringify(msg.session || {})
									);
									break;
								case "transcription.text.delta":
									this.callbacks.onDelta(msg.text || "");
									break;
								case "transcription.done":
									console.debug(
										"Voxtral WS: transcription.done — full text:",
										msg.text?.slice(0, 200)
									);
									this.callbacks.onDone(msg.text || "");
									break;
								case "error":
									console.error(
										"Voxtral WS: server error:",
										JSON.stringify(msg.error)
									);
									this.callbacks.onError(
										msg.error?.message || "Unknown error"
									);
									break;
								default:
									console.debug(
										"Voxtral WS: unknown message type:",
										msg.type,
										data.slice(0, 300)
									);
									break;
							}
						} catch (e) {
							console.error(
								"Voxtral: failed to parse WS message",
								data.slice(0, 200),
								e
							);
						}
					},
					onError: (err: Error) => {
						clearTimeout(timeout);
						console.error("Voxtral: WebSocket error", err);
						reject(
							new Error(
								`WebSocket connection failed: ${err.message}`
							)
						);
					},
					onClose: () => {
						console.debug(
							`Voxtral WS: connection closed (intentional=${this.intentionallyClosed})`
						);
						this.ws = null;
						if (!this.intentionallyClosed) {
							this.callbacks.onDisconnect();
						}
					},
				}
			);
		});
	}

	private sendSessionUpdate(): void {
		if (!this.ws) return;
		const delayMs = this.delayOverrideMs ?? this.settings.streamingDelayMs;
		const msg = {
			type: "session.update",
			session: {
				audio_format: {
					encoding: "pcm_s16le",
					sample_rate: 16000,
				},
				target_streaming_delay_ms: delayMs,
			},
		};
		this.ws.send(JSON.stringify(msg));
	}

	sendAudio(pcmBytes: ArrayBuffer): void {
		if (!this.ws || this.ws.readyState !== WS_OPEN) return;

		const base64 = arrayBufferToBase64(pcmBytes);
		const msg = {
			type: "input_audio.append",
			audio: base64,
		};
		this.ws.send(JSON.stringify(msg));
	}

	flush(): void {
		if (!this.ws || this.ws.readyState !== WS_OPEN) return;
		this.ws.send(JSON.stringify({ type: "input_audio.flush" }));
	}

	endAudio(): void {
		if (!this.ws || this.ws.readyState !== WS_OPEN) return;
		this.ws.send(JSON.stringify({ type: "input_audio.end" }));
	}

	close(): void {
		this.intentionallyClosed = true;
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	get isConnected(): boolean {
		return this.ws?.readyState === WS_OPEN;
	}
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
