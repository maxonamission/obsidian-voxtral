import asyncio
import json
import logging
import os
import sys
import time
import traceback
from collections import defaultdict
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
from fastapi import FastAPI, Form, UploadFile, WebSocket, WebSocketDisconnect
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


# ── Rate limiting ──
class RateLimiter:
    """Simple in-memory sliding window rate limiter."""

    def __init__(self):
        self._timestamps: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """Check if a request is allowed. Returns False if rate limit exceeded."""
        now = time.monotonic()
        cutoff = now - window_seconds
        # Remove expired timestamps
        self._timestamps[key] = [t for t in self._timestamps[key] if t > cutoff]
        if len(self._timestamps[key]) >= max_requests:
            return False
        self._timestamps[key].append(now)
        return True


rate_limiter = RateLimiter()
active_ws_count = 0  # Track concurrent WebSocket connections
MAX_WS_CONNECTIONS = 2  # Allow 1 active + 1 reconnect overlap

REALTIME_MODEL_DEFAULT = "voxtral-mini-transcribe-realtime-2602"
BATCH_MODEL_DEFAULT = "voxtral-mini-latest"
CORRECT_MODEL_DEFAULT = "mistral-small-latest"
BATCH_LANGUAGE_DEFAULT = "nl"
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


def _cfg_or_env(cfg_key: str, env_key: str, default: str) -> str:
    """Read a setting: config.json → env var → default."""
    cfg = load_config()
    val = cfg.get(cfg_key, "")
    if val:
        return val
    return os.environ.get(env_key, default)


def get_language() -> str:
    return _cfg_or_env("language", "VOXTRAL_LANGUAGE", BATCH_LANGUAGE_DEFAULT)


def get_realtime_model() -> str:
    return _cfg_or_env("realtime_model", "VOXTRAL_REALTIME_MODEL", REALTIME_MODEL_DEFAULT)


def get_batch_model() -> str:
    return _cfg_or_env("batch_model", "VOXTRAL_BATCH_MODEL", BATCH_MODEL_DEFAULT)


def get_correct_model() -> str:
    return _cfg_or_env("correct_model", "VOXTRAL_CORRECT_MODEL", CORRECT_MODEL_DEFAULT)


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
    if not rate_limiter.is_allowed("settings", max_requests=5, window_seconds=60):
        return JSONResponse({"error": "Te veel verzoeken, probeer later opnieuw"}, status_code=429)
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



DEFAULT_CORRECT_PROMPT = (
    "Je bent een nauwkeurige tekstcorrector voor Nederlands. "
    "Corrigeer ALLEEN:\n"
    "- Capitalisatie (hoofdletters aan het begin van zinnen, eigennamen)\n"
    "- Duidelijk verkeerd geschreven of verminkte woorden (door spraakherkenning)\n"
    "- Ontbrekende of verkeerde leestekens\n\n"
    "NIET veranderen:\n"
    "- Zinsstructuur of woordvolgorde\n"
    "- Stijl of toon\n"
    "- Markdown opmaak (# koppen, - lijstjes, - [ ] to-do items)\n\n"
    "INLINE CORRECTIE-INSTRUCTIES:\n"
    "De tekst is gedicteerd via spraakherkenning. De spreker geeft soms inline instructies "
    "of correcties die voor jou bedoeld zijn. Herken deze patronen:\n"
    "- Expliciete markers: 'voor de correctie', 'voor de controle achteraf', "
    "'voor de correctie achteraf', 'correctie-instructie', 'noot voor de corrector', "
    "'voor de automatische correctie'\n"
    "- Gespelde woorden: 'V-O-X-T-R-A-L' of 'met een x' → voeg samen tot het bedoelde woord\n"
    "- Zelfcorrecties: 'nee niet X maar Y', 'ik bedoel Y', 'dat moet Z zijn'\n"
    "- Meta-commentaar over het dicteren: 'dat is een Nederlands woord', 'met een hoofdletter'\n\n"
    "Als je zulke instructies of meta-commentaar tegenkomt:\n"
    "1. Volg de instructie op bij het corrigeren van de REST van de tekst\n"
    "2. Verwijder de instructie/het meta-commentaar zelf volledig uit de output\n"
    "3. Behoud alle inhoudelijke tekst — verwijder NOOIT gewone zinnen\n\n"
    "Geef ALLEEN de gecorrigeerde tekst terug, zonder uitleg."
)


@app.post("/api/correct")
async def correct_text(body: dict):
    """Correct text using Mistral chat model."""
    if not rate_limiter.is_allowed("correct", max_requests=10, window_seconds=60):
        return JSONResponse({"error": "Te veel verzoeken, probeer later opnieuw"}, status_code=429)
    text = body.get("text", "").strip()
    if not text:
        return JSONResponse({"error": "Geen tekst opgegeven"}, status_code=400)

    system_prompt = body.get("system_prompt", "").strip()
    full_prompt = DEFAULT_CORRECT_PROMPT
    if system_prompt:
        full_prompt += f"\n\nExtra context/jargon van de gebruiker:\n{system_prompt}"

    try:
        client = get_client()
        response = client.chat.complete(
            model=get_correct_model(),
            messages=[
                {"role": "system", "content": full_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
        )
        corrected = response.choices[0].message.content.strip()
        return {"corrected": corrected}
    except Exception as e:
        logger.error(f"Correction failed:\n{traceback.format_exc()}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/transcribe")
async def transcribe_batch(file: UploadFile, diarize: bool = Form(False)):
    """Batch transcription for offline-queued recordings."""
    if not rate_limiter.is_allowed("transcribe", max_requests=10, window_seconds=60):
        return JSONResponse({"error": "Te veel verzoeken, probeer later opnieuw"}, status_code=429)
    try:
        client = get_client()
        content = await file.read()
        kwargs = dict(
            model=get_batch_model(),
            file={"content": content, "file_name": file.filename or "audio.webm"},
            language=get_language(),
        )
        if diarize:
            kwargs["diarize"] = True

        result = client.audio.transcriptions.complete(**kwargs)

        if diarize and hasattr(result, "segments") and result.segments:
            # Build text with speaker labels
            segments = []
            current_speaker = None
            for seg in result.segments:
                speaker = getattr(seg, "speaker", None)
                text = seg.text.strip() if hasattr(seg, "text") else ""
                if not text:
                    continue
                if speaker != current_speaker:
                    current_speaker = speaker
                    label = f"Spreker {speaker}" if speaker is not None else "Spreker"
                    segments.append({"speaker": label, "text": text})
                else:
                    segments[-1]["text"] += " " + text
            return {"text": result.text, "segments": segments}

        return {"text": result.text}
    except Exception as e:
        logger.error(f"Batch transcription failed:\n{traceback.format_exc()}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.websocket("/ws/transcribe")
async def ws_transcribe(websocket: WebSocket):
    """Realtime transcription via WebSocket. Browser sends PCM s16le 16kHz mono chunks."""
    global active_ws_count

    # Reject if too many concurrent connections
    if active_ws_count >= MAX_WS_CONNECTIONS:
        await websocket.close(code=1013, reason="Te veel gelijktijdige verbindingen")
        logger.warning(f"WebSocket rejected: {active_ws_count} active connections (max {MAX_WS_CONNECTIONS})")
        return

    await websocket.accept()
    active_ws_count += 1
    logger.info(f"WebSocket connected ({active_ws_count}/{MAX_WS_CONNECTIONS} active)")

    # Read delay from query parameter (default 1000ms)
    delay_ms = int(websocket.query_params.get("delay", "1000"))

    audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    ws_closed = False  # Guard: prevent sending after client disconnects

    async def audio_stream() -> AsyncIterator[bytes]:
        while True:
            chunk = await audio_queue.get()
            if chunk is None:
                return
            yield chunk

    async def receive_audio():
        nonlocal ws_closed
        try:
            while True:
                data = await websocket.receive_bytes()
                await audio_queue.put(data)
        except WebSocketDisconnect:
            ws_closed = True
            await audio_queue.put(None)
        except Exception:
            ws_closed = True
            await audio_queue.put(None)

    receiver = asyncio.create_task(receive_audio())

    try:
        client = get_client()
        logger.info("Starting Mistral realtime transcription stream...")
        async for event in client.audio.realtime.transcribe_stream(
            audio_stream=audio_stream(),
            model=get_realtime_model(),
            audio_format=AUDIO_FORMAT,
            target_streaming_delay_ms=delay_ms,
        ):
            if ws_closed:
                logger.info("Client disconnected, stopping event processing")
                break
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
        if not ws_closed:
            try:
                await websocket.send_json({"type": "error", "message": str(e)})
            except Exception:
                pass
    finally:
        active_ws_count -= 1
        logger.info(f"WebSocket closed ({active_ws_count}/{MAX_WS_CONNECTIONS} active)")
        receiver.cancel()


# Serve static files (must be last to not override API routes)
app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import threading
    import webbrowser

    import uvicorn

    # In windowed mode (PyInstaller --windowed), sys.stdout/stderr are None.
    # Uvicorn's logger calls sys.stderr.isatty() which crashes on None.
    # Redirect to devnull so logging works silently.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")

    # In windowed mode (no console), redirect crash logs to a file
    _LOG_FILE = os.path.join(_SCRIPT_DIR, "error.log")

    try:
        port = int(os.environ.get("PORT", 8000))
        url = f"http://127.0.0.1:{port}"

        # Open browser after a short delay (gives uvicorn time to start)
        # Skip if VOXTRAL_NO_BROWSER is set (e.g. launcher .bat handles it)
        if os.environ.get("VOXTRAL_NO_BROWSER") != "1":
            threading.Timer(1.5, webbrowser.open, args=[url]).start()
            logger.info(f"Opening browser at {url}")

        uvicorn.run(app, host="127.0.0.1", port=port)
    except Exception:
        traceback.print_exc()
        # Also write to error.log for windowed mode (no console visible)
        try:
            with open(_LOG_FILE, "a", encoding="utf-8") as f:
                f.write(f"\n{'='*60}\n")
                f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
                traceback.print_exc(file=f)
        except Exception:
            pass
        # If console is available, pause so user can read the error
        try:
            input("\nDruk op Enter om te sluiten...")
        except (EOFError, RuntimeError):
            pass  # no console (windowed mode)
