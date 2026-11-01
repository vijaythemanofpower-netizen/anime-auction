# Stand-in for Claude Code in failover tests. Writes a session transcript the way Claude
# Code does (a user request, an answer, then an API error) and then idles like Claude
# sitting at its limit. FAKE_MODE: usage (genuine subscription limit) | transient (plain
# rate limiting, must NOT fail over) | normal (just exits).
$dir = $env:FAKE_TRANSCRIPT_DIR
$mode = if ($env:FAKE_MODE) { $env:FAKE_MODE } else { 'usage' }
New-Item -ItemType Directory -Force $dir | Out-Null
$f = Join-Path $dir 'fake-session-0001.jsonl'
$now = [DateTimeOffset]::UtcNow
function W($o) { Add-Content -Path $f -Value ($o | ConvertTo-Json -Depth 8 -Compress) -Encoding utf8 }
W @{ type = 'user'; uuid = 'u1'; timestamp = $now.ToString('o'); message = @{ role = 'user'; content = 'Add a file codex-test.txt to the repo that says exactly: codex continued the work' } }
W @{ type = 'assistant'; uuid = 'a1'; timestamp = $now.AddSeconds(1).ToString('o'); message = @{ role = 'assistant'; content = @(@{ type = 'text'; text = 'I will create codex-test.txt next. Notes.txt edits are done already.' }) } }
Start-Sleep -Seconds 2
if ($mode -eq 'normal') { exit 0 }
$reset = $now.AddMinutes(2).ToUnixTimeSeconds()
if ($mode -eq 'usage') {
  W @{ type = 'assistant'; uuid = 'e1'; timestamp = [DateTimeOffset]::UtcNow.ToString('o'); isApiErrorMessage = $true; error = 'rate_limit'; apiError = 'usage_limit_reached'; apiErrorStatus = 429
    apiErrorParams = @{ rate_limit_info = @{ status = 'rejected'; resetsAt = $reset; rateLimitType = 'five_hour' } }
    message = @{ role = 'assistant'; model = '<synthetic>'; content = @(@{ type = 'text'; text = "You've hit your session limit · resets soon" }) } }
} else {
  W @{ type = 'assistant'; uuid = 'e2'; timestamp = [DateTimeOffset]::UtcNow.ToString('o'); isApiErrorMessage = $true; error = 'rate_limit'; apiErrorStatus = 429
    message = @{ role = 'assistant'; model = '<synthetic>'; content = @(@{ type = 'text'; text = 'API Error: the request was rate limited · send a message to retry' }) } }
  Start-Sleep -Seconds 6
  exit 0
}
Start-Sleep -Seconds 600
