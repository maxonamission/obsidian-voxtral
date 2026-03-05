import asyncio
import json
import logging
import os
import sys
import traceback
from typing import AsyncIterator

from dotenv import load_dotenv

# ── Paths: support both normal and PyInstaller bundled mode ──
if getattr(sys, "frozen", False):
    # Running as PyInstaller bundle
    _SCRIPT_DIR = os.path.dirname(sys.executable)
    _STATIC_DIR = os.path.join(sys._MEIPASS, "static")
else:
    _SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    _STATIC_DIR = os.path.join(_SCRIPT_DIR, "static")

CONFIG_FILE = os.path.join(_SCRIPT_DIR, "config.json")

# Load .env (fallback for dev mode)
load_dotenv(os.path.join(_SCRIPT_DIR, ".env"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voxtral")
from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from mistralai import Mistral
from mistralai.models import (
    AudioFormat,
    RealtimeTranscriptionError,
    RealtimeTranscriptionSessionCreated,
    TranscriptionStreamDone,
    TranscriptionStreamTextDelta,
)

app = FastAPI()

REALTIME_MODEL = "voxtral-mini-transcribe-realtime-2602"
BATCH_MODEL = "voxtral-mini-latest"
BATCH_LANGUAGE = "nl"  # Default taal voor batch transcriptie (realtime detecteert automatisch)
AUDIO_FORMAT = AudioFormat(encoding="pcm_s16le", sample_rate=16000)


# ── API key management ──
def load_config() -> dict:
    """Load config from config.json, fall back to .env."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_config(cfg: dict):
    """Save config to config.json."""
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def get_api_key() -> str:
    """Get API key: config.json takes priority, then .env / env var."""
    cfg = load_config()
    key = cfg.get("api_key", "")
    if key:
        return key
    return os.environ.get("MISTRAL_API_KEY", "")


def get_client() -> Mistral:
    """Create a fresh Mistral client with the current API key."""
    return Mistral(api_key=get_api_key())


# ── API routes ──
@app.get("/api/health")
async def health():
    key = get_api_key()
    if not key:
        return JSONResponse({"status": "no_key", "message": "API key niet ingesteld"}, status_code=200)
    return {"status": "ok"}


@app.get("/api/settings")
async def get_settings():
    """Return current settings (API key masked)."""
    key = get_api_key()
    if key:
        masked = key[:4] + "•" * (len(key) - 8) + key[-4:] if len(key) > 8 else "••••"
    else:
        masked = ""
    return {"has_key": bool(key), "masked_key": masked}


@app.post("/api/settings")
async def save_settings(body: dict):
    """Save API key to config.json."""
    api_key = body.get("api_key", "").strip()
    if not api_key:
        return JSONResponse({"error": "Geen API key opgegeven"}, status_code=400)
    # Quick validation: try listing models
    try:
        test_client = Mistral(api_key=api_key)
        test_client.models.list()
    except Exception as e:
        return JSONResponse({"error": f"Ongeldige API key: {e}"}, status_code=400)
    cfg = load_config()
    cfg["api_key"] = api_key
    save_config(cfg)
    return {"status": "ok", "message": "API key opgeslagen"}


@app.post("/api/transcribe")
async def transcribe_batch(file: UploadFile):
    """Batch transcription for offline-queued recordings."""
    try:
        client = get_client()
        content = await file.read()
        result = client.audio.transcriptions.complete(
            model=BATCH_MODEL,
            file={"content": content, "file_name": file.filename or "audio.webm"},
            language=BATCH_LANGUAGE,
        )
        return {"text": result.text}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.websocket("/ws/transcribe")
async def ws_transcribe(websocket: WebSocket):
    """Realtime transcription via WebSocket. Browser sends PCM s16le 16kHz mono chunks."""
    await websocket.accept()

    # Read delay from query parameter (default 1000ms)
    delay_ms = int(websocket.query_params.get("delay", "1000"))

    audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    async def audio_stream() -> AsyncIterator[bytes]:
        while True:
            chunk = await audio_queue.get()
            if chunk is None:
                return
            yield chunk

    async def receive_audio():
        try:
            while True:
                data = await websocket.receive_bytes()
                await audio_queue.put(data)
        except WebSocketDisconnect:
            await audio_queue.put(None)
        except Exception:
            await audio_queue.put(None)

    receiver = asyncio.create_task(receive_audio())

    try:
        client = get_client()
        logger.info("Starting Mistral realtime transcription stream...")
        async for event in client.audio.realtime.transcribe_stream(
            audio_stream=audio_stream(),
            model=REALTIME_MODEL,
            audio_format=AUDIO_FORMAT,
            target_streaming_delay_ms=delay_ms,
        ):
            logger.info(f"Event received: {type(event).__name__}")
            if isinstance(event, TranscriptionStreamTextDelta):
                await websocket.send_json({"type": "delta", "text": event.text})
            elif isinstance(event, TranscriptionStreamDone):
                await websocket.send_json({"type": "done", "text": event.text})
            elif isinstance(event, RealtimeTranscriptionSessionCreated):
                await websocket.send_json({"type": "session_created"})
            elif isinstance(event, RealtimeTranscriptionError):
                logger.error(f"Transcription error event: {event}")
                await websocket.send_json({"type": "error", "message": str(event)})
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client")
    except Exception as e:
        logger.error(f"Realtime transcription failed:\n{traceback.format_exc()}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        receiver.cancel()


# Serve static files (must be last to not override API routes)
app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
