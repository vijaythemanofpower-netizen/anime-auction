@echo off
rem Finishes the rigged 2D fighters without Claude (tools/rig-pipeline.sh): checks and fixes the
rem helpers' code with Codex, wires in the attack table, draws every fighter, updates the notes
rem and publishes if every check passes. Leave this window open; safe to run again.
title Anime Auction - Finishing 2D fighters
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8188/system_stats | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 start "Anime Auction - Drawing AI" /min "%~dp0Start Drawing AI.bat"
"%ProgramFiles%\Git\bin\bash.exe" tools/rig-pipeline.sh
