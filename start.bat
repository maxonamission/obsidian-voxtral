@echo off
chcp 65001 >nul
title Voxtral Transcribe
echo.
echo  ╔══════════════════════════════════════╗
echo  ║       Voxtral Transcribe App         ║
echo  ╚══════════════════════════════════════╝
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Python is niet gevonden.
    echo      Download Python via https://www.python.org/downloads/
    echo      Zorg dat "Add Python to PATH" is aangevinkt bij installatie.
    echo.
    pause
    exit /b 1
)

:: Move to script directory
cd /d "%~dp0"

:: Create venv if it doesn't exist
if not exist "venv" (
    echo  [~] Virtuele omgeving aanmaken...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo  [!] Kon geen virtuele omgeving aanmaken.
        pause
        exit /b 1
    )
    echo  [OK] Virtuele omgeving aangemaakt.
    echo.
)

:: Activate venv
call venv\Scripts\activate.bat

:: Install/update dependencies
echo  [~] Dependencies controleren...
pip install -q -r requirements.txt
if %errorlevel% neq 0 (
    echo  [!] Installatie van dependencies mislukt.
    pause
    exit /b 1
)
echo  [OK] Dependencies zijn up-to-date.
echo.

:: Check for .env file
if not exist ".env" (
    echo  [!] Geen .env bestand gevonden.
    echo.
    echo  Je hebt een Mistral API key nodig.
    echo  Maak er een aan op: https://console.mistral.ai/api-keys
    echo.
    set /p "API_KEY=  Plak je Mistral API key: "
    if defined API_KEY (
        echo MISTRAL_API_KEY=%API_KEY%> .env
        echo.
        echo  [OK] API key opgeslagen in .env
    ) else (
        echo  [!] Geen key ingevoerd. Maak handmatig een .env bestand aan.
        echo      Voorbeeld: MISTRAL_API_KEY=jouw_key_hier
        pause
        exit /b 1
    )
    echo.
)

:: Start server
echo  [~] Server starten op http://127.0.0.1:8000
echo.
echo  ────────────────────────────────────────
echo   Open je browser op: http://127.0.0.1:8000
echo   Druk op Ctrl+C om te stoppen.
echo  ────────────────────────────────────────
echo.

:: Open browser after short delay
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8000"

:: Tell server.py not to open a second browser tab
set VOXTRAL_NO_BROWSER=1

:: Run server
python server.py

:: Deactivate venv on exit
call venv\Scripts\deactivate.bat 2>nul

:: Keep window open so user can read output
echo.
echo  Server is gestopt.
echo.
pause
