# Roster2 task result

Implemented:
- Added optional `prev` and assigned all 250 named squad players to CSV team indexes 0–9. The 12 generic replacement rows have no `prev`.
- Added 53 notable players from the 2026 auction unsold list (internationally capped players and selected uncapped IPL veterans), excluding names already present. Their base prices are the registered lakh values shown by the auction source.
- Added a roster checker at `tools/check-roster.mjs`, plus the rating calibration notes/script at `tools/rate.ts`.

Checks:
- `node tools/check-roster.mjs`: 315 total players, 262 CSV players, 53 additions; no roster invariant failures.
- `npx tsc --noEmit -p .`: passed.
- `npx vite-node tools/check-roster.ts` and `npx vite-node tools/rate.ts`: could not start because esbuild process spawn returned EPERM in this sandbox. The roster checker was converted to plain Node and run successfully.

Counts after additions:
- Roles: opener 33, middle 34, finisher 25, keeper 34, allrounder 53, pace 102, spin 34.
- Tiers: 1: 46, 2: 67, 3: 122, 4: 63, 5: 17.

Still incomplete / uncertain:
- The requested per-player T20 career stat research and rating rewrite for all 315 players was not completed. `ratings-sources.md` explicitly marks every player's legacy/current game ratings as unsourced; added-player stat tuples are provisional estimates. `tools/rate.ts` documents the formula but does not regenerate all legacy ratings.
- Role and bowling-style data for the 53 additions is a conservative classification and needs individual verification.
- `tools/rate.ts` should be run after fixing the sandbox's esbuild spawn restriction. No git commands were run, as requested.
