@echo off
rem Double-click to start Anime Auction. Keep this window open while you play.
cd /d "%~dp0"
rem Make sure Windows' own tools (where, curl) and Node.js are found, even if the
rem system PATH has lost them. This only affects this window.
set "PATH=%SystemRoot%\System32;%SystemRoot%;%SystemRoot%\System32\Wbem;%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
if exist "%ProgramFiles%\nodejs\npm.cmd" goto :node_ok
where npm >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and try again. & pause & exit /b 1)
:node_ok
if not exist node_modules (
  echo First run: installing, this takes a minute...
  call npm install || (pause & exit /b 1)
)
rem The drawing app for battle comics, if installed, starts in its own minimised window.
curl -s -o nul http://127.0.0.1:8188/system_stats >nul 2>nul && goto :drawing_running
if exist "%USERPROFILE%\ComfyUI_windows_portable\python_embeded\python.exe" start "Anime Auction - Drawing AI" /min cmd /c ""%~dp0Start Drawing AI.bat""
echo Starting the drawing app (about a minute)...
:drawing_running
start "" http://localhost:5173
call npm run dev
pause
