# Stand-in for a backup AI that does the work: reads the prompt, echoes the hand-over note, makes the test file.
$prompt = [Console]::In.ReadToEnd()
Write-Output (($prompt -split "`n") | Where-Object { $_ -match '^Note:' })
Set-Content -Path 'codex-test.txt' -Value 'codex continued the work' -Encoding ascii
Write-Output 'Done: created codex-test.txt.'
exit 0
