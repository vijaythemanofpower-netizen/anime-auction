# End-to-end tests for the Claude -> Codex failover, in a throwaway git repo.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\failover\test\run-tests.ps1 [-SkipRealCodex]
# Scenarios: transient rate limit (no failover), genuine usage limit (real Codex run,
# completes a task, keeps uncommitted work), Codex unavailable (progress saved), hook
# classification (signal only for the usage limit).
param([switch]$SkipRealCodex)
$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$sup = Join-Path $here '..\supervisor.ps1'
$results = New-Object System.Collections.Generic.List[string]
$fail = 0
function Check([bool]$ok, [string]$what) { if ($ok) { $script:results.Add("PASS  $what") } else { $script:results.Add("FAIL  $what"); $script:fail++ } }

function New-TestRepo([string]$name) {
  $r = Join-Path $env:TEMP "failover-test-$name-$(Get-Random)"
  New-Item -ItemType Directory -Force $r | Out-Null
  & git -C $r init -q
  & git -C $r config user.email t@t; & git -C $r config user.name t
  Set-Content (Join-Path $r 'notes.txt') 'line one' -Encoding utf8
  Set-Content (Join-Path $r 'HANDOFF.md') "# Hand-off`n`n## Task`nCreate codex-test.txt containing exactly: codex continued the work`n" -Encoding utf8
  Set-Content (Join-Path $r '.gitignore') 'handoff-logs/' -Encoding utf8
  & git -C $r add -A; & git -C $r commit -q -m init
  # Uncommitted work Claude left behind: an edit and a new file. Both must survive.
  Add-Content (Join-Path $r 'notes.txt') 'line two (uncommitted, by Claude)' -Encoding utf8
  Set-Content (Join-Path $r 'draft.txt') 'untracked draft by Claude' -Encoding utf8
  return $r
}

# 1. Transient rate limit: logged, ignored, no Codex.
$r1 = New-TestRepo 'transient'
$env:FAKE_TRANSCRIPT_DIR = Join-Path $r1 '.transcripts'; $env:FAKE_MODE = 'transient'
& powershell -NoProfile -ExecutionPolicy Bypass -File $sup -Repo $r1 -ClaudeCommand (Join-Path $here 'fake-claude.ps1') -TranscriptDir $env:FAKE_TRANSCRIPT_DIR -NoResume | Out-Null
$log1 = Get-Content (Join-Path $r1 'handoff-logs\failover\failover.log') -Raw
Check ($log1 -match 'ignored \(not a usage limit\)') 'transient rate limit is logged as ignored'
Check ($log1 -notmatch 'failover-start') 'transient rate limit does not start Codex'

# 2. Genuine usage limit with the real Codex CLI.
if (-not $SkipRealCodex) {
  $r2 = New-TestRepo 'usage'
  $head = (& git -C $r2 rev-parse HEAD)
  $env:FAKE_TRANSCRIPT_DIR = Join-Path $r2 '.transcripts'; $env:FAKE_MODE = 'usage'
  $t0 = Get-Date
  & powershell -NoProfile -ExecutionPolicy Bypass -File $sup -Repo $r2 -ClaudeCommand (Join-Path $here 'fake-claude.ps1') -TranscriptDir $env:FAKE_TRANSCRIPT_DIR -NoResume
  $log2 = Get-Content (Join-Path $r2 'handoff-logs\failover\failover.log') -Raw
  Check ($log2 -match 'usage-limit .*detected by session transcript') 'usage limit detected from the transcript'
  Check ($log2 -match 'failover-end .*\| completed') 'Codex run completed'
  $run = Get-ChildItem (Join-Path $r2 'handoff-logs\failover') -Directory | Select-Object -First 1
  Check ($run -and (Get-Content (Join-Path $run.FullName 'claude-context.md') -Raw) -match 'codex-test.txt') 'context pack holds Claude''s last request'
  $ct = Join-Path $r2 'codex-test.txt'
  Check ((Test-Path $ct) -and ((Get-Content $ct -Raw).Trim() -eq 'codex continued the work')) 'Codex completed the test task (codex-test.txt)'
  Check ((Get-Content (Join-Path $r2 'notes.txt') -Raw) -match 'line two \(uncommitted, by Claude\)') 'uncommitted edit kept'
  Check ((Test-Path (Join-Path $r2 'draft.txt'))) 'untracked file kept'
  Check ((& git -C $r2 rev-parse HEAD) -eq $head) 'no commit made (HEAD unchanged)'
  Check ([bool](& git -C $r2 for-each-ref refs/failover)) 'working tree backed up to refs/failover/*'
  Check ((Get-Content (Join-Path $r2 'HANDOFF.md') -Raw) -match '## Failover .*\(completed\)') 'HANDOFF.md records the failover and Codex''s report'
  Check (((Get-Date) - $t0).TotalMinutes -lt 15) 'finished in reasonable time'
}

# 3. Codex unavailable too: progress saved, recorded, no crash.
$r3 = New-TestRepo 'codexout'
$env:FAKE_TRANSCRIPT_DIR = Join-Path $r3 '.transcripts'; $env:FAKE_MODE = 'usage'
& powershell -NoProfile -ExecutionPolicy Bypass -File $sup -Repo $r3 -ClaudeCommand (Join-Path $here 'fake-claude.ps1') -CodexCommand (Join-Path $here 'fake-codex-out.ps1') -TranscriptDir $env:FAKE_TRANSCRIPT_DIR -NoResume | Out-Null
$log3 = Get-Content (Join-Path $r3 'handoff-logs\failover\failover.log') -Raw
Check ($log3 -match 'failover-end .*codex-unavailable') 'Codex unavailable is detected'
Check ((Get-Content (Join-Path $r3 'HANDOFF.md') -Raw) -match 'Codex was unavailable too') 'progress note saved in HANDOFF.md'
Check ((Get-Content (Join-Path $r3 'notes.txt') -Raw) -match 'line two') 'work kept when Codex is unavailable'

# 4. The StopFailure hook: signal only for the usage limit.
$r4 = New-TestRepo 'hook'
$env:FAKE_TRANSCRIPT_DIR = Join-Path $r4 '.transcripts'; $env:FAKE_MODE = 'usage'
$p = Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $here 'fake-claude.ps1')`"" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5; Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
$tr = Join-Path $env:FAKE_TRANSCRIPT_DIR 'fake-session-0001.jsonl'
$env:ON_LIMIT_DRYRUN = '1'
$hookIn = @{ hook_event_name = 'StopFailure'; error = 'rate_limit'; cwd = $r4; transcript_path = $tr; last_assistant_message = '' } | ConvertTo-Json
$hookIn | & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here '..\..\on-limit.ps1')
$sig = Join-Path $r4 'handoff-logs\failover\signal.json'
Check ((Test-Path $sig) -and ((Get-Content $sig -Raw | ConvertFrom-Json).kind -eq 'usage_limit')) 'hook writes the usage-limit signal'
Remove-Item $sig -ErrorAction SilentlyContinue
$hookIn2 = @{ hook_event_name = 'StopFailure'; error = 'rate_limit'; cwd = $r4; transcript_path = ''; last_assistant_message = 'API Error: the request was rate limited' } | ConvertTo-Json
$hookIn2 | & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here '..\..\on-limit.ps1')
Check (-not (Test-Path $sig)) 'hook ignores plain rate limiting'
$hookIn3 = @{ hook_event_name = 'StopFailure'; error = 'overloaded'; cwd = $r4; last_assistant_message = 'Overloaded' } | ConvertTo-Json
$hookIn3 | & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here '..\..\on-limit.ps1')
Check (-not (Test-Path $sig)) 'hook ignores other API errors'
Remove-Item Env:ON_LIMIT_DRYRUN

Write-Host ''
$results | ForEach-Object { Write-Host $_ }
Write-Host ("{0} checks, {1} failed" -f $results.Count, $fail)
exit $fail
