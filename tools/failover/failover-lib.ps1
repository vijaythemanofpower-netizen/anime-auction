# Shared pieces of the Claude -> Codex failover (dot-sourced by supervisor.ps1 and tests).

function Initialize-Failover([string]$Repo, [string]$TranscriptDir) {
  $Repo = (Resolve-Path $Repo).Path
  $dir = Join-Path $Repo 'handoff-logs\failover'
  New-Item -ItemType Directory -Force $dir | Out-Null
  if (-not $TranscriptDir) {
    # Claude Code keeps each project's sessions under ~/.claude/projects/<path with every non-alphanumeric as '-'>.
    $enc = ($Repo -replace '[^A-Za-z0-9]', '-')
    $TranscriptDir = Join-Path $env:USERPROFILE ".claude\projects\$enc"
  }
  return [pscustomobject]@{
    Repo = $Repo; Dir = $dir; Log = (Join-Path $dir 'failover.log'); Signal = (Join-Path $dir 'signal.json')
    Lock = (Join-Path $dir 'supervisor.lock'); TranscriptDir = $TranscriptDir; Ignored = @{}
  }
}

function Write-FailoverLog($State, [string]$Event, [string]$Detail, [string]$Result) {
  $line = '{0} | {1} | {2} | {3}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Event, ($Detail -replace '\r?\n', ' '), $Result
  Add-Content -Path $State.Log -Value $line -Encoding utf8
}

function Start-Claude([string]$Command, [string[]]$Arguments, [string]$WorkingDirectory) {
  $args2 = @($Arguments | Where-Object { $_ -ne $null -and $_ -ne '' })
  if ($Command -like '*.ps1') {
    return Start-Process -FilePath 'powershell.exe' -ArgumentList (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$Command`"") + ($args2 | ForEach-Object { "`"$_`"" })) -NoNewWindow -PassThru -WorkingDirectory $WorkingDirectory
  }
  # npm installs claude.ps1 and claude.cmd; Start-Process needs a real executable or .cmd.
  $exe = (Get-Command $Command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if (-not $exe) { $exe = (Get-Command $Command -ErrorAction Stop).Source }
  if ($args2.Count) { return Start-Process -FilePath $exe -ArgumentList ($args2 | ForEach-Object { if ($_ -match '\s') { "`"$($_ -replace '"', '\"')`"" } else { $_ } }) -NoNewWindow -PassThru -WorkingDirectory $WorkingDirectory }
  return Start-Process -FilePath $exe -NoNewWindow -PassThru -WorkingDirectory $WorkingDirectory
}

function Stop-ProcessTree([int]$ProcessId) {
  & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function ConvertFrom-Epoch($s) { if ($s) { return ([DateTimeOffset]::FromUnixTimeSeconds([long]$s)).LocalDateTime } return $null }

<#
  Looks for a genuine subscription usage limit written after $Since.
  Returns @{ Source; Detail; Transcript; ResetsAt } or $null. Other API errors are logged once as ignored.
#>
function Find-UsageLimit($State, [datetime]$Since) {
  if (Test-Path $State.Signal) {
    $sig = $null
    try { $sig = Get-Content $State.Signal -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
    if ($sig -and [datetime]$sig.at -ge $Since.AddSeconds(-2) -and $sig.kind -eq 'usage_limit') {
      return [pscustomobject]@{ Source = 'StopFailure hook'; Detail = [string]$sig.detail; Transcript = [string]$sig.transcript; ResetsAt = $(if ($sig.resetsAt) { [datetime]$sig.resetsAt } else { $null }) }
    }
  }
  if (-not (Test-Path $State.TranscriptDir)) { return $null }
  $files = Get-ChildItem $State.TranscriptDir -Filter *.jsonl -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $Since.AddSeconds(-2) }
  foreach ($f in $files) {
    $tail = Get-Content $f.FullName -Tail 120 -Encoding UTF8 -ErrorAction SilentlyContinue
    foreach ($line in $tail) {
      if ($line -notmatch '"isApiErrorMessage":true') { continue }
      $j = $null
      try { $j = $line | ConvertFrom-Json } catch { continue }
      $ts = [datetime]::Parse($j.timestamp).ToLocalTime()
      if ($ts -lt $Since.AddSeconds(-2)) { continue }
      $text = (@($j.message.content) | ForEach-Object { $_.text }) -join ' '
      if ($j.apiError -eq 'usage_limit_reached') {
        $reset = $null
        if ($j.apiErrorParams.rate_limit_info.resetsAt) { $reset = ConvertFrom-Epoch $j.apiErrorParams.rate_limit_info.resetsAt }
        elseif ($j.quotaLimits.resetsAt) { $reset = ConvertFrom-Epoch $j.quotaLimits.resetsAt }
        return [pscustomobject]@{ Source = 'session transcript'; Detail = $text; Transcript = $f.FullName; ResetsAt = $reset }
      }
      # Any other API error (plain rate limiting, overloaded, network, auth...): note it once, no failover.
      $key = "$($j.uuid)"
      if (-not $State.Ignored.ContainsKey($key)) { $State.Ignored[$key] = $true; Write-FailoverLog $State 'api-error' "$($j.error) / $($j.apiError): $text" 'ignored (not a usage limit)' }
    }
  }
  return $null
}

<# The last part of Claude's conversation in plain text: what was asked, said and changed. #>
function Export-ClaudeContext([string]$Transcript, [string]$Out, [int]$Messages = 40) {
  $lines = @()
  if ($Transcript -and (Test-Path $Transcript)) {
    $items = New-Object System.Collections.Generic.List[string]
    foreach ($line in (Get-Content $Transcript -Tail 1500 -Encoding UTF8)) {
      $j = $null
      try { $j = $line | ConvertFrom-Json } catch { continue }
      if ($j.type -ne 'user' -and $j.type -ne 'assistant') { continue }
      if ($j.isMeta -or $j.isSidechain) { continue }
      $role = if ($j.type -eq 'user') { 'USER' } else { 'CLAUDE' }
      $c = $j.message.content
      if ($c -is [string]) { if ($c.Trim()) { $items.Add("### $role`n$($c.Trim())") }; continue }
      foreach ($part in @($c)) {
        if ($part.type -eq 'text' -and $part.text.Trim()) { $items.Add("### $role`n$($part.text.Trim())") }
        elseif ($part.type -eq 'tool_use') {
          $inp = $part.input
          $what = if ($inp.file_path) { $inp.file_path } elseif ($inp.command) { ([string]$inp.command).Substring(0, [Math]::Min(200, ([string]$inp.command).Length)) } elseif ($inp.description) { $inp.description } else { '' }
          $items.Add("- CLAUDE used $($part.name): $what")
        }
      }
    }
    $start = [Math]::Max(0, $items.Count - $Messages)
    $lines = $items.GetRange($start, $items.Count - $start)
  }
  $body = "# Claude's last session (most recent at the bottom)`nSource: $Transcript`n`n" + ($(if ($lines.Count) { $lines -join "`n`n" } else { '(no transcript found)' }))
  Set-Content -Path $Out -Value $body -Encoding utf8
}

function Send-Notice([string]$Title, [string]$Text) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $n.ShowBalloonTip(10000, $Title, $Text, [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep -Seconds 6
    $n.Dispose()
  } catch { }
  [console]::Beep(880, 200)
}

<#
  Hands the work to Codex. Never commits, pushes, resets or discards anything:
  the working tree is backed up to refs/failover/<stamp> first (a git object only; your files are untouched).
#>
function Invoke-Failover($State, [string]$Transcript, [string]$Reason, $ResetsAt = $null, [string]$CodexCommand = 'codex') {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $run = Join-Path $State.Dir $stamp
  New-Item -ItemType Directory -Force $run | Out-Null
  $repo = $State.Repo
  if (-not $Transcript) {
    $latest = Get-ChildItem $State.TranscriptDir -Filter *.jsonl -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) { $Transcript = $latest.FullName }
  }
  Write-FailoverLog $State 'failover-start' $Reason "run $stamp"

  # 1. Back up the working tree (no file is touched; HEAD and the index stay as they are).
  $head = (& git -C $repo rev-parse HEAD 2>$null)
  $statusBefore = (& git -C $repo status --porcelain 2>$null) -join "`n"
  $snap = (& git -C $repo stash create "failover backup $stamp" 2>$null)
  if ($snap) { & git -C $repo update-ref "refs/failover/$stamp" $snap 2>$null | Out-Null }
  Set-Content (Join-Path $run 'git-status-before.txt') $statusBefore -Encoding utf8
  (& git -C $repo diff --stat 2>$null) -join "`n" | Set-Content (Join-Path $run 'git-diff-stat-before.txt') -Encoding utf8
  (& git -C $repo diff 2>$null) -join "`n" | Set-Content (Join-Path $run 'git-diff-before.patch') -Encoding utf8

  # 2. Context pack for Codex.
  $ctx = Join-Path $run 'claude-context.md'
  Export-ClaudeContext -Transcript $Transcript -Out $ctx
  $handoff = Join-Path $repo 'HANDOFF.md'
  $agents = Join-Path $repo 'AGENTS.md'
  $last = Join-Path $run 'codex-last-message.md'
  $prompt = @"
You are taking over a coding session from Claude Code, which stopped at $(Get-Date -Format 'yyyy-MM-dd HH:mm') because its subscription usage limit was reached ($Reason).
Continue exactly where Claude stopped, in this repository: $repo

Read first, in this order:
$(if (Test-Path $agents) { "- $agents (how this project works and its rules)`n" })- $handoff (the open work, if it exists)
- $ctx (Claude's last conversation: what the user asked, what Claude did and said, the last error)
- $(Join-Path $run 'git-status-before.txt') and $(Join-Path $run 'git-diff-stat-before.txt') (uncommitted work at the moment Claude stopped)

Rules:
- Do not redo work the context shows as finished. Pick up the unfinished part of the user's latest request.
- Keep every uncommitted change; build on it. Never run git commit, push, reset, checkout, restore, stash, clean, revert or rebase, and never delete or overwrite work you did not make.
- Do not publish or deploy anything.
- Run the project's checks if it has any (AGENTS.md lists them) and fix what you broke.
- Finish with a short report: what you completed, what is still left, the files you changed, anything the user must know.
"@
  Set-Content (Join-Path $run 'codex-prompt.md') $prompt -Encoding utf8

  # 3. Run Codex.
  Write-Host "[failover] Codex is working (log: $run\codex.log)..." -ForegroundColor Cyan
  $codexLog = Join-Path $run 'codex.log'
  $exit = 1
  try {
    # Output is shown live and saved as UTF-8 (Tee-Object would write UTF-16 on Windows PowerShell).
    $echo = { process { $s = "$_"; Write-Host $s; $s } }
    if ($CodexCommand -like '*.ps1') {
      $out = $prompt | & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $CodexCommand 2>&1 | & $echo
    } else {
      $out = $prompt | & $CodexCommand exec -C $repo -s workspace-write --color never -o $last - 2>&1 | & $echo
    }
    $exit = $LASTEXITCODE
    Set-Content -Path $codexLog -Value ($out -join "`n") -Encoding utf8
  } catch { Add-Content $codexLog "launch failed: $_"; $exit = 127 }
  $logText = if (Test-Path $codexLog) { Get-Content $codexLog -Raw -Encoding UTF8 } else { '' }
  $report = if (Test-Path $last) { (Get-Content $last -Raw -Encoding UTF8).Trim() } else { '' }

  # 4. Outcome.
  $result = 'completed'
  if ($exit -ne 0 -or -not $report) {
    if ($logText -match '(?i)usage limit|rate limit|quota|exceeded|429|insufficient|not logged in|login required|unauthori[sz]ed|401|authentication') { $result = 'codex-unavailable' }
    else { $result = 'codex-error' }
  }
  $headAfter = (& git -C $repo rev-parse HEAD 2>$null)
  $warn = if ($headAfter -ne $head) { " WARNING: HEAD moved from $head to $headAfter (Codex made a commit)." } else { '' }
  $statusAfter = (& git -C $repo status --porcelain 2>$null) -join "`n"
  Set-Content (Join-Path $run 'git-status-after.txt') $statusAfter -Encoding utf8

  # 5. Record it where the next assistant (or you) will look: HANDOFF.md and the log.
  $section = @"

## Failover $stamp ($result)
Claude stopped: $Reason$(if ($ResetsAt) { " (Claude's limit resets $ResetsAt)" }).
Backup of the working tree at hand-over: git ref refs/failover/$stamp$(if (-not $snap) { ' (no uncommitted changes then)' }). Context and logs: handoff-logs/failover/$stamp/.$warn
$(if ($result -eq 'completed') { "Codex's report:`n`n$report" } elseif ($result -eq 'codex-unavailable') { "Codex was unavailable too (usage limit, quota or sign-in). Nothing was lost: the work is as Claude left it, plus anything Codex wrote before it stopped. Resume with Claude when its limit resets." } else { "Codex stopped with an error (exit $exit); see handoff-logs/failover/$stamp/codex.log. Work so far is kept." })
"@
  Add-Content -Path $handoff -Value $section -Encoding utf8
  Write-FailoverLog $State 'failover-end' "exit $exit$warn" $result
  $msg = switch ($result) { 'completed' { 'Codex continued the work. See HANDOFF.md.' } 'codex-unavailable' { 'Codex is unavailable too. Progress saved; resume Claude when its limit resets.' } default { 'Codex stopped with an error. Progress saved.' } }
  Send-Notice "Claude -> Codex failover: $result" $msg
  return [pscustomobject]@{ Result = $result; Run = $run; Report = $report; Transcript = $Transcript; Stamp = $stamp }
}

<#
  After Codex: [R] resume Claude now, [W] wait for Claude's limit to reset then resume, [Q] quit.
  With no answer it waits for the reset (if known), else quits. Returns Claude arguments when supervised.
#>
function Invoke-ResumeChoice($State, $Result, [string]$ClaudeCommand = 'claude', [int]$Seconds = 60, $ResetsAt = $null, [switch]$Supervised) {
  $session = if ($Result.Transcript) { [IO.Path]::GetFileNameWithoutExtension($Result.Transcript) } else { '' }
  $brief = "While you were at your usage limit, Codex continued this work (result: $($Result.Result)). Read the newest 'Failover' section at the end of HANDOFF.md and handoff-logs/failover/$($Result.Stamp)/codex-last-message.md, check git status and git diff, keep all of Codex's changes, and continue from there without redoing anything."
  $resumeArgs = if ($session) { @('--resume', $session, $brief) } else { @('--continue', $brief) }
  $default = if ($ResetsAt) { 'W' } else { 'Q' }
  Write-Host ''
  Write-Host "[failover] Codex finished: $($Result.Result)." -ForegroundColor Green
  Write-Host "  R = resume Claude now   W = wait until Claude's limit resets$(if ($ResetsAt) { " ($ResetsAt)" }), then resume   Q = quit"
  Write-Host "  (no answer in $Seconds s: $default)"
  $choice = $default
  $until = (Get-Date).AddSeconds($Seconds)
  try {
    while ((Get-Date) -lt $until) {
      if ([Console]::KeyAvailable) { $k = [Console]::ReadKey($true).KeyChar.ToString().ToUpper(); if ('R', 'W', 'Q' -contains $k) { $choice = $k; break } }
      Start-Sleep -Milliseconds 200
    }
  } catch { }
  Write-FailoverLog $State 'resume-choice' $choice ''
  if ($choice -eq 'Q') { return $null }
  if ($choice -eq 'W' -and $ResetsAt) {
    $wait = [int][Math]::Max(0, (([datetime]$ResetsAt) - (Get-Date)).TotalSeconds) + 60
    Write-Host "[failover] Waiting $([Math]::Round($wait / 60)) min for Claude's limit to reset (Ctrl+C to stop)..."
    Start-Sleep -Seconds $wait
  }
  Write-FailoverLog $State 'claude-resume' "session $session" 'resuming Claude'
  if ($Supervised) { return $resumeArgs }
  $p = Start-Claude -Command $ClaudeCommand -Arguments $resumeArgs -WorkingDirectory $State.Repo
  $p.WaitForExit()
  return $null
}
