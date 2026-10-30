@echo off
rem Starts the free local drawing app (ComfyUI) that draws the battle comics.
rem Keep this window open while you play. Start Game.bat starts it for you too.
set "PATH=%SystemRoot%\System32;%SystemRoot%;%PATH%"
set "COMFY=%USERPROFILE%\ComfyUI_windows_portable"
if not exist "%COMFY%\python_embeded\python.exe" (
  echo The drawing app is not installed at %COMFY%.
  echo Battles still work, with comic-style portraits instead of drawings.
  pause
  exit /b 1
)
title Anime Auction - Drawing AI
cd /d "%COMFY%"
"%COMFY%\python_embeded\python.exe" -s ComfyUI\main.py --windows-standalone-build --disable-auto-launch --listen 127.0.0.1 --port 8188 --enable-cors-header https://vijaythemanofpower-netizen.github.io --fp8_e4m3fn-unet --fp8_e4m3fn-text-enc
pause
