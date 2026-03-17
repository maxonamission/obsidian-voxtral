// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
/**
 * Audio recording with two outputs:
 * 1. PCM 16-bit 16kHz mono stream (for realtime WebSocket)
 * 2. WebM/Opus blob (for batch transcription)
 */

/**
 * Inline AudioWorklet processor source.
 * Converts Float32 samples to PCM 16-bit and posts them to the main thread.
 * Inlined as a blob URL so no separate file needs to be loaded.
 */
const WORKLET_SOURCE = `
class PcmProcessor extends AudioWorkletProcessor {
	process(inputs) {
		const input = inputs[0];
		if (!input || input.length === 0) return true;
		const channelData = input[0];
		if (!channelData || channelData.length === 0) return true;
		const pcm16 = new Int16Array(channelData.length);
		for (let i = 0; i < channelData.length; i++) {
			const s = Math.max(-1, Math.min(1, channelData[i]));
			pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
		}
		this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
		return true;
	}
}
registerProcessor("pcm-processor", PcmProcessor);
`;

export interface MicrophoneInfo {
	deviceId: string;
	label: string;
}

export class AudioRecorder {
	private stream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private workletNode: AudioWorkletNode | null = null;
	private workletUrl: string | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private lastFlushTime = 0;

	private onPcmChunk: ((pcmData: ArrayBuffer) => void) | null = null;

	/** The label of the currently active microphone */
	activeMicLabel = "";

	/** Duration in seconds of the last flushed/stopped chunk */
	lastChunkDurationSec = 0;

	/**
	 * Enumerate available audio input devices.
	 * Requires a prior getUserMedia call for labels to be populated.
	 */
	static async enumerateMicrophones(): Promise<MicrophoneInfo[]> {
		// Request permission first so labels are available
		try {
			const tempStream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			tempStream.getTracks().forEach((t) => t.stop());
		} catch {
			// Permission denied or no mic
			return [];
		}

		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === "audioinput")
			.map((d) => ({
				deviceId: d.deviceId,
				label: d.label || `Microfoon (${d.deviceId.slice(0, 8)}...)`,
			}));
	}

	async start(
		deviceId?: string,
		onPcmChunk?: (pcmData: ArrayBuffer) => void
	): Promise<void> {
		this.onPcmChunk = onPcmChunk || null;

		const constraints: MediaStreamConstraints = {
			audio: deviceId ? { deviceId: { exact: deviceId } } : true,
		};

		this.stream = await navigator.mediaDevices.getUserMedia(constraints);

		try {
			// Determine active mic label from stream track
			const audioTrack = this.stream.getAudioTracks()[0];
			this.activeMicLabel = audioTrack?.label || "Onbekende microfoon";

			this.audioContext = new AudioContext({ sampleRate: 16000 });
			this.sourceNode = this.audioContext.createMediaStreamSource(
				this.stream
			);

			// AudioWorklet for PCM capture (realtime mode)
			if (this.onPcmChunk) {
				const blob = new Blob([WORKLET_SOURCE], {
					type: "application/javascript",
				});
				this.workletUrl = URL.createObjectURL(blob);
				await this.audioContext.audioWorklet.addModule(this.workletUrl);

				this.workletNode = new AudioWorkletNode(
					this.audioContext,
					"pcm-processor"
				);
				this.workletNode.port.onmessage = (e: MessageEvent) => {
					this.onPcmChunk?.(e.data as ArrayBuffer);
				};
				this.sourceNode.connect(this.workletNode);
				this.workletNode.connect(this.audioContext.destination);
			}

			// MediaRecorder for batch mode (WebM/Opus)
			this.chunks = [];
			this.mediaRecorder = new MediaRecorder(this.stream, {
				mimeType: this.getSupportedMimeType(),
			});
			this.mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					this.chunks.push(e.data);
				}
			};
			this.mediaRecorder.start(1000); // Collect in 1s chunks
			this.lastFlushTime = Date.now();
		} catch (e) {
			// Clean up already-acquired resources on failure
			this.cleanup();
			throw e;
		}
	}

	/**
	 * Flush current audio as a blob WITHOUT stopping the recording.
	 * Stops and restarts MediaRecorder so each blob is a complete,
	 * valid audio file with proper container headers.
	 */
	async flushChunk(): Promise<Blob> {
		return new Promise((resolve) => {
			if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") {
				resolve(new Blob([]));
				return;
			}

			// Safety timeout: if onstop never fires, resolve with
			// whatever we have and restart the recorder.
			const timeout = setTimeout(() => {
				console.warn("Voxtral: flushChunk timed out after 5s");
				const blob = new Blob(this.chunks, {
					type: this.getSupportedMimeType(),
				});
				this.chunks = [];
				resolve(blob);
			}, 5000);

			this.mediaRecorder.onstop = () => {
				clearTimeout(timeout);
				const now = Date.now();
				this.lastChunkDurationSec = (now - this.lastFlushTime) / 1000;
				this.lastFlushTime = now;

				const mimeType = this.getSupportedMimeType();
				const blob = new Blob(this.chunks, { type: mimeType });
				this.chunks = [];

				// Restart a fresh MediaRecorder so the next chunk
				// will also have proper container headers
				if (this.stream) {
					this.mediaRecorder = new MediaRecorder(this.stream, {
						mimeType,
					});
					this.mediaRecorder.ondataavailable = (e) => {
						if (e.data.size > 0) {
							this.chunks.push(e.data);
						}
					};
					this.mediaRecorder.start(1000);
				}

				resolve(blob);
			};

			this.mediaRecorder.stop();
		});
	}

	async stop(): Promise<Blob> {
		return new Promise((resolve) => {
			if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
				this.mediaRecorder.onstop = () => {
					this.lastChunkDurationSec =
						(Date.now() - this.lastFlushTime) / 1000;
					const blob = new Blob(this.chunks, {
						type: this.getSupportedMimeType(),
					});
					this.cleanup();
					resolve(blob);
				};
				this.mediaRecorder.stop();
			} else {
				this.cleanup();
				resolve(new Blob([]));
			}
		});
	}

	private cleanup(): void {
		if (this.workletNode) {
			this.workletNode.disconnect();
			this.workletNode = null;
		}
		if (this.workletUrl) {
			URL.revokeObjectURL(this.workletUrl);
			this.workletUrl = null;
		}
		if (this.sourceNode) {
			this.sourceNode.disconnect();
			this.sourceNode = null;
		}
		if (this.audioContext) {
			void this.audioContext.close();
			this.audioContext = null;
		}
		if (this.stream) {
			this.stream.getTracks().forEach((t) => t.stop());
			this.stream = null;
		}
		this.mediaRecorder = null;
		this.chunks = [];
		this.activeMicLabel = "";
	}

	get isRecording(): boolean {
		return this.stream !== null;
	}

	get isPaused(): boolean {
		return this.mediaRecorder?.state === "paused";
	}

	pause(): void {
		if (this.mediaRecorder?.state === "recording") {
			this.mediaRecorder.pause();
		}
		// Mute the mic track so the OS can release hardware
		this.stream?.getAudioTracks().forEach((t) => (t.enabled = false));
	}

	resume(): void {
		// Re-enable the mic track
		this.stream?.getAudioTracks().forEach((t) => (t.enabled = true));
		if (this.mediaRecorder?.state === "paused") {
			this.mediaRecorder.resume();
		}
	}

	/** Silence the mic input without pausing the recorder */
	mute(): void {
		this.stream?.getAudioTracks().forEach((t) => (t.enabled = false));
	}

	/** Re-enable the mic input */
	unmute(): void {
		this.stream?.getAudioTracks().forEach((t) => (t.enabled = true));
	}

	private getSupportedMimeType(): string {
		const types = [
			"audio/webm;codecs=opus",
			"audio/webm",
			"audio/ogg;codecs=opus",
			"audio/mp4",
		];
		for (const type of types) {
			if (MediaRecorder.isTypeSupported(type)) return type;
		}
		return "audio/webm";
	}
}
