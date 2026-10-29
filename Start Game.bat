@echo off
rem Double-click to start Anime Auction. Keep this window open while you play.
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and try again. & pause & exit /b 1)
if not exist node_modules (
  echo First run: installing, this takes a minute...
  call npm install || (pause & exit /b 1)
)
rem The drawing app for battle comics, if installed, starts in its own minimised window.
if exist "%USERPROFILE%\ComfyUI_windows_portable\python_embeded\python.exe" start "Anime Auction - Drawing AI" /min cmd /c ""%~dp0Start Drawing AI.bat""
start "" http://localhost:5173
call npm run dev
pause
