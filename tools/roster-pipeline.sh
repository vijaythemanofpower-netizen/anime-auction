#!/usr/bin/env bash
# Third pass: Codex adds the missing popular heroes and villains (handoff-logs/roster-batches.txt,
# one batch per line) with all their data, checks are fixed by Codex, then every new fighter
# is drawn for the 2D Arena; published only if all checks pass.
cd "$(dirname "$0")/.."
LOG=handoff-logs/roster.log; : > "$LOG"
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
codex_do() { codex exec -s workspace-write --skip-git-repo-check "$1" < /dev/null >> handoff-logs/roster-codex.log 2>&1; }
check() { npx tsc --noEmit -p . > handoff-logs/check.txt 2>&1 && npx vitest run >> handoff-logs/check.txt 2>&1; }
check_fix() {
  for i in 1 2 3; do
    check && { say "checks pass: $1"; return 0; }
    say "checks failed: $1 (try $i), sending to Codex"
    codex_do "The type-check or tests fail after: $1. Fix it (complete the data; do not delete characters or weaken tests). Do not run git. Output:
$(grep -E -i 'error|fail|expected|×|\.tsx?:[0-9]' handoff-logs/check.txt | head -80)"
  done
  check && return 0; say "STILL FAILING: $1"; return 1
}
say "waiting for the quality pass to finish"
while ! grep -q "done" handoff-logs/quality.log 2>/dev/null; do sleep 60; done
n=0
while IFS= read -r batch; do
  [ -z "$batch" ] && continue; n=$((n+1))
  say "batch $n: $batch"
  codex_do "$(sed "s|^BATCH\$|$batch|" handoff-logs/codex-roster-task.md)"
  if check_fix "added batch $n ($batch)"; then
    git add src tests >> "$LOG" 2>&1
    git commit -q -m "Roster: add $batch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" >> "$LOG" 2>&1 && say "batch $n committed"
  else
    say "batch $n left uncommitted; stopping so a person can look"; break
  fi
done < handoff-logs/roster-batches.txt
say "drawing the new fighters"
npx vite-node tools/make-rigs.ts --all >> handoff-logs/rigs-draw.log 2>&1
npx vite-node tools/rig-sheet.ts >> "$LOG" 2>&1
if check; then
  git add public/rigs >> "$LOG" 2>&1
  git commit -q -m "2D Arena: rigs for the new fighters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" >> "$LOG" 2>&1
  git push -q >> "$LOG" 2>&1 && say "pushed (site publishes from main)"
fi
say "done"
