<#
  Claude Code -> OpenAI Codex failover supervisor.

  Starts Claude Code in this terminal and watches it. When Claude stops because the
  subscription usage limit is reached (and only then), it hands the unfinished work
  to Codex automatically, keeps your working tree as it is, logs everything, and
  afterwards lets you (or a timer) bring Claude back with Codex's work in context.

  Detection (either is enough):
    1. The StopFailure hook (tools/on-limit.ps1) writes handoff-logs/failover/signal.json
       when an API error with apiError "usage_limit_reached" ends a turn.
    2. This supervisor reads the live session transcript (~/.claude/projects/<project>/*.jsonl)
       for a message with "apiError":"usage_limit_reached" written after launch.
  Plain rate limiting, network errors, overloaded servers and permission prompts carry
  other codes; they are logged as "ignored" and never trigger failover.

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\failover\supervisor.ps1 [-- claude args]
    -FailoverOnly  : skip launching Claude; hand over now (used by the hook when the
                     supervisor is not running, and for tests).
#>
param(
  [string]$Repo = '',
  [switch]$FailoverOnly,
  [string]$Transcript = '',
  [string]$Reason = '',
  [string]$ClaudeCommand = 'claude',
  [string]$CodexCommand = 'codex',
  [string]$TranscriptDir = '',
  [int]$ResumeChoiceSeconds = 60,
  [switch]$NoResume,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$ClaudeArgs
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'failover-lib.ps1')

# Claude's own flags (--continue, -p ...) come through CLAUDE_FAILOVER_ARGS (set by the launchers),
# because PowerShell would try to read them as this script's parameters.
if ($env:CLAUDE_FAILOVER_ARGS) {
  $ClaudeArgs = @([regex]::Matches($env:CLAUDE_FAILOVER_ARGS, '"([^"]*)"|(\S+)') | ForEach-Object { if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value } })
  Remove-Item Env:CLAUDE_FAILOVER_ARGS
}
# Default: the repository this script lives in ($PSScriptRoot is empty inside param() on Windows PowerShell).
if (-not $Repo) { $Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$State = Initialize-Failover -Repo $Repo -TranscriptDir $TranscriptDir

if ($FailoverOnly) {
  $result = Invoke-Failover -State $State -Transcript $Transcript -Reason ($(if ($Reason) { $Reason } else { 'requested' })) -CodexCommand $CodexCommand
  if (-not $NoResume) { Invoke-ResumeChoice -State $State -Result $result -ClaudeCommand $ClaudeCommand -Seconds $ResumeChoiceSeconds }
  exit 0
}

# ------------------------------------------------------------ supervise Claude
Set-Content -Path $State.Lock -Value $PID -Encoding ascii
try {
  while ($true) {
    $launch = Get-Date
    Remove-Item $State.Signal -ErrorAction SilentlyContinue
    Write-FailoverLog $State 'claude-start' "args: $($ClaudeArgs -join ' ')" 'running'
    $proc = Start-Claude -Command $ClaudeCommand -Arguments $ClaudeArgs -WorkingDirectory $State.Repo
    $null = $proc.Handle  # keeps the handle so the exit code can be read later
    $hit = $null
    while (-not $proc.HasExited) {
      Start-Sleep -Milliseconds 1500
      $hit = Find-UsageLimit -State $State -Since $launch
      if ($hit) { break }
    }
    if (-not $hit) {
      # Claude exited on its own: one last look (the limit can be written as it quits).
      $hit = Find-UsageLimit -State $State -Since $launch
      if (-not $hit) { Write-FailoverLog $State 'claude-exit' "exit code $($proc.ExitCode)" 'no failover'; break }
    }
    Write-FailoverLog $State 'usage-limit' $hit.Detail "detected by $($hit.Source)"
    Write-Host ''
    Write-Host "[failover] Claude reached its usage limit ($($hit.Detail)). Handing the work to Codex..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Stop-ProcessTree $proc.Id
    $result = Invoke-Failover -State $State -Transcript $hit.Transcript -Reason $hit.Detail -ResetsAt $hit.ResetsAt -CodexCommand $CodexCommand
    if ($NoResume) { break }
    $again = Invoke-ResumeChoice -State $State -Result $result -ClaudeCommand $ClaudeCommand -Seconds $ResumeChoiceSeconds -ResetsAt $hit.ResetsAt -Supervised
    if (-not $again) { break }
    $ClaudeArgs = $again
  }
} finally {
  Remove-Item $State.Lock -ErrorAction SilentlyContinue
}
