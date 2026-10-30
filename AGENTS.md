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

## Rules of the house
- Never put the Supabase service_role/secret key, or any password, in the code.
- Don't bundle copyrighted music or clone real voice actors; players may add their own files locally.
- Drawing (ComfyUI + Animagine XL 4.0 + DMD2, ~6 s/panel on the owner's RTX 3060) runs only on the host's machine; guests get the host's panels via storage, everyone else gets portrait comics.
- Phones matter: check new screens at 375 px wide (no sideways scroll, controls reachable).
- Keep README.md current when behaviour changes; record open work below.

## Open work (owner's list, Oct 30 2026)
1. Sign-in emails hit Supabase's hourly limit: needs a custom SMTP sender (owner enters the password in Supabase themselves).
2. Chat box for everyone in an online room.
3. Comics repeat the same picture for a character: make panels varied, accurate and longer.
4. Narration and voices feel rushed and lifeless: pace the fight to the spoken lines, better voices, music under them.
5. Phone layout still feels clumsy in places.
6. Arena view polish, plus a crack animation on the injured body part for fractures and injuries.
7. General improvements to the game, the online portal and the Host Portal.
