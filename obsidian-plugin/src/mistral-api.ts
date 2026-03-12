import { Platform, requestUrl } from "obsidian";
import { VoxtralSettings, DEFAULT_CORRECT_PROMPT } from "./types";

const BASE_URL = "https://api.mistral.ai";

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

	// On mobile, use Obsidian's requestUrl (bypasses CORS / platform
	// restrictions) with a manually built multipart body, since
	// requestUrl does not support FormData.
	if (Platform.isMobile) {
		const boundary = `----VoxtralBoundary${Date.now()}`;
		const arrayBuf = await audioBlob.arrayBuffer();
		const fileBytes = new Uint8Array(arrayBuf);

		// Build multipart parts as text
		let textParts = "";
		textParts += `--${boundary}\r\n`;
		textParts += `Content-Disposition: form-data; name="file"; filename="recording.${ext}"\r\n`;
		textParts += `Content-Type: ${mimeType}\r\n\r\n`;

		// We'll append the binary after the text header
		const afterFile = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${settings.batchModel}\r\n`;

		let extraFields = "";
		if (settings.language) {
			extraFields += `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${settings.language}\r\n`;
		}
		if (diarize) {
			extraFields += `--${boundary}\r\nContent-Disposition: form-data; name="diarize"\r\n\r\ntrue\r\n`;
		}
		extraFields += `--${boundary}--\r\n`;

		// Combine text + binary + text into a single ArrayBuffer
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
				`Transcription failed (${response.status}): ${response.text}`
			);
		}
		return response.json?.text || "";
	}

	// Desktop: use standard fetch + FormData
	const formData = new FormData();
	formData.append("file", audioBlob, `recording.${ext}`);
	formData.append("model", settings.batchModel);
	if (settings.language) {
		formData.append("language", settings.language);
	}
	if (diarize) {
		formData.append("diarize", "true");
	}

	const response = await fetch(`${BASE_URL}/v1/audio/transcriptions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${settings.apiKey}`,
		},
		body: formData,
	});

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`Transcription failed (${response.status}): ${err}`);
	}

	const data = await response.json();
	return data.text || "";
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
			`Correction failed (${response.status}): ${response.text}`
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

interface WsConnection {
	send: (data: string) => void;
	close: () => void;
	readyState: number;
}

const WS_OPEN = 1;

function createNodeWebSocket(
	url: string,
	headers: Record<string, string>,
	callbacks: {
		onOpen: () => void;
		onMessage: (data: string) => void;
		onError: (err: Error) => void;
		onClose: () => void;
	}
): WsConnection {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const https = require("https") as typeof import("https");
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const crypto = require("crypto") as typeof import("crypto");

	const parsed = new URL(url);
	const wsKey = crypto.randomBytes(16).toString("base64");

	const conn: WsConnection = {
		readyState: 0,
		send: () => {},
		close: () => {},
	};

	const req = https.request(
		{
			hostname: parsed.hostname,
			port: parsed.port || 443,
			path: parsed.pathname + parsed.search,
			method: "GET",
			headers: {
				...headers,
				Connection: "Upgrade",
				Upgrade: "websocket",
				"Sec-WebSocket-Version": "13",
				"Sec-WebSocket-Key": wsKey,
			},
		},
		(res) => {
			callbacks.onError(
				new Error(`WebSocket upgrade failed: HTTP ${res.statusCode}`)
			);
		}
	);

	req.on("upgrade", (res, socket) => {
		conn.readyState = WS_OPEN;

		conn.send = (data: string) => {
			const payload = Buffer.from(data, "utf-8");
			const mask = crypto.randomBytes(4);
			let header: Buffer;

			if (payload.length < 126) {
				header = Buffer.alloc(6);
				header[0] = 0x81;
				header[1] = 0x80 | payload.length;
				mask.copy(header, 2);
			} else if (payload.length < 65536) {
				header = Buffer.alloc(8);
				header[0] = 0x81;
				header[1] = 0x80 | 126;
				header.writeUInt16BE(payload.length, 2);
				mask.copy(header, 4);
			} else {
				header = Buffer.alloc(14);
				header[0] = 0x81;
				header[1] = 0x80 | 127;
				header.writeBigUInt64BE(BigInt(payload.length), 2);
				mask.copy(header, 10);
			}

			const masked = Buffer.alloc(payload.length);
			for (let i = 0; i < payload.length; i++) {
				masked[i] = payload[i] ^ mask[i % 4];
			}

			socket.write(Buffer.concat([header, masked]));
		};

		conn.close = () => {
			conn.readyState = 3;
			const closeFrame = Buffer.alloc(6);
			closeFrame[0] = 0x88;
			closeFrame[1] = 0x80;
			const mask = crypto.randomBytes(4);
			mask.copy(closeFrame, 2);
			try {
				socket.write(closeFrame);
			} catch {
				// Socket may already be closed
			}
			socket.end();
		};

		// Client-side ping every 15s to keep the connection alive
		const pingInterval = setInterval(() => {
			if (conn.readyState !== WS_OPEN) {
				clearInterval(pingInterval);
				return;
			}
			try {
				const pingFrame = Buffer.alloc(6);
				pingFrame[0] = 0x89; // FIN + ping opcode
				pingFrame[1] = 0x80; // MASK + 0 length
				const pingMask = crypto.randomBytes(4);
				pingMask.copy(pingFrame, 2);
				socket.write(pingFrame);
			} catch {
				// Socket may be dead
			}
		}, 15000);

		callbacks.onOpen();

		let buffer = Buffer.alloc(0);

		socket.on("data", (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk]);

			while (buffer.length >= 2) {
				const firstByte = buffer[0];
				const secondByte = buffer[1];
				const opcode = firstByte & 0x0f;
				const isMasked = (secondByte & 0x80) !== 0;
				let payloadLength = secondByte & 0x7f;
				let offset = 2;

				if (payloadLength === 126) {
					if (buffer.length < 4) return;
					payloadLength = buffer.readUInt16BE(2);
					offset = 4;
				} else if (payloadLength === 127) {
					if (buffer.length < 10) return;
					payloadLength = Number(buffer.readBigUInt64BE(2));
					offset = 10;
				}

				if (isMasked) offset += 4;

				if (buffer.length < offset + payloadLength) return;

				let payload = buffer.subarray(offset, offset + payloadLength);

				if (isMasked) {
					const maskKey = buffer.subarray(offset - 4, offset);
					payload = Buffer.from(payload);
					for (let i = 0; i < payload.length; i++) {
						payload[i] ^= maskKey[i % 4];
					}
				}

				buffer = buffer.subarray(offset + payloadLength);

				if (opcode === 0x01) {
					callbacks.onMessage(payload.toString("utf-8"));
				} else if (opcode === 0x08) {
					// Close frame — extract close code and reason
					let closeCode = 0;
					let closeReason = "";
					if (payload.length >= 2) {
						closeCode = payload.readUInt16BE(0);
						if (payload.length > 2) {
							closeReason = payload
								.subarray(2)
								.toString("utf-8");
						}
					}
					console.log(
						`Voxtral: WebSocket close frame received — code=${closeCode} reason="${closeReason}"`
					);
					conn.readyState = 3;
					clearInterval(pingInterval);
					socket.end();
					callbacks.onClose();
					return;
				} else if (opcode === 0x09) {
					// Ping — send pong echoing the payload (RFC 6455 §5.5.3)
					const pongMask = crypto.randomBytes(4);
					const pongLen = payload.length;
					let pongHeader: Buffer;
					if (pongLen < 126) {
						pongHeader = Buffer.alloc(6);
						pongHeader[0] = 0x8a; // FIN + pong
						pongHeader[1] = 0x80 | pongLen;
						pongMask.copy(pongHeader, 2);
					} else {
						pongHeader = Buffer.alloc(8);
						pongHeader[0] = 0x8a;
						pongHeader[1] = 0x80 | 126;
						pongHeader.writeUInt16BE(pongLen, 2);
						pongMask.copy(pongHeader, 4);
					}
					const maskedPong = Buffer.from(payload);
					for (let i = 0; i < maskedPong.length; i++) {
						maskedPong[i] ^= pongMask[i % 4];
					}
					socket.write(Buffer.concat([pongHeader, maskedPong]));
				}
			}
		});

		socket.on("close", () => {
			conn.readyState = 3;
			clearInterval(pingInterval);
			callbacks.onClose();
		});

		socket.on("error", (err: Error) => {
			clearInterval(pingInterval);
			callbacks.onError(err);
		});
	});

	req.on("error", (err) => {
		callbacks.onError(err);
	});

	req.end();

	return conn;
}

export class RealtimeTranscriber {
	private ws: WsConnection | null = null;
	private settings: VoxtralSettings;
	private callbacks: RealtimeCallbacks;
	private intentionallyClosed = false;

	constructor(settings: VoxtralSettings, callbacks: RealtimeCallbacks) {
		this.settings = settings;
		this.callbacks = callbacks;
	}

	async connect(): Promise<void> {
		this.intentionallyClosed = false;

		const params = new URLSearchParams({
			model: this.settings.realtimeModel,
		});

		const url = `https://api.mistral.ai/v1/audio/transcriptions/realtime?${params}`;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.ws?.close();
				reject(new Error("WebSocket connection timeout"));
			}, 10000);

			this.ws = createNodeWebSocket(
				url,
				{
					Authorization: `Bearer ${this.settings.apiKey}`,
				},
				{
					onOpen: () => {
						// Wait for session.created
					},
					onMessage: (data: string) => {
						try {
							const msg = JSON.parse(data);
							console.log(
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
									console.log(
										"Voxtral WS: session updated",
										JSON.stringify(msg.session || {})
									);
									break;
								case "transcription.text.delta":
									this.callbacks.onDelta(msg.text || "");
									break;
								case "transcription.done":
									console.log(
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
									console.log(
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
						console.log(
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
		const msg = {
			type: "session.update",
			session: {
				audio_format: {
					encoding: "pcm_s16le",
					sample_rate: 16000,
				},
				target_streaming_delay_ms: this.settings.streamingDelayMs,
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
