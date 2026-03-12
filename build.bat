@echo off
chcp 65001 >nul
title Voxtral Transcribe — Build
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     Voxtral Transcribe — Build       ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Pull latest from GitHub
echo  [~] Laatste versie ophalen van GitHub...
git pull
if %errorlevel% neq 0 (
    echo  [!] Git pull mislukt. Controleer je verbinding of los merge conflicts op.
    pause
    exit /b 1
)
echo  [OK] Repository is up-to-date.
echo.

:: Stop running instance if it exists
tasklist /FI "IMAGENAME eq VoxtralTranscribe.exe" 2>nul | find /I "VoxtralTranscribe.exe" >nul
if %errorlevel% equ 0 (
    echo  [~] VoxtralTranscribe.exe draait nog, wordt afgesloten...
    taskkill /IM VoxtralTranscribe.exe /F >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: Clean previous build artifacts
if exist "build\VoxtralTranscribe" rmdir /s /q "build\VoxtralTranscribe"
if exist "dist\VoxtralTranscribe" rmdir /s /q "dist\VoxtralTranscribe"
if exist "VoxtralTranscribe.spec" del "VoxtralTranscribe.spec"

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Python is niet gevonden.
    pause
    exit /b 1
)

:: Create/activate venv
if not exist "venv" (
    echo  [~] Virtuele omgeving aanmaken...
    python -m venv venv
)
call venv\Scripts\activate.bat

:: Install dependencies + PyInstaller
echo  [~] Dependencies installeren...
pip install -q -r requirements.txt
pip install -q pyinstaller
echo  [OK] Dependencies geinstalleerd.
echo.

:: Build
echo  [~] Applicatie bouwen met PyInstaller...
echo.

pyinstaller ^
    --name VoxtralTranscribe ^
    --onedir ^
    --windowed ^
    --noconfirm ^
    --clean ^
    --add-data "static;static" ^
    --hidden-import uvicorn.logging ^
    --hidden-import uvicorn.loops ^
    --hidden-import uvicorn.loops.auto ^
    --hidden-import uvicorn.protocols ^
    --hidden-import uvicorn.protocols.http ^
    --hidden-import uvicorn.protocols.http.auto ^
    --hidden-import uvicorn.protocols.websockets ^
    --hidden-import uvicorn.protocols.websockets.auto ^
    --hidden-import uvicorn.lifespan ^
    --hidden-import uvicorn.lifespan.on ^
    --hidden-import uvicorn.lifespan.off ^
    --collect-all mistralai ^
    --collect-all pystray ^
    --collect-all PIL ^
    server.py

if %errorlevel% neq 0 (
    echo.
    echo  [!] Build mislukt.
    pause
    exit /b 1
)

:: Copy .env.example and launcher to dist folder
copy .env.example "dist\VoxtralTranscribe\" >nul 2>&1

:: Create launcher .bat
(
echo @echo off
echo cd /d "%%~dp0"
echo set VOXTRAL_NO_BROWSER=1
echo start "" VoxtralTranscribe.exe
echo timeout /t 2 /nobreak ^>nul
echo start "" http://127.0.0.1:8000
) > "dist\VoxtralTranscribe\Start Voxtral Transcribe.bat"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║          Build geslaagd!             ║
echo  ╚══════════════════════════════════════╝
echo.
echo  De app staat in:  dist\VoxtralTranscribe\
echo  Start met:        dist\VoxtralTranscribe\VoxtralTranscribe.exe
echo.
echo  Bij eerste keer openen wordt gevraagd om een API key.
echo  De key wordt opgeslagen in config.json naast de .exe.
echo.
pause
