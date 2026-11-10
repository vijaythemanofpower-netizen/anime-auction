# Task: accurate player list and ratings for Cricket Auction

Work only inside this folder (`cricket/`, a Vite + React + TypeScript game). Do NOT run git. Use web search to check facts. Files you may change: `src/engine/data/players.ts`, `src/engine/types.ts` (one new optional field, below), `tests/play.test.ts` (only if a roster test needs updating), and new files under `tools/` and `.tasks/`. Touch nothing else.

## Background
- `src/engine/types.ts` has the `Cricketer` interface (read it first). Ratings are 0-100 game estimates.
- `src/engine/data/players.ts` holds `RAW` (262 players from `.tasks/squads2026.csv`: the 10 IPL squads for 2026 plus replacements) and a `FIX` table at the end with hand-set corrections. Keep its exported `PLAYERS` and `FIXED_NAMES` working.
- Names: every player has a playful name-alike (`name`, e.g. "V. Kohly") and `realName`. Never put real IPL franchise names in the code; the game uses made-up franchises.

## 1. Previous team (for Right to Match later)
Add an optional field to `Cricketer` in types.ts: `prev?: number` — the player's 2026 IPL team as an index 0-9 in this fixed order: CSK, DC, GT, KKR, LSG, MI, PBKS, RR, RCB, SRH. (Index only; no team names in the code. Put the order in a comment as "teams 0-9 follow the alphabetical order of the 2026 squads CSV".) Fill it for every player from the CSV `team` column. "Replacement" players: look up which team signed them; if unknown, leave `prev` unset.

## 2. Add the notable unsold players of the IPL 2026 auction (December 2025)
Search the web for the official list of players who went unsold in that auction. Add the notable ones (internationally capped players, plus uncapped players who had played IPL before): aim for 40-80. Each gets a full `Cricketer` entry like the others, `prev` unset, `basePrice` = their real registered base price in lakh. Do not add anyone already in the roster.

## 3. Accurate ratings for every player
The tier 1-3 players currently share copy-paste numbers. For EVERY player (existing and new), set ratings from their real record:
- Look up T20 career numbers (prefer T20 overall incl. IPL; recent 3 seasons weigh more): batting average, strike rate, sixes per innings; bowling economy, average/strike rate, death-overs and powerplay reputation, typical speed in km/h for pacers. Record what you used per player in `.tasks/ratings-sources.md` (one line each: name, key stats, source).
- Convert with ONE documented formula in a script `tools/rate.ts` (runs with `npx vite-node tools/rate.ts`), so the numbers are reproducible. Keep the scale the game expects: elite in their skill 85-95, solid 70-80, part-timers 35-55, tail-end batting 10-30. vsPace and vsSpin should differ where a player has a known strength or weakness. `tempo` follows strike rate, `power` follows six-hitting, `consistency` follows average.
- Fix roles where wrong (opener/middle/finisher/keeper/allrounder/pace/spin, real bowling style, batting hand).
- Players with genuinely no T20 data: modest tier-1 profile, listed in `.tasks/ratings-sources.md` as "no data".
- `tier` (1-5) and `basePrice` must still follow each other (tier5 200, tier4 150, tier3 100, tier2 50, tier1 30 or 20), roughly 15 tier-5, 40 tier-4.
- You may fold the `FIX` table into the data; keep `FIXED_NAMES` exported (an empty array is fine if FIX is gone) so tests still compile.

## 4. Checks
Write a throwaway check (under tools/) that: every CSV name appears once; ids, names and realNames are unique; `overseas === (country !== 'IND')`; `(bowl === 'none') === !bowling`; pace/spin role players have `bowling`; pacers have speed 110-160, spinners speed 0. Run it and `npx tsc --noEmit -p .` if your sandbox allows, and fix your errors. Write a summary to `.tasks/roster2.result.md`: player counts per role/tier, how many unsold players added, anything you were unsure about.
