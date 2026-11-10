# Cricket Auction

A party game for 1-6 friends: bid for the 2026 season's players in a live auction, build a squad that obeys the rules, then play a T20 season ball by ball.

## Play
- `npm install`, then `npm run dev` (http://localhost:5174).
- Published with Anime Auction: https://vijaythemanofpower-netizen.github.io/anime-auction/cricket/

## What's in it
- **Auction:** sets (marquee, batters, keepers, all-rounders, pace, spin, uncapped), live timer, computer bidders, scout tokens, mystery lot, squad rules.
- **Play every ball:** pick a delivery or shot, then stop the timing/accuracy meter. Partners split it: the batting captain bats, the bowling captain bowls. Choose who walks in after a wicket. Auto this over / innings when you want a break.
- **Season:** league with points table and net run rate, IPL-style playoffs (Qualifier 1, Eliminator, Qualifier 2, Final), Orange and Purple Caps.
- **Online rooms:** tick "Online room" in setup to get a 5-letter code; friends join from their own devices. Uses Supabase Realtime broadcast only (no tables). The host's browser runs the game.
- **Photos:** none are shipped. Use "Set photo" or "Import a photo folder" (files named after players); they stay in the browser.

## Notes
- Names are playful name-alikes (real names can be turned on); ratings are the game's own estimates.
- Engine (`src/engine/`) is pure and seeded: the same setup and answers always replay the same match.
- Checks: `npx tsc --noEmit -p .` and `npx vitest run`.
