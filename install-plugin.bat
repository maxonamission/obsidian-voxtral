@echo off
setlocal

set VAULT=C:\Users\MaxKloosterman\Documents\Obisidan\Persoonlijk_EU
set PLUGIN_DIR=%VAULT%\.obsidian\plugins\voxtral-transcribe

echo [1/5] Branch ophalen...
git fetch origin claude/obsidian-plugin-creation-e2x79
if errorlevel 1 goto error

echo [2/5] Laatste wijzigingen uitchecken...
git checkout origin/claude/obsidian-plugin-creation-e2x79 -- .
if errorlevel 1 goto error

echo [3/5] Dependencies installeren...
npm install
if errorlevel 1 goto error

echo [4/5] Builden...
npm run build
if errorlevel 1 goto error

echo [5/5] Plugin installeren in vault...
mkdir "%PLUGIN_DIR%" 2>nul
copy main.js "%PLUGIN_DIR%\"
copy manifest.json "%PLUGIN_DIR%\"
copy styles.css "%PLUGIN_DIR%\"
if errorlevel 1 goto error

echo.
echo Klaar! Plugin geinstalleerd in %PLUGIN_DIR%
goto end

:error
echo.
echo FOUT: stap mislukt. Installatie afgebroken.
exit /b 1

:end
endlocal
