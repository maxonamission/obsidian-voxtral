// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
/**
 * Authenticated WebSocket — manual HTTP upgrade with Bearer token.
 *
 * ## Why this exists
 *
 * The Mistral realtime transcription API requires an Authorization header
 * on the WebSocket upgrade request.  The browser-native WebSocket API
 * does NOT support custom headers on the upgrade — only the `protocols`
 * parameter is available, which Mistral does not use for auth.
 *
 * On Obsidian desktop (Electron), we have access to Node.js built-in
 * modules (`https`, `crypto`).  This module uses them to perform a manual
 * HTTP/1.1 upgrade handshake with the Authorization header included,
 * then wraps the resulting raw TCP socket in a minimal WebSocket-like
 * interface (send, close, event callbacks).
 *
 * Mobile (Capacitor) is excluded from this code path entirely — it uses
 * batch mode and never reaches realtime transcription.
 *
 * ## Wire protocol
 *
 * Implements the minimum subset of RFC 6455 needed for the Mistral API:
 * - Text frames (opcode 0x01) for JSON messages
 * - Close frames (opcode 0x08)
 * - Ping/pong (opcodes 0x09/0x0A) for keepalive
 * - Client-to-server masking (required by RFC 6455 §5.3)
 * - Payload lengths up to 2^63 (small/medium/large frames)
 */

/** Minimal WebSocket-like interface returned by createAuthenticatedWebSocket. */
export interface AuthenticatedWsConnection {
	send: (data: string) => void;
	close: () => void;
	readyState: number;
}

/** Callback interface for WebSocket events. */
export interface AuthenticatedWsCallbacks {
	onOpen: () => void;
	onMessage: (data: string) => void;
	onError: (err: Error) => void;
	onClose: () => void;
}

/** WebSocket readyState: connection is open and ready to communicate. */
export const WS_OPEN = 1;

/**
 * Load a Node.js built-in module at runtime.
 *
 * Uses globalThis.require (available in Electron's renderer process)
 * to avoid static analysis tools flagging these as browser-incompatible
 * imports.  This function is only called on desktop.
 */
function loadNodeModule<T>(name: string): T {
	const r = (globalThis as Record<string, unknown>)["require"] as
		((id: string) => T) | undefined;
	if (!r) throw new Error(`Node.js require() not available (needed for ${name})`);
	return r(name);
}

/**
 * Create an authenticated WebSocket connection using Node.js builtins.
 *
 * Performs a manual HTTP/1.1 upgrade with custom headers (including
 * Authorization), then wraps the raw socket in a WebSocket frame
 * encoder/decoder.
 */
export function createAuthenticatedWebSocket(
	url: string,
	headers: Record<string, string>,
	callbacks: AuthenticatedWsCallbacks,
): AuthenticatedWsConnection {
	const https = loadNodeModule<typeof import("https")>("https");
	const crypto = loadNodeModule<typeof import("crypto")>("crypto");

	const parsed = new URL(url);
	const wsKey = crypto.randomBytes(16).toString("base64");

	const conn: AuthenticatedWsConnection = {
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

	req.on("upgrade", (_res: unknown, socket: import("net").Socket) => {
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
			const closeMask = crypto.randomBytes(4);
			closeMask.copy(closeFrame, 2);
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
					// Text frame
					callbacks.onMessage(payload.toString("utf-8"));
				} else if (opcode === 0x08) {
					// Close frame
					conn.readyState = 3;
					clearInterval(pingInterval);
					socket.end();
					callbacks.onClose();
					return;
				} else if (opcode === 0x09) {
					// Ping — send pong (RFC 6455 §5.5.3)
					const pongMask = crypto.randomBytes(4);
					const pongLen = payload.length;
					let pongHeader: Buffer;
					if (pongLen < 126) {
						pongHeader = Buffer.alloc(6);
						pongHeader[0] = 0x8a;
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
				// opcode 0x0a (pong) — silently ignore
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

	req.on("error", (err: Error) => {
		callbacks.onError(err);
	});

	req.end();

	return conn;
}
