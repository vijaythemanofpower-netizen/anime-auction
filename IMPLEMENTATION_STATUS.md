# Implementation Status

Last updated: 2026-10-28. Stack: React 18 + TypeScript (strict) + Vite 5, Vitest, IndexedDB. No runtime dependencies besides React.

## Checklist

### Foundations
- [x] Versioned domain model (`SCHEMA_VERSION`, `ENGINE_VERSION`) with public/hidden separation
- [x] Seeded deterministic RNG; stable IDs for every character, lot, transaction, battle, event
- [x] Custom design system (near-black/indigo surfaces, violet/cyan accents, gold currency), responsive layout, reduced-motion support, focus states, keyboard access
- [x] IndexedDB persistence in separate stores (games, vaults, battles, hall, settings), autosave, manual save, resume, delete, export/import with validation, memory fallback

### Character discovery
- [x] Global character database separate from each game's auction pool
- [x] 40 original characters / 8 original series with procedural original portraits
- [x] Search by character name or anime title over the full local catalog; pagination without repeats; archetype/tag/series filters; sorting
- [x] Character and anime/series detail views, Random Character, Random Anime, Surprise Me, Recently Viewed, add/remove pool, pool panel
- [x] AniList GraphQL provider adapter (timeouts, retry/backoff on 429/5xx, validation, caching, dedupe, cancellation); loading/empty/error/retry/fallback states
- [x] Verified vs game-generated fields labelled; original vs external characters labelled; missing-image fallback

### Auction
- [x] 10,000 coins per player; roster size 3 or 4
- [x] State machine: prepare → open → validated bids → leader/timer → close → settle once → deduct → roster → transaction → sold animation → next lot → completion
- [x] Live mode (shared screen, anti-sniping) and turn-based mode (device hand-off, timeout auto-pass)
- [x] Reserve rule: a player can never bid below what they need to finish their roster
- [x] Auction Director: lot ordering, unsold lots return once, scarcity recovery (assign at opening price to the player with most open slots) so every roster can always be completed
- [x] Economy panel (start, spent, remaining, average price, acquired, slots, minimum needed)
- [x] NPC bidders using public information only, through the same validated bid path
- [x] Scout Advisor: TAKE / MIGHT TAKE / LEAVE, player-specific, explanation + evidence-based confidence; scout tokens give coarse hints (the only permitted pre-purchase leak)

### Reveal, roster, preparation
- [x] Private reveal sequence with privacy hand-off screens; True Power, 9 stats, traits, hidden ability, evolution path, vulnerability
- [x] Roster view with conditions (fatigue, injuries, XP, evolution, record) and team analysis (offense/defense/speed/stamina/flexibility, roles, synergies, strengths, weaknesses)
- [x] Preparation: fighter selection, frontline/backline, 6 strategies, 6 mental approaches, prep points for train / recover / treat / scout opponent; all feed the battle input

### Combat
- [x] Event-driven ATB simulation: speed-based turn order, AI action choice weighted by archetype, temperament, strategy and Battle IQ
- [x] Damage formula: attack vs defense mitigation, ability power, element matchups, vulnerabilities, environment, synergies, strategy, momentum, berserker rage, crits, guard, variance, bounded per hit
- [x] Abilities with costs, cooldowns, triggers, targeting, status effects (burn, bleed, stun, freeze, weaken, focus, haste, shield, regen)
- [x] Dodge, block, counter, adaptation to repeated moves, awakening, desperation moves, Iron Will, critical moments, final exchange, environmental hazards, judges' decision at the action cap
- [x] Solo 1v1; Tag 2v2 (assist, combo, protect/intercept, tag switch, backline protection); Squad 3v3/4v4 (formation, focus fire, frontline replacement)
- [x] Full structured event log; final state and winner agree with the log; event hash
- [x] Exact replay (verified identical hash) and fresh rematch with new seed (exhibition)

### Narration
- [x] Deterministic local narrator from verified events: commentator lines, varied phrasing, temperament-based dialogue, price/rivalry/injury/previous-loss context
- [x] `validateNarration()` guard for any narration source
- [x] Pause, resume, replay, speed, skip to results, event history

### Tournament and history
- [x] Adaptive format for 2–6 players: Swiss group rounds (solo + optional tag) with rotating byes, then squad knockout (top 2 or top 4)
- [x] Visual bracket, standings, current/upcoming/complete matches, byes
- [x] Persistent fatigue, injuries, XP, evolution, rivalries (configurable)
- [x] Hall of Legends: champions, finalists, upsets, comebacks, MVP, most expensive, best value, rivalries, streaks, historic battles

### Update 2: real characters, signature moves, visuals, unpredictability
- [x] 76 Anime Legends (40 added in update 3) with verified AniList IDs and official image URLs (`src/engine/data/legends.ts`), now the default for the Explorer, quick start and auto-fill
- [x] 304 signature moves (4 per character) mapped to engine mechanics, each with an effect type, colours and a description of how it looks; signature moves are never given to other characters
- [x] New arena: illustrated backdrops with particles, fighter stands with official art, per-move effects, move banner, cut-ins, damage numbers, screen shake, TOP FORM / OFF DAY badges, K.O. stamp; responsive down to 375px
- [x] Engine 1.1.0: battle-day form, diminishing returns on stat gaps, wider damage variance, stronger comebacks, less speed double-dipping. Measured over 60 random legend matchups × 50 seeds: no 1v1 or 2v2 matchup is a guaranteed win; most favourites win 60–90%
- [x] "What decided it" post-battle analysis (`src/engine/outcome.ts`)
- [x] Narration includes each move's description; validator ignores digits that belong to move or stage names
- [x] Fixed: assist/combo/counter hits were tagged with move ids that don't exist, which crashed the new arena in team battles
- Note: battles recorded with engine 1.0.0 can no longer be exactly replayed (the app says so); fresh rematches still work.

### Update 3: exchange-based combat (engine 2.0.0)
- [x] Defense responses per attack: dodge, block (guard meter, guard break), parry + counter, clash of techniques, clean hit
- [x] In-fight injuries by body part (head, arm, leg, torso; two severities) with stat effects; serious ones can carry over between matches
- [x] Knockdowns, get-ups, knockouts (probability rises with wear, injuries and stagger; fresh fighters can be dropped but not finished), finishing moves, stoppages (injury limit or three knockdowns), judges score clean hits/knockdowns/injuries
- [x] Arena: condition words, guard and stamina meters, injury tags, knockdown marks, clash effect, floored and staggered poses, impact words instead of damage numbers
- [x] Narration, verdict, "What decided it" (knockdowns, clashes, parries, injuries), Hall of Legends (comebacks from knockdowns, MVP by clean hits) updated
- [x] Measured over 200 battles: about 77% knockouts, 18% stoppages, 4-5% judges; solo duels average about 60 actions; favourites in random legend duels win 55-100% (median about 70%)
- Note: battles recorded with engine 1.x can no longer be exactly replayed.

### Update 4: corner calls, rivalries, sound (engine 2.1.0)
- [x] Corner moments (knockdown, opponent down, guard broken, serious injury, barely standing, periodic check) pause playback for human sides; 3 calls per fight: all out, guard up, use it now, call back / fall back, send backup (bench reinforcement, once), let them fight
- [x] Calls recorded in `BattleInput.calls` and the battle re-simulated (`G.withCall`); tests prove events up to the corner are identical; exact replay includes calls; NPC sides use an auto-coach with its own RNG stream
- [x] Injury report: body chart (head/arm/torso/leg coloured by severity, cracks for serious injuries), guard and stamina as words; no bars on fighter cards
- [x] 20 rivalries (pre-fight lines, +5% power, forced signature-move clashes) and 17 named duo combos
- [x] Synthesized sound effects and speech-synthesis commentary with toggles
- Tests: 76/76 (adds 7 for calls, reinforcements, callback, auto-coach cap, rivalry data, rivalry clashes, duo combos)

### Update 5: effects, review, banter, sound, any character (engine 2.2.0)
- [x] PixiJS effects layer (lazy-loaded), 16 move-type recipes, ~45 signature recipes, impact frames, hit-stop, zoom, slow motion; CSS fallback
- [x] Coach review (`src/engine/review.ts`): per-corner alternatives via `BattleInput.branch` (re-randomises after the corner only; prefix proven identical in tests), strategy comparison, coach IQ; titles (`src/engine/titles.ts`)
- [x] Banter by temperament with effects; bench jump-ins with per-fighter permission; twists (avenge, last stand, second wind, hidden technique, arena, crowd) tuned to be rare
- [x] CC0 recorded sound effects (OpenGameArt, credited), synth fallback; Kokoro natural voices in a worker (WebGPU fp32, else WASM q8), lines generated ahead with character lines first and a basic-voice fallback for lines not ready; bring-your-own clips in a separate IndexedDB
- [x] AI move writer (`src/ui/ai/moveWriter.ts`): Claude Opus 5.5 via the official SDK with the user's key (browser), structured output, low effort, server-side fallback; Claude describes, the game balances; cached locally and stored on the character
- [x] MyAnimeList via Jikan, merged into name searches (fails silently)
- Not verified: the live Claude call (no key used in testing), Jikan (unreachable during testing), and how the sounds and voices actually sound (no audio output in testing; files were chosen by name and the voices were checked to produce real speech audio)
- Tests: 84/84

## Decisions (non-obvious)
- **Hidden stats per game:** generated from archetype templates + a per-game secret, so knowing the catalog never reveals true power, and stats stay fixed within a campaign. Training and evolution are the only stat changes.
- **Local-mode secrecy:** the browser holds all data; we keep hidden data out of public state, DOM attributes and plain-text storage (vault is encoded) and gate UI by viewer. This deters casual peeking but cannot stop someone using developer tools. Online authoritative mode was not built.
- **Bye = 2 points, win = 3.** Knockout seeding: points, wins, how fresh the winners finished, then seeded tiebreak.
- **Rivalries are between players** (not individual characters); intensity ≥2 gives both sides +3% damage and a small awakening bonus — symmetric, so it never favours either side.
- **Synergies need distinct members**, so one dual-tag character cannot activate a pair synergy alone; some synergies are hidden until a battle reveals them.
- **Endurance is hidden.** It still exists inside the engine (it drives knockout odds and a collapse when it runs out), but it is never shown as a number or bar; players see condition words, guard, stamina, injuries and knockdowns.
- **NPCs** are full players (bid, prepare, fight) so a single human can play.

## Tests (latest run, 2026-10-28)
- Latest `npm test`: **69/69 passed** (adds exchange tests: every attack has a defense response; knockouts before endurance runs out; injury and knockdown rules; commentary never quotes health). Previous: 65/65 passed across 6 files (adds legends, signature-move ownership, event integrity, outcome analysis, same-matchup-different-winner).
- Earlier run: 57/57 passed across 5 files — auction (13), combat (14), characters & scout (12), tournament (8), full game flow & persistence (10, using fake-indexeddb).
  - Covers: 10,000 start for 2–6 players; valid/invalid bids; overspend and reserve rule; single settlement; early close; anti-snipe; turn order and timeout; roster completion for every player count × roster size × mode; scarcity assignment; requeue; NPC budget compliance; deterministic replays; different rematch outcomes; HP/stamina bounds and log/state agreement over 120 random battles; defeated fighters never act; cooldowns; fatigue/injury effect; strategy effect; taunt backfire; environment rules; frontline targeting; narration grounding + validator; complete tournaments for 2–6 players with byes; save/reload/resume mid-auction; export/import; tampered-save rejection; complete games end-to-end for 2–6 players.
- `npm run typecheck` and `npm run build`: pass.
- Manual browser playthrough (built-in browser, desktop + 375px mobile): create game → pool search (local + live AniList) → live auction with NPCs and scout advisor → reload mid-auction and resume → private reveal → hub → NPC duel with narration → verdict → exact replay (hash verified) → fresh rematch → human preparation (fighter swap, strategy, taunt, training, opponent scouting) → full tournament to champion → Hall of Legends. No console errors.
- Bugs found and fixed during testing: burn/bleed knockouts skipped the defeat event and frontline replacement; scout rated a third same-archetype pick TAKE; comeback records counted knocked-out teammates; setup rows overflowed at phone width.

## Known limitations
- No online multiplayer / authoritative server (optional per spec; local play does not depend on it).
- No LLM narrator integration; the deterministic narrator is used. The validator is ready for an external narrator.
- AniList filters (archetype/tag) apply to the loaded page because those attributes are game-generated, not AniList fields.
- Optional advanced modes (Battle Royale, Boss Raid, trading, predictions) not implemented.
- No automated browser (Playwright) suite; the end-to-end journey is covered by engine-level full-game tests plus a manual browser playthrough.
