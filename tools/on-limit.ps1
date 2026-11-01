# Runs automatically when Claude Code stops because the usage limit was reached
# (StopFailure hook with matcher "rate_limit" in %USERPROFILE%\.claude\settings.json).
# It hands the open work to the backup AIs (tools/handoff.ps1: Codex, then Gemini)
# in a new window, so the work goes on while Claude is out of quota.
#
# It only starts a hand-off when Anime Auction was being worked on:
#   - the Claude session was inside this folder, or
#   - files in this folder changed in the last 3 hours.
# At most one hand-off per hour, however many sessions hit the limit.
#
# Which tasks run:
#   - the "## Codex task" / "## Gemini task" sections of HANDOFF.md, as written;
#   - if both say "none" but there is uncommitted work, Codex gets a task to finish it
#     (built from the files changed and Claude's last message).

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'handoff-logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs 'on-limit.log'
function Log($t) { Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $t" }

$raw = [Console]::In.ReadToEnd()
$hook = $null
try { $hook = $raw | ConvertFrom-Json } catch { }
# The hook's matcher already limits this to "rate_limit"; unreadable input is treated as that.
$err = if ($hook -and $hook.error) { [string]$hook.error } else { 'rate_limit' }
$cwd = if ($hook -and $hook.cwd) { [string]$hook.cwd } else { '' }
Log "Claude stopped: error=$err cwd=$cwd"
if ($err -and $err -ne 'rate_limit') { Log 'Not a usage limit: nothing to do.'; exit 0 }

Set-Location $repo

# Was this project being worked on?
$inRepo = $cwd -and ([IO.Path]::GetFullPath($cwd).TrimEnd('\') + '\').StartsWith(($repo.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)
$changed = @(git status --porcelain 2>$null | ForEach-Object { $_.Substring(3).Trim('"') })
$cutoff = (Get-Date).AddHours(-3)
$recent = @($changed + 'HANDOFF.md' | Where-Object { $_ -and (Test-Path $_) -and (Get-Item $_).LastWriteTime -gt $cutoff })
if (-not $inRepo -and $recent.Count -eq 0) { Log 'Anime Auction was not being worked on: nothing to do.'; exit 0 }

# One hand-off per hour.
$lock = Join-Path $logs '.on-limit.lock'
if ((Test-Path $lock) -and (Get-Item $lock).LastWriteTime -gt (Get-Date).AddHours(-1)) { Log 'A hand-off already started within the last hour: skipped.'; exit 0 }
Set-Content $lock (Get-Date)

# Make sure there is something to hand over.
function Task-For($text, $name) {
  $m = [regex]::Match($text, '(?ms)^##\s+' + $name + ' task\s*$(.*?)(?=^##\s|\z)')
  if (-not $m.Success) { return '' }
  $body = $m.Groups[1].Value.Trim()
  if ($body -match '^(none|-|n/a)\b') { return '' }
  return $body
}
$handoff = if (Test-Path 'HANDOFF.md') { Get-Content 'HANDOFF.md' -Raw } else { "# Hand-off`n`n## Codex task`nnone`n`n## Gemini task`nnone`n" }
if (-not (Task-For $handoff 'Codex') -and -not (Task-For $handoff 'Gemini')) {
  if ($changed.Count -eq 0) { Log 'HANDOFF.md has no tasks and nothing is uncommitted: nothing to hand over.'; exit 0 }
  $last = if ($hook -and $hook.last_assistant_message) { ([string]$hook.last_assistant_message).Trim() } else { '' }
  if ($last.Length -gt 1500) { $last = $last.Substring(0, 1500) + '...' }
  $files = ($changed | Select-Object -First 30 | ForEach-Object { "- $_" }) -join "`n"
  $task = @"
Finish the work Claude was doing when its usage limit ran out ($(Get-Date -Format 'MMM d yyyy HH:mm')).
Files changed but not committed:
$files
Claude's last message before it stopped:
> $($last -replace "`n", "`n> ")
Read the changed files (``git diff``) to see what was being built, complete it in the same style, and make the type-check and tests pass.
"@
  $handoff = [regex]::Replace($handoff, '(?ms)^##\s+Codex task\s*$.*?(?=^##\s|\z)', "## Codex task`n$task`n`n")
  if ($handoff -notmatch '(?m)^##\s+Codex task') { $handoff += "`n## Codex task`n$task`n" }
  Set-Content -Path 'HANDOFF.md' -Value $handoff -Encoding utf8
  Log 'HANDOFF.md had no tasks: wrote a Codex task to finish the uncommitted work.'
}

# Run the hand-off in its own window so it keeps going after this hook returns.
if ($env:ON_LIMIT_DRYRUN) { Log 'Dry run: would start tools/handoff.ps1 now.'; Remove-Item $lock -ErrorAction SilentlyContinue; exit 0 }
Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'handoff.ps1')) -WorkingDirectory $repo -WindowStyle Normal
Log 'Started tools/handoff.ps1 (Codex, then Gemini) in a new window.'
exit 0
