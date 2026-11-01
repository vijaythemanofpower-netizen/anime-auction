@echo off
rem Starts Claude Code with automatic Codex failover for this project (see tools\failover\supervisor.ps1).
rem Extra arguments go to Claude, e.g.  "Claude with Codex backup.bat" --continue
set "CLAUDE_FAILOVER_ARGS=%*"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\failover\supervisor.ps1" -Repo "%~dp0."
