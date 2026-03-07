/**
 * Audio recording with two outputs:
 * 1. PCM 16-bit 16kHz mono stream (for realtime WebSocket)
 * 2. WebM/Opus blob (for batch transcription)
 */

export interface AudioLevelCallback {
	(level: number): void; // 0.0 - 1.0
}

export class AudioRecorder {
	private stream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private processorNode: ScriptProcessorNode | null = null;
	private analyserNode: AnalyserNode | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];

	private onPcmChunk: ((pcmData: ArrayBuffer) => void) | null = null;
	private onLevelChange: AudioLevelCallback | null = null;
	private smoothLevel = 0;

	async start(
		deviceId?: string,
		onPcmChunk?: (pcmData: ArrayBuffer) => void,
		onLevelChange?: AudioLevelCallback
	): Promise<void> {
		this.onPcmChunk = onPcmChunk || null;
		this.onLevelChange = onLevelChange || null;

		const constraints: MediaStreamConstraints = {
			audio: deviceId
				? { deviceId: { exact: deviceId } }
				: true,
		};

		this.stream = await navigator.mediaDevices.getUserMedia(constraints);
		this.audioContext = new AudioContext({ sampleRate: 16000 });
		this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

		// Analyser for level metering
		this.analyserNode = this.audioContext.createAnalyser();
		this.analyserNode.fftSize = 256;
		this.sourceNode.connect(this.analyserNode);

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

		// Start level monitoring
		this.monitorLevel();
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

	private monitorLevel(): void {
		if (!this.analyserNode) return;

		const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

		const tick = () => {
			if (!this.analyserNode) return;
			this.analyserNode.getByteTimeDomainData(dataArray);

			// Calculate RMS
			let sum = 0;
			for (let i = 0; i < dataArray.length; i++) {
				const v = (dataArray[i] - 128) / 128;
				sum += v * v;
			}
			const rms = Math.sqrt(sum / dataArray.length);
			const level = Math.min(1, rms * 4); // Scale up for visibility

			// Smooth with EMA
			this.smoothLevel = this.smoothLevel * 0.9 + level * 0.1;
			this.onLevelChange?.(this.smoothLevel);

			if (this.stream) {
				requestAnimationFrame(tick);
			}
		};
		requestAnimationFrame(tick);
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
		if (this.analyserNode) {
			this.analyserNode.disconnect();
			this.analyserNode = null;
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
		this.smoothLevel = 0;
	}

	get isRecording(): boolean {
		return this.stream !== null;
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
