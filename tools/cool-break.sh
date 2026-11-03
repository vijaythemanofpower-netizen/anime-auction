#!/usr/bin/env bash
# Cooling break: let the drawing in progress finish, stop the drawing run, rest N minutes
# (default 5), then resume it (tools/resume-2d.sh skips finished drawings).
cd "$(dirname "$0")/.."
mins=${1:-5}
n=$(wc -l < handoff-logs/rigs-draw.log)
echo "waiting for the current drawing to finish..."
while [ "$(wc -l < handoff-logs/rigs-draw.log)" -le "$n" ]; do sleep 2; done
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -match 'resume-2d|make-rigs' -and \$_.CommandLine -notmatch 'Get-CimInstance|cool-break' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo "[$(date +%H:%M:%S)] drawing paused for $mins minutes to cool down"
sleep $((mins * 60))
echo "[$(date +%H:%M:%S)] resuming"
exec bash tools/resume-2d.sh
