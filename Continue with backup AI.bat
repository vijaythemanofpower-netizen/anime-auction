@echo off
rem Hands the open work in HANDOFF.md to Codex and Gemini (one task each),
rem then publishes the result only if the type-check, tests and build pass.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\handoff.ps1"
pause
