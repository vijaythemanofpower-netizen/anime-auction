# Task: premium, easy-to-navigate interface for Cricket Auction

Work only inside this folder (`cricket/`, Vite + React + TypeScript). Do NOT run git. No new npm dependencies (framer-motion is already installed and may be used, sparingly). Do not change game logic in `src/engine/` or the online/store logic, except the small store actions listed below.

The owner says the current look is basic: boring text, poor colours, plain buttons, awkward button placement, and loose ends (e.g. you can create an online room but not leave or close it). Make it feel like a premium sports broadcast product, easy to navigate on phone and desktop.

## Style reference (take the style, not the content)
Look at the sister game in the parent folder: `../src/ui/styles.css`, `../src/ui/manga.css`, `../src/ui/home.css`, `../src/ui/identity.css` (dark, layered backgrounds, a display font for headings, strong accent colour, glowing primary buttons, clear typographic scale, generous spacing). Build a cricket identity in that spirit: e.g. night-match stadium mood, deep navy/teal-green base, one bold accent (gold or electric amber), a second for "live" states, broadcast-style score graphics. Do NOT copy anime artwork, kana text, or its colours one-for-one.

## What to do
1. **Design tokens** in `src/ui/styles.css`: colours, a type scale with a display font + body font (a Google font via `index.html` link is fine with a good system fallback), radii, shadows, spacing. Every screen uses the tokens.
2. **Buttons**: one consistent set (primary, secondary, ghost, danger, icon) with hover/press/focus/disabled states, 44px minimum touch size, visible keyboard focus.
3. **Home page** (`src/ui/screens/Home.tsx`): a premium hero (title, one-line pitch, primary "New game", "Continue" when a save exists, "Join a room" with code input, secondary "Players" and "How to play"), then short feature cards. Clear hierarchy; no clutter.
4. **Navigation**: a consistent top bar on every screen: brand (home), the game switch link to Anime Auction (keep it), a clear "Menu" that opens a small sheet with: Home, Continue game, Players, How to play, Settings (sound, real names, reduced motion), and the online room section (see 5). Back buttons where a user would expect them. Phase screens (auction, squads, XI, match, season, champion) show a small step indicator of where you are in the game.
5. **No loose ends**, find and close every one, at least:
   - Online room: show the room code with a copy button and a "how friends join" hint; the host can **Close room** (ends the room, guests see "The host closed the room" and return home); a guest can **Leave room** (goes home). Add the minimal store actions + a 'closed' broadcast message in `src/online/room.ts` for this, following the existing patterns.
   - A saved game can be deleted ("Abandon game" with a confirm dialog styled like the app, not `window.confirm`).
   - Replace every `window.confirm`/`alert` in the UI with an in-app confirm dialog component.
   - Every screen has a way out (home/menu) and every modal can be closed with a button and Escape (except timed match calls, which must keep their timer).
   - Empty states (no photos, no results yet, nothing to show) have friendly text.
6. **All screens restyled** with the tokens: Setup, Auction (big lot card, live bid, timer ring, clear bid buttons for your team only), Squads/Prep, Match (broadcast scoreboard, ball chips, the timing meter), Season table, Champion, Players, How to play.
7. **Accessibility and phones**: works at 375px wide with no sideways scrolling, contrast AA, `prefers-reduced-motion` and the in-app reduced-motion setting respected.

## Check
Run `npx tsc --noEmit -p .` (and `npx vitest run` if your sandbox allows; it may not). Write `.tasks/ui.result.md`: what changed per screen, every loose end you found and how you closed it, and anything you could not do.
