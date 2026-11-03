#!/usr/bin/env bash
# After the quality pass: Codex adds the Card/2D choice for online rooms, then writes a
# two-player Playwright test; the test is run here (outside Codex's sandbox) and real bugs it
# finds (blank screens, errors) go back to Codex, up to 4 rounds. Writes "done" to online.log.
cd "$(dirname "$0")/.."
LOG=handoff-logs/online.log; : > "$LOG"
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
codex_do() { codex exec -s workspace-write --skip-git-repo-check "$1" < /dev/null >> handoff-logs/online-codex.log 2>&1; }
check() { npx tsc --noEmit -p . > handoff-logs/check.txt 2>&1 && npx vitest run >> handoff-logs/check.txt 2>&1; }
check_fix() {
  for i in 1 2 3; do
    check && return 0
    say "checks failed after $1 (try $i), sending to Codex"
    codex_do "The type-check or tests fail after: $1. Fix it. Do not run git. Output:
$(grep -E -i 'error|fail|expected|×|\.tsx?:[0-9]' handoff-logs/check.txt | head -80)"
  done
  check
}
commit() { git add -A src tests playwright.config.ts package.json package-lock.json AGENTS.md vitest.config.* vite.config.ts >> "$LOG" 2>&1; git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" >> "$LOG" 2>&1 && say "committed: $1"; }
say "waiting for the quality pass to finish"
while ! grep -q "done" handoff-logs/quality.log 2>/dev/null; do sleep 60; done
say "step: Card/2D choice and 2D fights in online rooms"
codex_do "$(cat handoff-logs/codex-online2d-task.md)"
check_fix "Card/2D choice" && commit "Fights: Card or 2D view, chosen by the host and synced to online rooms; viewers can switch locally"
say "step: two-player online test"
codex_do "$(cat handoff-logs/codex-e2e-task.md)"
check_fix "online test" && commit "Two-player online browser test (blank screens, errors) with Playwright"
for i in 1 2 3 4; do
  say "running the online test (round $i)"
  if npx playwright test > handoff-logs/e2e.txt 2>&1; then say "online test passes"; break; fi
  say "online test failed, sending to Codex"
  codex_do "The two-player online Playwright test (tests/e2e) fails. Decide for each failure whether the APP is wrong (blank screen, error, stuck screen: fix the app) or the TEST is wrong (selector, timing: fix the test; never just delete checks). Screenshots/traces are in handoff-logs/e2e/. Do not run git. Output:
$(grep -v '^\s*$' handoff-logs/e2e.txt | tail -120)"
  check_fix "online test fixes round $i" && commit "Fixes from the two-player online test (round $i)"
done
grep -q "online test passes" "$LOG" || say "online test STILL FAILING (handoff-logs/e2e.txt)"
git push -q >> "$LOG" 2>&1 && say "pushed"
say "done"
