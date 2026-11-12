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
$LimitPattern = '(?i)usage limit|rate limit|quota|exceeded|exhausted|RESOURCE_EXHAUSTED|429|insufficient|not logged in|login required|please log in|not authenticated|GEMINI_API_KEY|unauthori[sz]ed|401|authentication|connection refused|could not connect'

<#
  Runs one backup AI on the prompt and says how it went: completed, unavailable (limit, quota,
  sign-in, local model not running) or error. A *.ps1 command is a stand-in used by the tests.
#>
function Test-ApiKey([string]$Repo, [string]$Key) {
  if ([Environment]::GetEnvironmentVariable($Key)) { return $true }
  $envFile = Join-Path $Repo '.env'
  return (Test-Path $envFile) -and [bool](Select-String -Path $envFile -Pattern "^\s*$Key\s*=\s*\S" -Quiet)
}

function Invoke-Backup([string]$Name, [string]$Command, [string]$Prompt, [string]$Run, [string]$Repo, [string]$Model = 'ollama_chat/qwen3:8b') {
  $slug = ($Name.ToLower() -replace '[^a-z]', '')
  $log = Join-Path $Run "$slug.log"
  $last = Join-Path $Run "$slug-last-message.md"
  Write-Host "[failover] $Name is working (log: $log)..." -ForegroundColor Cyan
  $exit = 1; $out = @()
  # Output is shown live and saved as UTF-8 (Tee-Object would write UTF-16 on Windows PowerShell).
  $echo = { process { $s = "$_"; Write-Host $s; $s } }
  try {
    if ($Command -like '*.ps1') {
      Push-Location $Repo
      try { $out = $Prompt | & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Command 2>&1 | & $echo }
      finally { Pop-Location }
    } elseif ($Name -eq 'Codex') {
      $out = $Prompt | & $Command exec -C $Repo -s workspace-write --color never -o $last - 2>&1 | & $echo
    } elseif ($Name -eq 'Gemini') {
      # Edits files in this folder; the only commands it may run are the project's checks.
      Push-Location $Repo
      # The default model is often overloaded or out of free quota; 3.6 Flash answers on the free tier. Override with RELAY_GEMINI_MODEL.
      $gm = if ($env:RELAY_GEMINI_MODEL) { $env:RELAY_GEMINI_MODEL } else { 'gemini-3.6-flash' }
      try { $out = $Prompt | & $Command -m $gm -p ' ' --approval-mode auto_edit --skip-trust --allowed-tools 'run_shell_command(npx tsc),run_shell_command(npx vitest),run_shell_command(npm run build),run_shell_command(git status),run_shell_command(git diff)' 2>&1 | & $echo }
      finally { Pop-Location }
    } else {
      # Aider with a free API model, or the local model through Ollama (unlimited, but much weaker). It edits files only.
      $pf = Join-Path $Run "$slug-prompt.md"
      Set-Content $pf $Prompt -Encoding utf8
      $env:OLLAMA_API_BASE = 'http://127.0.0.1:11434'
      Push-Location $Repo
      try { $out = & $Command --model $Model --yes-always --no-auto-commits --no-show-model-warnings --no-check-update --no-pretty --message-file $pf 2>&1 | & $echo }
      finally { Pop-Location }
    }
    $exit = $LASTEXITCODE
  } catch { $out = @("launch failed: $_"); $exit = 127 }
  $text = ($out -join "`n")
  Set-Content -Path $log -Value $text -Encoding utf8
  $report = if (Test-Path $last) { (Get-Content $last -Raw -Encoding UTF8).Trim() } else { (($out | Select-Object -Last 40) -join "`n").Trim() }
  $outcome = if ($exit -eq 0 -and $report -and $text -notmatch $LimitPattern) { 'completed' } elseif ($text -match $LimitPattern -or $exit -eq 127) { 'unavailable' } else { 'error' }
  return [pscustomobject]@{ Outcome = $outcome; Exit = $exit; Log = $text; Report = $report }
}

function Invoke-Failover($State, [string]$Transcript, [string]$Reason, $ResetsAt = $null, [string]$CodexCommand = 'codex', [string]$GeminiCommand = 'gemini', [string]$LocalCommand = 'aider') {
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

  # 3. Run the backups in turn: when one is out of quota, signed out or fails, the next one
  #    continues from whatever the previous one left in the working tree.
  # Free API backups run through Aider and join only when their key is set (environment or the repo's .env).
  # Their free model names change now and then: override with RELAY_OPENROUTER_MODEL / RELAY_GROQ_MODEL.
  $backups = @(
    @{ Name = 'Codex'; Command = $CodexCommand },
    @{ Name = 'Gemini'; Command = $GeminiCommand },
    @{ Name = 'OpenRouter'; Command = $(if (Test-ApiKey $repo 'OPENROUTER_API_KEY') { $LocalCommand }); Model = $(if ($env:RELAY_OPENROUTER_MODEL) { $env:RELAY_OPENROUTER_MODEL } else { 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free' }) },
    @{ Name = 'Groq'; Command = $(if (Test-ApiKey $repo 'GROQ_API_KEY') { $LocalCommand }); Model = $(if ($env:RELAY_GROQ_MODEL) { $env:RELAY_GROQ_MODEL } else { 'groq/openai/gpt-oss-120b' }) },
    @{ Name = 'Local Qwen'; Command = $LocalCommand; Model = 'ollama_chat/qwen3:8b' }
  ) | Where-Object { $_.Command }
  $result = 'all-unavailable'; $by = ''; $report = ''; $exit = 1; $tried = @()
  $basePrompt = $prompt
  foreach ($b in $backups) {
    $r = Invoke-Backup -Name $b.Name -Command $b.Command -Prompt $prompt -Run $run -Repo $repo -Model $b.Model
    $tried += "$($b.Name): $($r.Outcome)"
    Write-FailoverLog $State 'backup' "$($b.Name) exit $($r.Exit)" $r.Outcome
    $exit = $r.Exit
    if ($r.Outcome -eq 'completed') { $result = 'completed'; $by = $b.Name; $report = $r.Report; break }
    if ($r.Outcome -eq 'error') { $result = 'error' }
    $tail = (($r.Log -split "`n") | Select-Object -Last 25) -join "`n"
    $prompt = $basePrompt + @"

Note: $($tried -join '; '). The previous backup ($($b.Name)) stopped before finishing. Anything it changed is already in the working tree: check git status and git diff, keep it, and finish the job. Its last output:
$tail
"@
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
Backups tried: $($tried -join '; ').
$(if ($result -eq 'completed') { "$by finished the work. Its report:`n`n$report" } elseif ($result -eq 'all-unavailable') { "Every backup was unavailable (usage limit, quota or sign-in). Nothing was lost: the work is as Claude left it, plus anything a backup wrote before it stopped. Resume with Claude when its limit resets." } else { "The backups stopped with errors; see the logs in handoff-logs/failover/$stamp/. Work so far is kept." })
"@
  Add-Content -Path $handoff -Value $section -Encoding utf8
  Write-FailoverLog $State 'failover-end' "exit $exit$warn$(if ($by) { " by $by" })" $result
  $msg = switch ($result) { 'completed' { "$by continued the work. See HANDOFF.md." } 'all-unavailable' { 'Every backup AI is unavailable. Progress saved; resume Claude when its limit resets.' } default { 'The backups stopped with errors. Progress saved.' } }
  Send-Notice "Claude failover: $result" $msg
  return [pscustomobject]@{ Result = $result; By = $by; Run = $run; Report = $report; Transcript = $Transcript; Stamp = $stamp }
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
