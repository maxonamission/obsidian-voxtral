import { requestUrl } from "obsidian";
import { VoxtralSettings, DEFAULT_CORRECT_PROMPT } from "./types";

const BASE_URL = "https://api.mistral.ai";

// ── Batch transcription ──

export async function transcribeBatch(
	audioBlob: Blob,
	settings: VoxtralSettings,
	diarize = false
): Promise<string> {
	const formData = new FormData();
	formData.append("file", audioBlob, "recording.webm");
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
	return data.choices?.[0]?.message?.content?.trim() || text;
}

// ── Realtime streaming transcription via WebSocket ──

export interface RealtimeCallbacks {
	onSessionCreated: () => void;
	onDelta: (text: string) => void;
	onDone: (text: string) => void;
	onError: (message: string) => void;
}

export class RealtimeTranscriber {
	private ws: WebSocket | null = null;
	private settings: VoxtralSettings;
	private callbacks: RealtimeCallbacks;

	constructor(settings: VoxtralSettings, callbacks: RealtimeCallbacks) {
		this.settings = settings;
		this.callbacks = callbacks;
	}

	async connect(): Promise<void> {
		const params = new URLSearchParams({
			model: this.settings.realtimeModel,
			api_key: this.settings.apiKey,
		});

		const url = `wss://api.mistral.ai/v1/audio/transcriptions/realtime?${params}`;

		return new Promise((resolve, reject) => {
			this.ws = new WebSocket(url);

			this.ws.onopen = () => {
				// Wait for session.created before resolving
			};

			this.ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data);
					switch (msg.type) {
						case "session.created":
							this.sendSessionUpdate();
							this.callbacks.onSessionCreated();
							resolve();
							break;
						case "session.updated":
							// Session config confirmed
							break;
						case "transcription.text.delta":
							this.callbacks.onDelta(msg.text || "");
							break;
						case "transcription.done":
							this.callbacks.onDone(msg.text || "");
							break;
						case "error":
							this.callbacks.onError(
								msg.error?.message || "Unknown error"
							);
							break;
					}
				} catch (e) {
					console.error("Voxtral: failed to parse WS message", e);
				}
			};

			this.ws.onerror = (event) => {
				console.error("Voxtral: WebSocket error", event);
				reject(new Error("WebSocket connection failed"));
			};

			this.ws.onclose = () => {
				this.ws = null;
			};

			// Timeout after 10s
			setTimeout(() => {
				if (this.ws?.readyState !== WebSocket.OPEN) {
					this.ws?.close();
					reject(new Error("WebSocket connection timeout"));
				}
			}, 10000);
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
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		const base64 = arrayBufferToBase64(pcmBytes);
		const msg = {
			type: "input_audio_buffer.append",
			audio: base64,
		};
		this.ws.send(JSON.stringify(msg));
	}

	flush(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify({ type: "input_audio_buffer.flush" }));
	}

	endAudio(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify({ type: "input_audio_buffer.end" }));
	}

	close(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	get isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
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
