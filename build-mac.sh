#!/usr/bin/env bash
set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Voxtral Transcribe — Build macOS   ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "  [!] Python3 is niet gevonden."
    echo "      Installeer via: brew install python3"
    exit 1
fi

# Create/activate venv
if [ ! -d "venv" ]; then
    echo "  [~] Virtuele omgeving aanmaken..."
    python3 -m venv venv
fi
source venv/bin/activate

# Install dependencies + PyInstaller
echo "  [~] Dependencies installeren..."
pip install -q -r requirements.txt
pip install -q pyinstaller
echo "  [OK] Dependencies geinstalleerd."
echo ""

# Build
echo "  [~] Applicatie bouwen..."
echo ""

pyinstaller \
    --name "Voxtral Transcribe" \
    --onedir \
    --noconfirm \
    --clean \
    --add-data "static:static" \
    --hidden-import uvicorn.logging \
    --hidden-import uvicorn.loops \
    --hidden-import uvicorn.loops.auto \
    --hidden-import uvicorn.protocols \
    --hidden-import uvicorn.protocols.http \
    --hidden-import uvicorn.protocols.http.auto \
    --hidden-import uvicorn.protocols.websockets \
    --hidden-import uvicorn.protocols.websockets.auto \
    --hidden-import uvicorn.lifespan \
    --hidden-import uvicorn.lifespan.on \
    --hidden-import uvicorn.lifespan.off \
    --collect-all mistralai \
    server.py

# Copy .env.example
cp .env.example "dist/Voxtral Transcribe/" 2>/dev/null || true

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║          Build geslaagd!             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "  De app staat in:  dist/Voxtral Transcribe/"
echo "  Start met:        dist/Voxtral Transcribe/Voxtral Transcribe"
echo ""
echo "  Bij eerste keer openen wordt gevraagd om een API key."
echo ""
