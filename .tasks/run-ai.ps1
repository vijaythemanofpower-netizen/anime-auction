# Runs one helper AI on a task file with stdin closed, logging to .tasks/<name>.<ai>.log
# Usage: & .\.tasks\run-ai.ps1 codex roster   |   & .\.tasks\run-ai.ps1 gemini lines
param([string]$ai, [string]$name)
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$task = Join-Path $PSScriptRoot "$name.md"
$log = Join-Path $PSScriptRoot "$name.$ai.log"
$prompt = "Read the task file .tasks/$name.md in this folder and do exactly what it says."
Write-Host "== $ai on $name ($(Get-Date -Format HH:mm)) =="
if ($ai -eq 'codex') {
  cmd /c "codex exec -s workspace-write --skip-git-repo-check `"$prompt`" < NUL" 2>&1 | Tee-Object -FilePath $log
} else {
  cmd /c "gemini -m gemini-3.5-flash -p `"$prompt`" --approval-mode auto_edit --skip-trust < NUL" 2>&1 | Tee-Object -FilePath $log
}
"DONE $(Get-Date -Format o)" | Out-File -Append -Encoding utf8 $log
Write-Host "== finished $name =="
