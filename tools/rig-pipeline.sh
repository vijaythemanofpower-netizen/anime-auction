#!/usr/bin/env bash
# Runs the rest of the rigged-2D work without Claude watching each step:
# waits for the running helpers, checks their work (type-check + tests), sends failures
# back to Codex to fix (3 tries), wires Gemini's move table into the stage, then draws
# every fighter's rig and makes a contact sheet for review. Never commits or pushes.
#   bash tools/rig-pipeline.sh <codex-stage-output> <gemini-output>
cd "$(dirname "$0")/.."
LOG=handoff-logs/pipeline.log
RES=handoff-logs/pipeline-result.txt
: > "$LOG"
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
waitfile() { while [ ! -s "$1" ]; do sleep 30; done; }
codex_do() { codex exec -s workspace-write --skip-git-repo-check "$1" < /dev/null >> handoff-logs/pipeline-codex.log 2>&1; }

check() {
  npx tsc --noEmit -p . > handoff-logs/check.txt 2>&1 && npx vitest run >> handoff-logs/check.txt 2>&1
}
check_fix() { # $1 = what was just done
  for i in 1 2 3; do
    if check; then say "checks pass after: $1"; return 0; fi
    say "checks failed after: $1 (try $i), sending to Codex"
    codex_do "The type-check or tests fail after this change: $1. Fix the code (not the tests, unless a test is plainly wrong). Do not run git. Vitest cannot run in your sandbox; here is the output:
$(grep -E -i 'error|fail|expected|×|›|\.tsx?:[0-9]' handoff-logs/check.txt | head -80)"
  done
  check && return 0
  say "STILL FAILING after: $1"; return 1
}

# Helpers started earlier may still be running (or may have died with the Claude session).
busy() { powershell -NoProfile -Command "@(Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -match 'codex(\.exe)? exec|gemini-cli' -and \$_.CommandLine -notmatch 'Get-CimInstance' }).Count" | tr -d '\r'; }
say "waiting for running Codex/Gemini helpers"
while [ "$(busy)" != "0" ]; do sleep 30; done
if ! grep -q "tokens used" handoff-logs/codex-stage.log 2>/dev/null; then
  say "Codex stage task did not finish; running it again"
  codex_do "$(cat handoff-logs/codex-stage-task.md)
Parts of this may already be done (check src/ui/rig/rigIndex.ts and FightStage.tsx); finish it."
fi
check_fix "Codex put rig fighters on the 2D Arena stage (rigIndex.ts, FightStage.tsx, Arena.tsx, Versus.tsx)"
if [ ! -f src/ui/rig/moves.ts ] || ! npx vitest run tests/rig-moves.test.ts > /dev/null 2>&1; then
  say "Gemini's move table missing or failing; giving it to Codex"
  codex_do "$(cat handoff-logs/gemini-moves-task.md)
If src/ui/rig/moves.ts or tests/rig-moves.test.ts already exist, finish and fix them. Vitest cannot run in your sandbox; use tsc."
fi
check_fix "move table src/ui/rig/moves.ts"
codex_do "Wire src/ui/rig/moves.ts into the 2D Arena stage. In src/ui/battlefield/FightStage.tsx replace the placeholder strikeAnim() for rig fighters with planMove(charId, abilityName, abilityKind, fxColor) from src/ui/rig/moves.ts: use plan.approach (walk/run/dash; 'teleport' = play 'teleport', hide, reappear next to the target with 'appear'; 'jump'; 'stay' = attack from where they stand), plan.windup before plan.anim, plan.followUp after, plan.range (far/mid moves are fired from a distance), plan.effect (draw it at the attacker's RigHandle.joint(plan.effect.from): palmOrb/chargeHand = glowing orb in the hand during windup+strike, beam = a beam from the hand to the target, projectile = a moving shot, slashArc = an arc at impact, area/aura/clones/summon = a simple stage effect in plan.effect.color, in the stage's existing effect style), plan.shake for screen shake, plan.label shown briefly on screen, and reactionFor() for the target. Keep clip fighters unchanged. Do not edit moves.ts, animations.ts, skin.ts, RigView.tsx, skeleton.ts. Do not run git. Run npx tsc --noEmit -p . until clean."
check_fix "planMove wired into FightStage"

say "drawing every fighter"
npx vite-node tools/make-rigs.ts --all >> handoff-logs/rigs-draw.log 2>&1
say "drawing done: $(ls -d public/rigs/*/ 2>/dev/null | wc -l) fighters"
npx vite-node tools/rig-sheet.ts >> "$LOG" 2>&1
codex_do "Update the docs for the new rigged 2D fighters. In AGENTS.md 'Open work' add a short dated (today) paragraph: the 2D Arena now uses rigged fighters (src/ui/rig/: skeleton.ts shared skeleton, skin.ts skinning maths, RigView.tsx PixiJS mesh renderer, animations.ts shared animation library, moves.ts per-move plans, rigIndex.ts; art from tools/make-rigs.ts: pose-guided NoobAI + openpose ControlNet + BiRefNet, public/rigs/<key>/<form>/art.webp + rig.json, public/rigs/index.json; review with tools/rig-sheet.ts; the run is tools/rig-pipeline.sh); the older video clips (tools/make-fighters.ts, public/fighters) remain as fallback; open items: Naruto Sage/Baryon forms look like base, Goku SSJ odd glowing legs, face expressions not yet drawn, not checked by eye in a browser. In README.md describe the 2D Arena briefly as it now works. Edit only AGENTS.md and README.md. Do not run git."
check_fix "all rigs drawn + docs"; ok=$?
if [ $ok = 0 ]; then
  git add src/ui tests tools public/rigs AGENTS.md README.md >> "$LOG" 2>&1
  git commit -q -m "2D Arena: rigged fighters (pose-guided drawings, skinned mesh, shared fighting animations, per-move attack plans) for the roster

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" >> "$LOG" 2>&1 && git push -q >> "$LOG" 2>&1 && say "committed and pushed (site publishes from main)"
else
  b="backup/$(date +%Y%m%d-%H%M)-rigs"
  git stash push -q -u -m rigs -- src/ui tests tools public/rigs AGENTS.md README.md && git stash branch "$b" >> "$LOG" 2>&1 && git add -A src/ui tests tools public/rigs AGENTS.md README.md && git commit -q -m "WIP rigged fighters (checks failing, see handoff-logs/check.txt)" && git checkout -q main && say "checks failing: work saved on $b, nothing published"
fi
{ echo "pipeline finished $(date)"; echo "checks ok: $([ $ok = 0 ] && echo yes || echo NO)"; grep -E "STILL|failed|pushed|saved on" "$LOG"; } > "$RES"
say "done"
read -r -p "Press Enter to close" _ 2>/dev/null || true
