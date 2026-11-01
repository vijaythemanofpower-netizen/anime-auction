# Dedicated fighter animation (optional)

Every fighter is animated procedurally (src/ui/battlefield/motion.ts). If you
have hand-drawn or AI-drawn animation for a character, put a sprite sheet here
and register it in `manifest.json`. That character then plays its own frames
for each move instead of the procedural rig. Characters without a sheet keep
the procedural animation.

```json
{
  "legend:goku": {
    "url": "sprites/goku.png",
    "frameW": 256,
    "frameH": 341,
    "clips": {
      "idle":      { "row": 0, "frames": 6, "fps": 8, "loop": true },
      "strike":    { "row": 1, "frames": 8, "fps": 16 },
      "beam":      { "row": 2, "frames": 10, "fps": 12 },
      "hit":       { "row": 3, "frames": 5, "fps": 14 },
      "knockdown": { "row": 4, "frames": 8, "fps": 12 },
      "victory":   { "row": 5, "frames": 8, "fps": 10 }
    }
  }
}
```

- The key is the character id the game uses (`legend:<name>` for built-ins).
- One row per clip, frames left to right, all frames the same size (3:4 looks best).
- Clip names: idle, strike, cast, beam, throw, charge, ultimate, powerup, transform, hit,
  knockback, block, parry, recoil, dodge, clash, stagger, knockdown, getup, defeated,
  victory, taunt, recover, flinch, dashin, hurt. A missing clip falls back to `idle`;
  the card still dashes, jumps and recoils around the sheet.
- Sheets are preloaded once when the first battle opens, never during a fight.

## Single poses instead of sheets

A clip can also be one picture: `"strike": { "url": "sprites/goku/strike.webp" }`.
The fighter shows that pose for the length of the move and returns to `idle`;
moments without a pose use the closest one (beam -> cast, knockback -> hit...).

## Drawing poses with the local drawing app

With ComfyUI running (Start Drawing AI.bat), this draws six poses per fighter
(stance, strike, cast, hit, knocked down, victory) and registers them here:

    npx vite-node tools/make-sprites.ts goku luffy gojo
    npx vite-node tools/make-sprites.ts --all

Poses already on disk are kept; delete a file to redraw it. `--ref` adds the
fighter's portrait as a reference (helps lesser-known characters, can add scan
lines). About 8 seconds a pose on an RTX 3060.
