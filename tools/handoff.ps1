# Hands the open work to two backup AIs when Claude's usage limit runs out.
#
# HANDOFF.md has one section per assistant ("## Codex task", "## Gemini task").
# Each assistant only ever gets its own section, so they never work on the
# same task. They run one after the other, never at the same time.
#
# Both are kept inside this project folder:
#   - Codex runs in its Windows sandbox (workspace-write, set up in
#     %USERPROFILE%\.codex\config.toml): it can only write inside this folder.
#   - Gemini may edit files in this folder (its file tools refuse paths outside
#     the workspace) and may run only the game's check commands; any other
#     command is refused.
# Neither may commit, push or deploy. After each one, this script type-checks,
# tests and builds the game:
#   all green -> commit and push to main (publishes the website);
#   anything red -> the work is kept on a backup/<time>-<ai> branch instead,
#                   so nothing broken goes live and nothing is lost.
#
# Logs go to handoff-logs/ (last-result.txt holds a one-line summary per AI).
# Run it from "Continue with backup AI.bat".

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$logs = Join-Path $repo 'handoff-logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$summary = Join-Path $logs 'last-result.txt'
Set-Content $summary "Hand-off started $(Get-Date)"
function Note($text) { $line = "$(Get-Date -Format 'HH:mm:ss')  $text"; Write-Host $line; Add-Content -Path (Join-Path $logs "$stamp-summary.log") -Value $line }

if (-not (Test-Path 'HANDOFF.md')) { Note 'No HANDOFF.md: nothing to hand over.'; exit 1 }
git switch -q main 2>&1 | Out-Null
git pull --rebase --quiet origin main 2>&1 | Out-Null

# The text under "## <Name> task" up to the next "## " heading.
function Task-For($name) {
  $text = Get-Content 'HANDOFF.md' -Raw
  # Single quotes: inside double quotes PowerShell would run "$(.*?)" as a command.
  $m = [regex]::Match($text, '(?ms)^##\s+' + $name + ' task\s*$(.*?)(?=^##\s|\z)')
  if (-not $m.Success) { return '' }
  $body = $m.Groups[1].Value.Trim()
  if ($body -match '^(none|-|n/a)\b') { return '' }
  return $body
}

function Prompt-For($name, $other) {
  return @"
You are taking over work on this game from another AI assistant whose usage limit ran out.
1. Read AGENTS.md completely (how the project works and its rules), then HANDOFF.md.
2. Your task is ONLY the one under "## $name task" in HANDOFF.md. The "## $other task" belongs to a different assistant: do not work on it or change its files.
3. Work only inside this project folder. Follow AGENTS.md's rules strictly and keep changes focused on your task.
4. Check your work with ``npx tsc --noEmit -p .`` and ``npx vitest run`` and fix anything that fails.
5. Do NOT run git commit, git push or any deploy command, and never touch keys, passwords or the Supabase project: the hand-off script checks, saves and publishes your work.
6. Before you finish, update your own section of HANDOFF.md (what you completed, what is left, anything the next assistant must know) and the "Open work" list at the end of AGENTS.md.
"@
}

function Run-Codex($prompt) {
  codex exec -C $repo -s workspace-write -c 'windows.sandbox="unelevated"' $prompt 2>&1 | Tee-Object -FilePath (Join-Path $logs "$stamp-codex.log")
  return $LASTEXITCODE -eq 0
}

function Run-Gemini($prompt) {
  $log = Join-Path $logs "$stamp-gemini.log"
  gemini -m gemini-3.5-flash -p $prompt --approval-mode auto_edit --skip-trust `
    --allowed-tools 'run_shell_command(npx tsc),run_shell_command(npx vitest),run_shell_command(npm run build)' 2>&1 | Tee-Object -FilePath $log
  $ok = $LASTEXITCODE -eq 0
  $text = Get-Content $log -Raw -ErrorAction SilentlyContinue
  if ($text -match 'quota|RESOURCE_EXHAUSTED|429|exhausted your|Please log in|not authenticated') { $ok = $false }
  return $ok
}

# Type-check, test and build; publish if all pass, otherwise park on a branch.
function Save-Work($who, $title) {
  if (-not (git status --porcelain)) { Note "$who made no changes."; Add-Content $summary "$who | no changes | $title"; return }
  Note "Checking $who's work: type-check, tests, build."
  $check = Join-Path $logs "$stamp-$who-checks.log"
  npx tsc --noEmit -p . 2>&1 | Out-File $check; $typesOk = $LASTEXITCODE -eq 0
  npx vitest run 2>&1 | Out-File -Append $check; $testsOk = $LASTEXITCODE -eq 0
  npm run build 2>&1 | Out-File -Append $check; $buildOk = $LASTEXITCODE -eq 0
  git add -A
  if ($typesOk -and $testsOk -and $buildOk) {
    git commit -q -m "Backup AI ($who): $title" -m "Continued by $who after Claude's usage limit; type-check, tests and build passed before publishing."
    git push --quiet origin main
    Note "$who's work passed every check and is published."
    Add-Content $summary "$who | published | $title"
  } else {
    $branch = "backup/$stamp-$($who.ToLower())"
    git switch -q -c $branch
    git commit -q -m "Backup AI ($who), not published: $title" -m "Checks failed (types: $typesOk, tests: $testsOk, build: $buildOk). See handoff-logs/$stamp-$who-checks.log."
    git push --quiet origin $branch
    git switch -q main
    Note "$who's work failed a check, so it did not go live. Saved on branch $branch for review."
    Add-Content $summary "$who | NOT published (checks failed), saved on $branch | $title"
  }
}

foreach ($ai in @(@{ Name = 'Codex'; Other = 'Gemini' }, @{ Name = 'Gemini'; Other = 'Codex' })) {
  $task = Task-For $ai.Name
  if (-not $task) { Note "No task for $($ai.Name)."; continue }
  $title = ($task -split "`n")[0].Trim() -replace '^[#*\-\s]+', ''
  Note "$($ai.Name) is working on: $title"
  $prompt = Prompt-For $ai.Name $ai.Other
  $ok = if ($ai.Name -eq 'Codex') { Run-Codex $prompt } else { Run-Gemini $prompt }
  if (-not $ok) { Note "$($ai.Name) stopped early (error, signed out or out of quota). Its changes so far are still checked." }
  Save-Work $ai.Name $title
}
Note 'Hand-off finished.'
