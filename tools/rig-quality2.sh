#!/usr/bin/env bash
# The 2D Arena quality work in four smaller Codex tasks (one big task was only partly done).
# Each step: Codex works, checks are fixed by Codex (3 tries), then the step is committed.
# At the end quality.log says "done", which starts tools/roster-pipeline.sh.
cd "$(dirname "$0")/.."
LOG=handoff-logs/quality.log; : > "$LOG"
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
codex_do() { codex exec -s workspace-write --skip-git-repo-check "$1" < /dev/null >> handoff-logs/quality-codex.log 2>&1; }
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
COMMON="Repo: Anime Auction. Read handoff-logs/codex-quality-task.md for the owner's goals and context, and src/ui/rig/* plus src/ui/battlefield/FightStage.tsx. Do ONLY the step below, completely; do not stop at a partial version and do not leave it for later. Do not run git. Run npx tsc --noEmit -p . until clean (vitest cannot run in your sandbox). Add one dated line to AGENTS.md 'Open work' saying what this step did."
step() { # $1 name, $2 task
  say "step: $1"
  codex_do "$COMMON

STEP: $2"
  if check_fix "$1"; then
    git add src/ui tests AGENTS.md >> "$LOG" 2>&1
    git commit -q -m "2D Arena: $1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" >> "$LOG" 2>&1 && say "committed: $1"
  else say "STILL FAILING: $1 (left uncommitted)"; fi
}
step "one shared stage canvas, nothing clipped" "Section 1 of the task file. Create src/ui/rig/RigStage.tsx: ONE PixiJS Application covering the whole fight stage (absolutely positioned over FightStage, pointer-events none, resizes with it). Every rig fighter is a Mesh (skinned with skin.ts each frame) in that one scene at stage coordinates (feet on the ground line, facing each other, flip by scale.x). Expose an imperative API the stage uses instead of per-fighter RigFighter boxes: play(fighterId, anim, opts), setForm(fighterId, base), moveTo(fighterId, x, ms), joint(fighterId, jointName) in stage px, and an effects Container for later steps. Switch FightStage to it for rig fighters, so no fighter or effect can be clipped by any box (check every overflow:hidden / clip on the stage elements too and remove clipping that cuts fighters). Keep the camera/screen-shake working on the whole stage. Clean up textures and the app on unmount (StrictMode-safe, alive checks after awaits, like RigView)."
step "wounds and blood you can see" "Section 2 of the task file, inside RigStage's scene. Wound decals attached to the bone of the hit body part so they move with the body (cuts red slash marks, bruises purple, burns dark scorch), added from the battle's injury/damage events, growing with severity and staying all fight. Blood: pooled particle sprays in the hit direction on heavy and cutting hits, drips from open wounds, floor blood pools that stay. Low HP: red hurt tint pulse, heavier breathing, stagger."
step "knockouts and falls you cannot miss" "Section 3 of the task file. In RigStage/FightStage: knockdowns launch the body in an arc (spin on heavy hits), land hard with a bounce and slide, dust burst, floor crack, screen shake, hit-stop and short slow motion on the landing. KO: the loser ends lying flat on the ground line and stays there; camera zooms toward the fallen fighter, big K.O. call, winner plays victory. Fix knockdown/defeated/hitHeavy/getUp keyframes in animations.ts if the body floats, clips through the floor or looks stiff (add overshoot and follow-through)."
step "signature attacks that look like the anime" "Section 4 of the task file, in RigStage's effects Container, driven by moves.ts plans (planMove): implement each effect kind properly (palmOrb swirling sphere with spiral lines, chargeHand crackling lightning with sparks, beam thick with white core and glow that pushes the target, projectile, slashArc sharp arcs with afterimages, area black flames that stay burning (Amaterasu), aura/summon such as a Susanoo ribcage armour around the user while active, clones as afterimage copies, teleport flicker and reappear behind the target, stretching arm for Gomu Gomu). Add afterimages on fast strikes, a 1-2 frame impact flash with the silhouette on big hits, speed lines on dashes. Pooled objects, no per-frame allocations."
say "done"
