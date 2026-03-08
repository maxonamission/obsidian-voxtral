/**
 * Audio recording with two outputs:
 * 1. PCM 16-bit 16kHz mono stream (for realtime WebSocket)
 * 2. WebM/Opus blob (for batch transcription)
 */

export interface MicrophoneInfo {
	deviceId: string;
	label: string;
}

export class AudioRecorder {
	private stream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private processorNode: ScriptProcessorNode | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];

	private onPcmChunk: ((pcmData: ArrayBuffer) => void) | null = null;

	/** The label of the currently active microphone */
	activeMicLabel = "";

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

		// Determine active mic label from stream track
		const audioTrack = this.stream.getAudioTracks()[0];
		this.activeMicLabel = audioTrack?.label || "Onbekende microfoon";

		this.audioContext = new AudioContext({ sampleRate: 16000 });
		this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

		// ScriptProcessor for PCM capture (realtime mode)
		if (this.onPcmChunk) {
			this.processorNode = this.audioContext.createScriptProcessor(
				4096,
				1,
				1
			);
			this.processorNode.onaudioprocess = (e) => {
				this.processAudio(e);
			};
			this.sourceNode.connect(this.processorNode);
			this.processorNode.connect(this.audioContext.destination);
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
	}

	private processAudio(e: AudioProcessingEvent): void {
		const inputData = e.inputBuffer.getChannelData(0);
		const pcm16 = new Int16Array(inputData.length);
		for (let i = 0; i < inputData.length; i++) {
			const s = Math.max(-1, Math.min(1, inputData[i]));
			pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}
		this.onPcmChunk?.(pcm16.buffer);
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

			this.mediaRecorder.onstop = () => {
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
		if (this.processorNode) {
			this.processorNode.disconnect();
			this.processorNode = null;
		}
		if (this.sourceNode) {
			this.sourceNode.disconnect();
			this.sourceNode = null;
		}
		if (this.audioContext) {
			this.audioContext.close();
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
