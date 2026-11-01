# Stand-in for a Codex that is out of quota: prints what codex prints and fails.
$null = [Console]::In.ReadToEnd()
Write-Output "ERROR: You've hit your usage limit. Upgrade to Pro or try again later."
exit 1
