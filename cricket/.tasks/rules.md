# Task: accurate IPL mega-auction rules for Cricket Auction

Work only inside this folder (`cricket/`, Vite + React + TypeScript). Do NOT run git. Use web search to confirm every rule below against the official IPL 2025 mega-auction regulations (the latest mega auction; the 2026 auction was a mini auction). If a number below disagrees with the official rules, follow the official rules and note it in the result file.

Read first: `src/engine/auction.ts`, `src/engine/squad.ts`, `src/engine/game.ts`, `src/engine/types.ts` (players have `prev?: number`, their 2026 team as index 0-9), `src/store/store.ts`, `src/ui/screens/Auction.tsx`, `src/ui/screens/Setup.tsx`, `src/ui/screens/Squads.tsx`, `tests/engine.test.ts`, `tests/play.test.ts`.

Keep the engine pure and deterministic (seeded `Rng`, no Math.random/Date in src/engine). Keep the existing Quick / Standard / Full modes working as they are; add the IPL rules as a new squad mode `ipl`, the default in Setup.

## Rules to implement (mode `ipl`)
1. **Purse and squad:** ₹120 Cr purse; squad 18-25; at most 8 overseas in the squad, 4 in the XI. Compulsory slots and the existing "keep enough purse for empty slots" logic adapted to 18-25.
2. **Base prices** only from the official slabs: ₹30L, 50L, 75L, 1Cr, 1.25Cr, 1.5Cr, 2Cr. Map each player's `basePrice` to the nearest slab for this mode.
3. **Bid increments** by current price (confirm official): up to ₹1Cr +5L; ₹1-2Cr +10L; ₹2-5Cr +20L; above ₹5Cr +25L. Bid buttons show the next valid amount.
4. **Franchise identity:** each franchise in a game stands for one of the 10 previous teams (index 0-9). Add 2 more made-up franchise names to `FRANCHISE_NAMES` in game.ts (there must be 10, all invented, no real IPL names). Store the index on the franchise (`prev`).
5. **Retentions (before the auction):** new phase `retain` before `auction` in ipl mode. Each franchise may retain up to 6 of the players whose `prev` is its index: at most 5 capped and 2 uncapped. Official costs deducted from the purse (confirm): capped 1st ₹18Cr, 2nd ₹14Cr, 3rd ₹11Cr, 4th ₹18Cr, 5th ₹14Cr; uncapped ₹4Cr each. Humans choose on a simple screen (list of their previous players, tap to retain, running cost shown, a "Done" button); computer teams retain by a sensible value rule. Retained players leave the auction pool.
6. **Right to Match:** each franchise has RTM cards = 6 minus retentions (respect the capped/uncapped split per the official rule). When the hammer would fall on a player whose `prev` franchise is in the game, has an RTM card, and is not the winning bidder: that franchise is asked "Use RTM?" If yes, the winning bidder gets ONE final raise (any valid higher amount, or keep), then the RTM franchise may match that final price to take the player. Computer teams decide by player value v price. Humans answer through the existing auction UI with a clear prompt and a short timer (default: no).
7. **Accelerated rounds:** after every set has been offered once, remaining/unsold players come back in an accelerated round: shorter timer (half), and each human may nominate up to 5 unsold players to bring back (computer teams nominate by value). Players unsold after that are out.

## Also
- Online rooms: the host runs everything; any new guest action (retain choices, RTM yes/no, final raise, nominations) must go through the existing `guest()` forwarding and be validated in `applyAct` in store.ts (only the guest's own franchise, only in the right phase/moment). Follow the existing pattern.
- Update How to play (in `src/ui/App.tsx`) and `README.md` with the new rules in plain words.
- Tests: add tests in a new file `tests/rules.test.ts` for bid increments, retention costs and limits, RTM (match, final raise, decline), overseas cap 8, accelerated round. Update existing tests only where the new default mode changes them.
- Run `npx tsc --noEmit -p .` and `npx vitest run` if your sandbox allows. Write `.tasks/rules.result.md`: what you implemented, every official number you confirmed (with source URL), anything that differs from this brief.
