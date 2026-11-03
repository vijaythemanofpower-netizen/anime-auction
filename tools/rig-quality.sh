#!/usr/bin/env bash
# Second pass after tools/rig-pipeline.sh: Codex makes the fights clear (shared stage canvas,
# wounds and blood, hard knockouts, anime-faithful attacks), checks are fixed by Codex,
# and the result is published only if everything passes. Never force-pushes.
cd "$(dirname "$0")/.."
LOG=handoff-logs/quality.log; : > "$LOG"
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
codex_do() { codex exec -s workspace-write --skip-git-repo-check "$1" < /dev/null >> handoff-logs/quality-codex.log 2>&1; }
check() { npx tsc --noEmit -p . > handoff-logs/check.txt 2>&1 && npx vitest run >> handoff-logs/check.txt 2>&1; }
say "waiting for the first pipeline to finish"
while ! grep -q "pipeline finished" handoff-logs/pipeline-result.txt 2>/dev/null || [ handoff-logs/pipeline-result.txt -ot tools/rig-quality.sh ]; do sleep 60; done
say "quality pass: Codex"
codex_do "$(cat handoff-logs/codex-quality-task.md)"
ok=1
for i in 1 2 3; do
  if check; then ok=0; break; fi
  say "checks failed (try $i), sending to Codex"
  codex_do "The type-check or tests fail after the 2D Arena quality pass (handoff-logs/codex-quality-task.md). Fix the code. Do not run git. Output:
$(grep -E -i 'error|fail|expected|×|\.tsx?:[0-9]' handoff-logs/check.txt | head -80)"
done
[ $ok = 0 ] || check && ok=0
if [ $ok = 0 ]; then
  git add src/ui tests AGENTS.md >> "$LOG" 2>&1
  git commit -q -m "2D Arena: one shared stage canvas (no clipping), wounds and blood, hard knockouts, anime-style signature attacks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" >> "$LOG" 2>&1 && git push -q >> "$LOG" 2>&1 && say "committed and pushed"
else
  say "checks still failing; nothing committed (see handoff-logs/check.txt)"
fi
say "done"
