@echo off
chcp 65001 >nul
title Voxtral Obsidian Plugin — Install
setlocal

:: ── Configuration ──────────────────────────────────────────────
:: Change this path to your Obsidian vault:
set VAULT=C:\Users\MaxKloosterman\Documents\Obisidan\Persoonlijk_EU
set PLUGIN_DIR=%VAULT%\.obsidian\plugins\voxtral-transcribe
set BRANCH=claude/obsidian-plugin-creation-e2x79

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Voxtral Obsidian Plugin — Install      ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Step 1: Fetch the latest from the branch
echo  [1/5] Branch ophalen...
git -C .. fetch origin %BRANCH%
if %errorlevel% neq 0 (
    echo  [!] Git fetch mislukt.
    goto error
)
echo  [OK] Fetch geslaagd.
echo.

:: Step 2: Checkout the branch
echo  [2/5] Branch uitchecken...
git -C .. checkout %BRANCH%
if %errorlevel% neq 0 (
    echo  [!] Git checkout mislukt.
    goto error
)
git -C .. pull origin %BRANCH%
if %errorlevel% neq 0 (
    echo  [!] Git pull mislukt.
    goto error
)
echo  [OK] Branch is up-to-date.
echo.

:: Step 3: Install dependencies
echo  [3/5] Dependencies installeren...
call npm install
if %errorlevel% neq 0 (
    echo  [!] npm install mislukt.
    goto error
)
echo  [OK] Dependencies geinstalleerd.
echo.

:: Step 4: Build
echo  [4/5] Builden...
call npm run build
if %errorlevel% neq 0 (
    echo  [!] Build mislukt.
    goto error
)
echo  [OK] Build geslaagd.
echo.

:: Step 5: Copy to vault
echo  [5/5] Plugin installeren in vault...
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"
copy /y main.js "%PLUGIN_DIR%\" >nul
copy /y manifest.json "%PLUGIN_DIR%\" >nul
copy /y styles.css "%PLUGIN_DIR%\" >nul
if %errorlevel% neq 0 (
    echo  [!] Bestanden kopieren mislukt.
    goto error
)
echo  [OK] Plugin geinstalleerd.
echo.

echo  ╔══════════════════════════════════════════╗
echo  ║          Installatie geslaagd!            ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Plugin staat in: %PLUGIN_DIR%
echo  Herstart Obsidian of schakel de plugin uit/in om te activeren.
echo.
pause
goto end

:error
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     FOUT: installatie afgebroken         ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
exit /b 1

:end
endlocal
