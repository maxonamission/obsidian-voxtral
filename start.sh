#!/usr/bin/env bash
set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       Voxtral Transcribe App         ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "  [!] Python3 is niet gevonden."
    echo "      Installeer Python via https://www.python.org/downloads/"
    exit 1
fi

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "  [~] Virtuele omgeving aanmaken..."
    python3 -m venv venv
    echo "  [OK] Virtuele omgeving aangemaakt."
    echo ""
fi

# Activate venv
source venv/bin/activate

# Install/update dependencies
echo "  [~] Dependencies controleren..."
pip install -q -r requirements.txt
echo "  [OK] Dependencies zijn up-to-date."
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    echo "  [!] Geen .env bestand gevonden."
    echo ""
    echo "  Je hebt een Mistral API key nodig."
    echo "  Maak er een aan op: https://console.mistral.ai/api-keys"
    echo ""
    read -p "  Plak je Mistral API key: " API_KEY
    if [ -n "$API_KEY" ]; then
        echo "MISTRAL_API_KEY=$API_KEY" > .env
        echo ""
        echo "  [OK] API key opgeslagen in .env"
    else
        echo "  [!] Geen key ingevoerd. Maak handmatig een .env bestand aan."
        exit 1
    fi
    echo ""
fi

echo "  [~] Server starten op http://127.0.0.1:8000"
echo ""
echo "  ────────────────────────────────────────"
echo "   Open je browser op: http://127.0.0.1:8000"
echo "   Druk op Ctrl+C om te stoppen."
echo "  ────────────────────────────────────────"
echo ""

# Open browser (works on macOS and Linux)
if command -v open &> /dev/null; then
    (sleep 2 && open "http://127.0.0.1:8000") &
elif command -v xdg-open &> /dev/null; then
    (sleep 2 && xdg-open "http://127.0.0.1:8000") &
fi

# Run server
python3 server.py
