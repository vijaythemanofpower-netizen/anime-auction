# Runs when Claude Code ends a turn because of an API error (StopFailure hook, matcher
# "rate_limit", registered in %USERPROFILE%\.claude\settings.json).
#
# It decides whether this is a genuine subscription usage limit (apiError
# "usage_limit_reached" in the session transcript, or the "You've hit your ... limit"
# message) or just ordinary rate limiting, and then:
#   - if the failover supervisor is running (tools/failover/supervisor.ps1), it writes
#     handoff-logs/failover/signal.json and the supervisor takes over;
#   - otherwise it opens a window that hands the work to Codex right away.
# Nothing here commits, pushes or deploys. Every decision is logged in
# handoff-logs/failover/failover.log.

$ErrorActionPreference = 'Continue'
$lib = Join-Path $PSScriptRoot 'failover\failover-lib.ps1'
. $lib

$raw = [Console]::In.ReadToEnd()
$hook = $null
try { $hook = $raw | ConvertFrom-Json } catch { }
$cwd = if ($hook -and $hook.cwd) { [string]$hook.cwd } else { (Get-Location).Path }
$repo = (& git -C $cwd rev-parse --show-toplevel 2>$null)
if (-not $repo) { $repo = Split-Path -Parent $PSScriptRoot }
$repo = $repo -replace '/', '\'
$State = Initialize-Failover -Repo $repo -TranscriptDir ''
$err = if ($hook -and $hook.error) { [string]$hook.error } else { 'unknown' }
$details = if ($hook -and $hook.error_details) { [string]$hook.error_details } else { '' }
$msg = if ($hook -and $hook.last_assistant_message) { [string]$hook.last_assistant_message } else { '' }
$transcript = if ($hook -and $hook.transcript_path) { [string]$hook.transcript_path } else { '' }

# Is it the subscription limit? The transcript says so exactly; the message text is the fallback.
$kind = 'other'; $resetsAt = $null; $detail = "$err $details $msg".Trim()
if ($transcript -and (Test-Path $transcript)) {
  foreach ($line in (Get-Content $transcript -Tail 40 -Encoding UTF8)) {
    if ($line -notmatch '"usage_limit_reached"') { continue }
    try {
      $j = $line | ConvertFrom-Json
      $kind = 'usage_limit'
      $detail = (@($j.message.content) | ForEach-Object { $_.text }) -join ' '
      $r = $j.apiErrorParams.rate_limit_info.resetsAt; if (-not $r) { $r = $j.quotaLimits.resetsAt }
      if ($r) { $resetsAt = (ConvertFrom-Epoch $r).ToString('o') }
    } catch { }
  }
}
if ($kind -ne 'usage_limit' -and $err -eq 'rate_limit' -and "$details $msg" -match "(?i)hit your (session |weekly |usage )?limit|usage limit|usage_limit_reached") { $kind = 'usage_limit' }

if ($kind -ne 'usage_limit') {
  Write-FailoverLog $State 'stop-failure' "${err}: $detail" 'ignored (not a usage limit)'
  exit 0
}

[pscustomobject]@{ at = (Get-Date).ToString('o'); kind = 'usage_limit'; detail = $detail; transcript = $transcript; resetsAt = $resetsAt } |
  ConvertTo-Json | Set-Content -Path $State.Signal -Encoding utf8
Write-FailoverLog $State 'stop-failure' $detail 'usage limit: signal written'

# The supervisor picks the signal up itself. Without one, start the hand-over now in its own window.
$sup = $null
if (Test-Path $State.Lock) { $sup = Get-Process -Id ([int](Get-Content $State.Lock -Raw).Trim()) -ErrorAction SilentlyContinue }
if ($sup) { exit 0 }
if ($env:ON_LIMIT_DRYRUN) { Write-FailoverLog $State 'stop-failure' 'dry run' 'would start Codex hand-over'; exit 0 }
$args2 = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $PSScriptRoot 'failover\supervisor.ps1')`"", '-Repo', "`"$repo`"", '-FailoverOnly', '-Reason', "`"usage limit`"")
if ($transcript) { $args2 += @('-Transcript', "`"$transcript`"") }
Start-Process powershell.exe -ArgumentList $args2 -WorkingDirectory $repo -WindowStyle Normal
Write-FailoverLog $State 'stop-failure' 'no supervisor running' 'started Codex hand-over window'
exit 0
