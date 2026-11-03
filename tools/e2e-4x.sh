#!/usr/bin/env bash
# Two-player online test that WATCHES every fight at 4x (no skipping), Cards and 2D; failures
# go to Codex (app bug -> fix app, test bug -> fix test), up to 4 rounds. Commits what passes
# checks, then writes "done" to online.log so the new-characters job can start.
cd "$(dirname "$0")/.."
LOG=handoff-logs/online.log
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
codex_do() { codex exec -s workspace-write --skip-git-repo-check "$1" < /dev/null >> handoff-logs/online-codex.log 2>&1; }
check() { npx tsc --noEmit -p . > handoff-logs/check.txt 2>&1 && npx vitest run >> handoff-logs/check.txt 2>&1; }
commit() { git add -A src tests tools playwright.config.ts package.json package-lock.json tsconfig.json vite.config.ts AGENTS.md README.md "Finish 2D Fighters.bat" 2>/dev/null; git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && say "committed: $1"; }
check && commit "Fights: Card or 2D view chosen by the host and synced to online rooms; two-player online browser test (Playwright)"
say "step: test watches fights at 4x"
codex_do "Change the Playwright tests in tests/e2e (online.spec.ts and the single-player spec) so they WATCH every battle instead of skipping it: when a battle starts, set the battle screen's 'Narration speed' segment to 4× (group label 'Narration speed', button '4×') for both host and guest, then let the battle play to its end WITHOUT pressing any skip button (raise per-battle timeouts to fit; at 4x a battle takes a few minutes). While it plays, every 2 seconds check for BOTH players that the arena/stage (data-testid arena-stage) is visible with non-zero size, has visible fighters (cards or the 2D stage canvas), no ErrorBoundary fallback, and no new page errors; record failures with a screenshot. In the 2D run, the lobby has the 'Default fight view' group with '2D fighters' (src/ui/screens/Online.tsx): select it and FAIL (not skip) if it cannot be selected; during 2D battles also check the 2D stage canvas exists. Do not run git. Run npx tsc --noEmit -p . until clean."
for i in 1 2 3 4; do
  say "running the online test at 4x (round $i)"
  if npx playwright test > handoff-logs/e2e.txt 2>&1; then say "online test passes"; break; fi
  say "online test failed, sending to Codex"
  codex_do "The two-player online Playwright test (tests/e2e, watching fights at 4x) fails. For each failure decide: APP wrong (blank screen, error, stuck/unsynced screen) -> fix the app; TEST wrong (selector, timing) -> fix the test, never delete checks or go back to skipping fights. Screenshots/traces/error-context.md are in handoff-logs/e2e/. Do not run git. Output:
$(grep -v '^\s*$' handoff-logs/e2e.txt | tail -120)"
  check && commit "Fixes from the two-player online test at 4x (round $i)"
done
grep -q "online test passes" "$LOG" || say "online test STILL FAILING (handoff-logs/e2e.txt)"
check && commit "Two-player online test at 4x"; git push -q && say "pushed"
say "done"
