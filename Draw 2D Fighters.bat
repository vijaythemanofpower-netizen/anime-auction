@echo off
rem Draws the animated fighters for the 2D Arena (tools/make-fighters.ts) on this PC.
rem Starts the drawing app if it is not running, then works through every fighter that
rem is not finished yet (it skips finished clips, so it is safe to stop and start again).
rem Leave this window open; closing it pauses the drawing. Takes many hours for everyone.
set "PATH=%SystemRoot%\System32;%SystemRoot%;%PATH%"
title Anime Auction - Drawing 2D fighters
cd /d "%~dp0"

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8188/system_stats | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Starting the drawing app...
  start "Anime Auction - Drawing AI" /min "%~dp0Start Drawing AI.bat"
  powershell -NoProfile -Command "for ($i = 0; $i -lt 120; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8188/system_stats | Out-Null; exit 0 } catch { Start-Sleep 3 } }; exit 1"
  if errorlevel 1 (
    echo The drawing app did not start. Run "Start Drawing AI.bat" to see why.
    pause
    exit /b 1
  )
)

echo Drawing base forms for every fighter...
call npx vite-node tools/make-fighters.ts --all --only=base
echo.
echo Drawing transformations (form 1, 2, 3)...
call npx vite-node tools/make-fighters.ts --all --only=1
call npx vite-node tools/make-fighters.ts --all --only=2
call npx vite-node tools/make-fighters.ts --all --only=3
echo.
echo All done. The new fighters are in public\fighters; publish them to the website to see them online.
pause
