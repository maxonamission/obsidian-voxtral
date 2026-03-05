#!/usr/bin/env bash
set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║ Voxtral Transcribe — Build RPi/Linux ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "  [!] Python3 is niet gevonden."
    echo "      Installeer via: sudo apt install python3 python3-venv python3-pip"
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
    --name "voxtral-transcribe" \
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
cp .env.example "dist/voxtral-transcribe/" 2>/dev/null || true

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║          Build geslaagd!             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "  De app staat in:  dist/voxtral-transcribe/"
echo "  Start met:        dist/voxtral-transcribe/voxtral-transcribe"
echo ""

# Optionally install as systemd service
read -p "  Wil je een systemd service installeren voor autostart? [j/N] " INSTALL_SERVICE
if [[ "$INSTALL_SERVICE" =~ ^[jJyY]$ ]]; then
    INSTALL_DIR="$(pwd)/dist/voxtral-transcribe"
    SERVICE_FILE="/etc/systemd/system/voxtral.service"

    sudo tee "$SERVICE_FILE" > /dev/null << SERVICEEOF
[Unit]
Description=Voxtral Transcribe
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/voxtral-transcribe
Restart=on-failure
RestartSec=5
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
SERVICEEOF

    sudo systemctl daemon-reload
    sudo systemctl enable voxtral
    sudo systemctl start voxtral

    echo ""
    echo "  [OK] Service geinstalleerd en gestart!"
    echo "       Status: sudo systemctl status voxtral"
    echo "       Logs:   sudo journalctl -u voxtral -f"
    echo "       Open:   http://$(hostname -I | awk '{print $1}'):8000"
fi
echo ""
