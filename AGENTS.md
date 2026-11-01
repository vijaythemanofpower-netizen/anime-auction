# Anime Auction: Ultimate Battle Arena — guide for whoever works on this next

This file is for any AI coding assistant (Claude Code, OpenAI Codex, GitHub Copilot, Cursor, Gemini CLI, Aider, ...) or person picking up the work. Small pointer files (CLAUDE.md, GEMINI.md, .github/copilot-instructions.md) send each tool here.

**Hand-off rule:** before you stop, commit your work with a clear message, push, and update "Open work" at the bottom (what's done, what's half-done, what's next), so the next assistant can continue from GitHub alone.

A party game: players bid on anime fighters with hidden stats, then a tournament plays out in a deterministic combat engine, shown as a self-drawing comic. Read README.md for features; this file is how to work on it.

## Run, test, ship
- `npm install`, then `npm run dev` (http://localhost:5173, Host Portal at /admin.html). `Start Game.bat` does this and also starts the drawing app.
- `npx tsc --noEmit -p .` and `npx vitest run` (99+ tests) must pass before committing.
- Pushing to `main` on GitHub (vijaythemanofpower-netizen/anime-auction) runs tests, builds and publishes to https://vijaythemanofpower-netizen.github.io/anime-auction/ (.github/workflows/pages.yml). Commit identity for this repo is set in its local git config.
- Two players in one browser while developing: a second tab at `http://localhost:5173/?tab-session`. Don't `import()` app modules from the console during such tests: Vite can load a second copy of `src/online/room.ts`, which takes over sending moves.

## Map
- `src/engine/` pure, seeded game logic (no DOM). `combat/engine.ts` battles (ENGINE_VERSION in `types.ts`), `game.ts` phases, `auction.ts`, `tournament.ts`, `comic.ts` (comic director: picks moments, writes drawing prompts), `actions.ts` (player moves as data for online play).
- `src/store/` app store (`store.ts`: game, hidden-stats vault, online guest/host behaviour) and IndexedDB persistence.
- `src/ui/` React screens and components; `comic/` comic page + ComfyUI client (`drawing.ts`); `fx/` PixiJS effects; `sound.ts`, `voices.ts` (Kokoro TTS worker), `music.ts` (CC0 tracks in public/bgm + players' own songs).
- `src/online/` Supabase: `client.ts` (project URL + publishable key, public by design), `auth.ts` (guest or email-link sign-in), `room.ts` (rooms: host's browser runs the game, guests send moves; compressed messages in `wire.ts`; shared comic panels in the `comics` storage bucket).
- `src/admin/` Host Portal (admin.html). Every admin action is an `admin_*` SQL function that checks `is_admin()` server-side.
- `supabase/schema.sql`, `supabase/admin.sql`: database, storage and security rules. Run changes in the Supabase SQL Editor (project pzshrqbbovlqjerhdrzc); keep these files the source of truth.

## Backup AI hand-off
When Claude's usage limit runs out, Claude writes HANDOFF.md with one section per assistant ("## Codex task", "## Gemini task": always two different tasks, or "none") and runs `Continue with backup AI.bat` (tools/handoff.ps1). Codex runs first, then Gemini, never at the same time. Both are kept inside this folder: Codex by its Windows sandbox (%USERPROFILE%\.codex\config.toml), Gemini (model gemini-3.5-flash, API key in %USERPROFILE%\.gemini\.env) by workspace-only file tools plus an allow-list of the three check commands. Neither commits or pushes: after each one the script runs type-check, tests and build, publishing only if all pass and otherwise saving the work on a backup/<time>-<ai> branch. Results: handoff-logs/last-result.txt.
It also starts by itself: a Claude Code `StopFailure` hook (matcher `rate_limit`, in the owner's %USERPROFILE%\.claude\settings.json) runs tools/on-limit.ps1 when Claude hits the usage limit while working on this project (session inside this folder, or files here changed in the last 3 hours; at most once an hour; log in handoff-logs/on-limit.log). So **keep HANDOFF.md current while you work**: whatever it says when the limit hits is what Codex and Gemini do. If both sections say "none" but work is uncommitted, Codex is told to finish that work. `ON_LIMIT_DRYRUN=1` tests the script without starting the hand-off.

## Rules of the house
- Never put the Supabase service_role/secret key, or any password, in the code.
- Don't bundle copyrighted music or clone real voice actors; players may add their own files locally.
- Drawing (ComfyUI + NoobAI-XL 1.1, falling back to Animagine XL 4.0, + DMD2, ~7-12 s/panel; ComfyUI_IPAdapter_plus gives Explorer characters a light portrait reference on the owner's RTX 3060) runs only on the host's machine (it allows only the website's origin, https://vijaythemanofpower-netizen.github.io; `npm run dev` reaches it through the `/comfy` proxy in vite.config.ts, and Chrome asks once to allow local network access on the website); guests get the host's panels via storage, everyone else gets portrait comics.
- Phones matter: check new screens at 375 px wide (no sideways scroll, controls reachable).
- Keep README.md current when behaviour changes; record open work below.

## Open work (Nov 1 2026, end of Claude session)
Living battlefield (Nov 1 2026, late): src/ui/battlefield/ (director.ts builds a per-battle script of weather, ground marks, prop damage, camera and motion cues; Battlefield.tsx draws sky/ground/marks/props/light/crowd; FighterRig.tsx + motion.ts animate fighters, sprite sheets via public/sprites/manifest.json; fxBridge.ts plays hazards/splashes/debris on the PixiJS layer), src/ui/fx/weather.ts (GPU weather inside FxDirector), src/ui/fx/motifs.ts (per-move looks from each move's words), battlefield.css. Tests: tests/battlefield.test.ts, tests/repetition.test.ts (commentary variety; narrate() now varies phrasing and describes a move's look once per fighter). Checked in headless Chrome on all 8 arenas, a squad battle and 375 px. Online sync is covered by tests (record packed/split/unpacked like a room message gives the identical battlefield at every playback index); not tried with two real players. Later the same night: arenas desert + ruins (engine data, backdrops, climates, props, hazards), per-character movement (src/ui/battlefield/signatures.ts, all 76 built-ins), injury postures, status-effect visuals, preloading, GPU texture cleanup (20 battle open/close cycles: heap 22.6 -> 26.1 MB, no leaked canvases), drawn sprite poses via tools/make-sprites.ts (ComfyUI, offline): 75 of 76 built-ins have six reviewed poses in public/sprites/ (13 MB); Pain is left on the procedural rig because the model kept drawing Naruto. Bad poses were redrawn with --seed and the HINT/AVOID lists in the tool.
Recently added (all committed, engine 2.9.0): fighting kits for all 76 built-ins + 36 raid villains (src/engine/data/kits.ts: forms reached mid-fight, extra moves, one situational secret move; engine checkTransform/kitMoment/unlocked); raids vs 1-4 bosses (raid.ts multiBoss, tuned: more bosses harder but winnable); arena play-by-play + form visuals (Arena.tsx PlayByPlay, .formed CSS); arena announced at match prep with fit recommendations (arenaFit.ts); pre-fight poll while drawing (predictions.ts preFightPoll, room 'guess' messages); online playback follows the host's clock + skip votes (room 'play'/'skipvote'); comics off by default, per-fight "Draw this fight"; corner calls up to 5 with taunt/focus/transform/secret; career dashboard (store/career.ts, profiles.career); friends + direct invites (online/friends.ts, ui/components/Social.tsx).
Home page redesign (Nov 1 2026, merged to main): lot-card hero, how a game goes, ways to fight, fight reel moved below; styles in src/ui/home.css; fixes the sideways overflow on phones.
Owner must run supabase/friends.sql once in the SQL editor (friends, invites, profiles.career). Until then the Friends tab shows a note and career saves only on the device.
Not yet checked with two real players: playback sync and skip votes, pre-fight poll sharing, invites (Realtime on public.invites), raids/team battles online.
Animated fighters: built as a procedural cut-out rig from each portrait (head/torso/base bands, src/ui/battlefield/motion.ts). Built-ins now play drawn poses (public/sprites/, made with tools/make-sprites.ts); everyone else keeps the procedural rig.
Known limits:
1. Drawings only work from the local version (Start Game.bat / localhost:5173); guests in a room hosted locally get the host's panels.
2. Stats: built-ins + ~165 more characters have canon sheets (canonStats.ts, canonByName.ts); others use a profile-based guess.
3. One drawing holds at most two fighters.
4. Website and localhost keep separate sign-ins.
5. Characters outside the built-ins and raid villains have no kit (they keep type-based moves and the generic awakening).
