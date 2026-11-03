#!/usr/bin/env bash
# Resume after a pause: the code steps of tools/rig-pipeline.sh already passed, so only finish
# drawing (finished drawings are skipped), make review sheets, publish if checks pass, then mark
# the first pipeline finished so tools/rig-quality.sh (and after it roster-pipeline.sh) start.
cd "$(dirname "$0")/.."
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a handoff-logs/pipeline.log; }
say "resuming: drawing the remaining fighters"
npx vite-node tools/make-rigs.ts --all >> handoff-logs/rigs-draw.log 2>&1
say "drawing done: $(ls -d public/rigs/*/ | wc -l) fighters"
npx vite-node tools/rig-sheet.ts >> handoff-logs/pipeline.log 2>&1
if npx tsc --noEmit -p . > handoff-logs/check.txt 2>&1 && npx vitest run >> handoff-logs/check.txt 2>&1; then
  git add src/ui tests tools public/rigs >> handoff-logs/pipeline.log 2>&1
  git commit -q -m "2D Arena: rigged fighters (pose-guided drawings, skinned mesh, shared fighting animations, per-move attack plans)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q && say "committed and pushed"
  ok=yes
else ok=NO; say "checks failing, nothing committed (handoff-logs/check.txt)"; fi
printf 'pipeline finished %s\nchecks ok: %s\n' "$(date)" "$ok" > handoff-logs/pipeline-result.txt
say "done"
