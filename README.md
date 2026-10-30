# Anime Auction: Ultimate Battle Arena

A local multiplayer party game for 2–6 players: bid on anime fighters whose true power is hidden, build a team, prepare for each match, and fight through a tournament decided by a real, seeded combat simulation — narrated by an anime-style commentator.

## Quick start

Requires Node.js 18+ (tested with Node 24).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Everything runs in the browser; no server, accounts, API keys or paid AI services are needed.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the Vitest suite (engine, auction, scout, combat, tournament, persistence, full-game flows) |
| `npm run typecheck` | TypeScript strict type check |
| `npm run build` | Type check + production build into `dist/` |
| `npm run preview` | Serves the production build |

## Comic battles (free local drawings)

Battles play out as a comic that draws itself. `src/engine/comic.ts` picks each fight's biggest moments from the event log (clashes, knockdowns, ultimates, injuries, the finishing blow), frames each as a panel with a shot, camera angle, size, sound word and caption, and writes a drawing prompt. The same battle always gives the same comic; a rematch gives a different one.

Drawings come from **ComfyUI** running on this computer (`%USERPROFILE%\ComfyUI_windows_portable`) with the **NoobAI-XL 1.1** anime model (falls back to Animagine XL 4.0) and the **DMD2** speed add-on: about 6–7 seconds per drawing on an RTX 3060 laptop (the model runs in a compact 8-bit mode so it fits in 6 GB of graphics memory), free and offline. `Start Game.bat` starts it automatically, or run `Start Drawing AI.bat`. Finished drawings are kept in the browser (newest 400). Without ComfyUI, panels use comic-styled portraits, each cropped, flipped and tinted to suit its moment (close-up, hit, knockdown, power-up). Comics read like a printed comic: the narrator's sentences in caption boxes and the fighters' real lines in speech balloons, with no sound-effect lettering. Characters found through the Explorer get their portrait as a light look reference (IP-Adapter add-on). Comics run 16, 32 or 50 panels, and drawn panels pick from several poses per shot. Every built-in character has a hand-cast voice (one of the game's own Kokoro voices, tuned for pitch and pace to fit the character; no voice copying), and delivery follows the line: shouts come quicker, trailing or hurt lines slower. The fight waits for each spoken line before moving on, and the music dips under speech. In Arena view, an injured body part shows a crack that draws in with a flash (red for fractures), and badly hurt fighters glow red and breathe heavily. Switch between **Comic** and **Arena** views in battle or in Settings.

## Online play (rooms and accounts)

**🌐 Play Online with Friends** signs players in (as a guest with just a name, or by email link to keep the account on every device) and lets one player create a room with a 6-character code that friends join. The host's browser runs the game; everyone else's moves (bids, prep, corner calls) are sent to the host over a private Supabase Realtime channel, and each player receives only the hidden stats of their own fighters. Hosted games are saved to the host's account and can be resumed on any device with the same room code.

- Backend: a free Supabase project. `supabase/schema.sql` creates profiles, rooms, members, cloud saves, the room functions and the rules for who can read and write what (run it once in the SQL Editor).
- Sign-in settings in Supabase: anonymous sign-ins on (for guests); Site URL and Redirect URLs set to the website and `http://localhost:5173/`.
- `src/online/client.ts` holds the project URL and publishable key (public by design). Override with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to use another project.
- Supabase's built-in email sender allows only a few sign-in emails per hour; add a custom SMTP provider (Authentication → Emails) before many people sign in by email.
- The 76 built-in anime characters have canon stat sheets (src/engine/data/canonStats.ts) based on their feats in their own series; each game varies them only slightly (±5), so the strongest stay strong. Other characters get stats from their fighter type with a wider spread.
- New games choose who's in the auction: Mix (built-in favourites plus random popular characters from every anime on AniList), All anime, or the built-in 76. During bidding, each player sees whether the advisor recommends bidding (Recommended / Maybe / Not recommended), with a note that "not recommended" is about price, budget and team fit, not strength.
- Home page: sign in (email link or guest) right on the home page, with a welcome-back card showing your record; drifting petals, sparks and a speed-line burst (off with reduced motion).
- While a comic is drawn, the finished panels appear one by one and facts about the fighters rotate underneath (hand-written for the 76 built-in anime characters, from the AniList biography for others).
- Your roster shows a private power ranking of your own fighters (#1 strongest), visible only to you.
- Accounts remember you: sign-in stays on each browser until you sign out. When an online tournament ends, each player's profile records the game (played / won). A guest can add an email ("Keep my account") to turn the guest account into a permanent one, keeping its record; if that email already has an account, they're signed in to that one instead.
- Room chat and reactions: while in a room, a chat button (bottom right, on every screen) opens a chat everyone in the room sees, with quick replies; the emoji bar sends reactions that float up every player's screen. Messages go straight over the room's channel and show under the sender's room name.
- Shared comics: when the host has the drawing app running, each finished panel is uploaded to the public `comics` storage bucket under the room's code and announced to the room, so every player sees the host's drawn comic (guests use the host's comic length and style). Only the room's host can upload or delete panels, and a room's panels are deleted when the host closes it.
- Testing two players in one browser while developing: open a second tab at `http://localhost:5173/?tab-session`.

## Host Portal (admins)

`admin.html` (on the website: `…/anime-auction/admin.html`) is the Host Portal: a dashboard of rooms, players and comic storage; close rooms and remove players; rename, ban and unban players; delete rooms nobody has played in for a while; and add or remove admins. Admins sign in by email. Every action is an `admin_*` database function in `supabase/admin.sql` that checks `is_admin()` on the server, so the page grants nothing by itself. The first admin is added once in the Supabase SQL Editor:

```sql
insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
```

## Hosting publicly

`npm run build` makes a static site in `dist/`. Upload that folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages). There is no server: saves, settings and players' own sounds and music stay in each visitor's browser.

What changes on a website:

- **Comic drawings** come from the drawing app on the visitor's own computer, so visitors without it see comic-styled portraits. On a website the drawing app is **off by default**: looking for it makes browsers ask for permission to reach the visitor's local network. A visitor who runs ComfyUI themselves can turn it on in Settings, starting ComfyUI with `--enable-cors-header https://your-site`.
- **Battle music:** the built-in tracks are CC0 and fine to host. Songs a player adds stay in their own browser and are never uploaded.
- **Natural voices** download a free voice model from Hugging Face on first use.
- **AI move writer:** each player uses their own Anthropic API key, stored only in their browser.
- **Characters:** names, artwork (loaded from AniList's CDN) and move names belong to their anime's creators. Publishing a fan game is at your own risk; keep it non-commercial, and take down anything a rights holder asks you to.

## How a game flows

Home → Create game (2–6 players, human or NPC, roster 3 or 4) → Build the auction pool from the Character Explorer → Live or turn-based auction with the Scout Advisor (TAKE / MIGHT TAKE / LEAVE) → Private character reveal → Tournament hub (bracket, standings, rosters, rivalries, history) → Battle preparation (fighters, frontline, strategy, mental approach, prep actions) → Battle arena (engine-calculated events + narration, pause/speed/skip/event log) → Verdict and consequences → … → Championship ceremony → Hall of Legends.

Every player starts with **10,000 coins** and must always keep enough to fill their remaining slots at the opening price.

## Architecture

```
src/
  engine/                 Pure game rules — no React, fully unit-tested
    types.ts              Versioned domain types; PublicCharacter vs HiddenProfile kept separate
    rng.ts                Seeded mulberry32 RNG + stable hashing
    data/                 Archetypes, temperaments, 47 abilities, synergies, environments, injuries, 40 original characters
    hidden.ts             Per-game hidden profile generation + Vault (encoded storage)
    providers/            Character data adapters: local catalog and AniList GraphQL
    auction.ts            Auction state machine, budgets, reserve rule, settlement, director recovery policy
    scout.ts              TAKE / MIGHT TAKE / LEAVE advisor (public info only)
    npc.ts                NPC bidder policy
    combat/               Event-driven battle engine (fighter.ts, engine.ts)
    narration.ts          Deterministic event-grounded narrator + validator
    tournament.ts         Adaptive Swiss groups + knockout for 2–6 players
    progression.ts        Fatigue, injuries, XP, evolution, rivalries
    analysis.ts           Team analysis
    hall.ts               Hall of Legends records
    validation.ts         Save/import validation incl. economic consistency
    game.ts               Phase transitions and orchestration
  store/
    persistence.ts        IndexedDB (games, vaults, battles, hall, settings) with memory fallback
    store.ts              App store; hidden data only through permission-checked getters
  ui/                     React screens and components, custom CSS design system
tests/                    Vitest suites
```

Key rules:

- **The engine decides, the narrator describes.** `simulateBattle(input)` produces a structured event log and result. Narration is generated afterwards, one line per verified event, and `validateNarration()` rejects lines that reference unknown events or cite numbers not in the event.
- **Exact replays.** A battle's input (fighter snapshots, preparation, environment, seed, engine version) is stored. Re-simulating it reproduces the identical event hash. A fresh rematch uses a new seed and is an exhibition only.
- **Hidden information.** Public character records contain no stats. Hidden profiles live in a per-game `Vault`, are generated from a per-game secret (so the same character differs between games but is stable within one), and are only returned to the UI via `store.hiddenFor(charId, viewer)` which checks ownership or legitimate scouting. The vault is stored XOR-encoded, not as plain text.

See `IMPLEMENTATION_STATUS.md` for the feature checklist, decisions, test results and known limitations.

## Battles: what you see and what decides them

- **Real characters, real moves.** 76 well-known anime characters from 20 series (Naruto, One Piece, Dragon Ball, Bleach, Jujutsu Kaisen, Demon Slayer, My Hero Academia, Attack on Titan, Hunter x Hunter, FMA, One-Punch Man, Fairy Tail, Chainsaw Man, Solo Leveling, JoJo, Mob Psycho 100, Tokyo Ghoul, Black Clover, Spy x Family, Fate/Zero, Sword Art Online, Frieren, Seven Deadly Sins). Each has four moves from their series: two known, one hidden until purchase, one unlocked by evolving (for example Itachi: Phoenix Flower, Crow Genjutsu, Tsukuyomi, Susanoo; Luffy: Gum-Gum Pistol, Gatling, Gear Second, Gear Fourth). Moves are defined in `src/engine/data/legendMoves.ts`.
- **Visual effects per move.** Each move has an effect type (beam, projectile, barrage, slash, punch, lightning, fire, ice, wave, genjutsu, domain, aura, summon, shield, heal), colours and a one-line description of how it looks. The arena plays the effect between the actual attacker and target, shows a move banner, an anime cut-in for transformations and ultimates, floating damage numbers, screen shake on big hits, and a K.O. stamp.
- **Illustrated battlegrounds.** Eight arenas (volcano, tundra, storm spire, temple, neon rooftops, moonlit forest, flooded colosseum, grand arena) with animated embers, snow, rain, fireflies and lightning. Each boosts certain elements and some have hazards.
- **Fights without health bars (engine 2.0).** Every attack is an exchange: the defender dodges, blocks (spending guard), parries and counters, throws a technique of their own that clashes head-on, or gets caught clean. Only clean hits wear a fighter down, cause injuries to the arm, leg, ribs or head (each with its own effect) and can knock them down or out. Fights end by knockout, finishing move, stoppage (too injured, or three knockdowns) or the judges, who score clean hits, knockdowns and injuries. The arena shows condition words (Fresh to Barely standing), guard and stamina meters, injury tags and knockdown marks; endurance is never shown as a number.
- **Your corner (engine 2.1).** At big moments the fight pauses and the player gets an injury report (a body chart coloured by how badly each part is hurt, plus guard and stamina in words) and up to 3 calls per fight: go all out, guard up, use the ultimate now, call back / fall back, or send in a benched teammate for one strike. Calls are stored in the battle input, so a battle with calls still replays exactly; the fight is re-simulated from the same seed and is identical up to the corner moment. Computer players make their own calls.
- **Rivalries and duos from the series.** 20 famous rivalries trade lines before the bell, fight 5% harder, and their signature moves collide (Rasengan vs Chidori, Hollow Purple vs Malevolent Shrine, ORA vs MUDA, Excalibur vs Enuma Elish). 17 same-series partnerships unlock named combos (Gogeta's Stardust Breaker, Yin-Yang Release, Brothers' Black Flash). Data in `src/engine/data/rivals.ts`.
- **Sound and voice.** Hits, blocks, clashes, knockdowns and the K.O. bell are synthesized in the browser (Web Audio), and the commentary is read aloud with the browser's speech voice. Both can be toggled on the battle screen; no audio files or services are used.
- **Anime staging and effects (update 5).** A GPU effects layer (PixiJS) draws particles, beams, lightning, slash arcs, shockwaves, speed lines and giant summons, with impact frames (the black-and-white flash), hit-stop, camera zoom on charge-ups and slow motion on knockouts. About 45 iconic moves (Rasengan, Chidori, Kamehameha, Hollow Purple, Malevolent Shrine, Getsuga Tensho, Excalibur vs Enuma Elish, ORA/MUDA...) have their own effect; every other move uses its type's effect. Falls back to the CSS effects if WebGL is unavailable.
- **Coach review, IQ and titles.** After each fight every corner call is replayed from that exact moment with every other option (fresh luck, same past) to show which call was best and what it cost; the strategy is compared with the alternatives; the player gets a coach IQ and titles (Mastermind, The Gambler, Certified Coward, Bench Boss, Big Spender, Fan Favourite...). Standings show IQ and titles.
- **Banter, jump-ins and twists.** Fighters mock, pump themselves up and react by temperament (hot-heads get fired up, cool heads ignore it, some get rattled), with real effects and speech bubbles. Bench fighters may ask to jump in when a teammate is in trouble (per-fighter permission in preparation: never / ask me / let them decide). Situational twists: avenge, last stand, second wind, a hidden technique, the arena breaking, the crowd rallying.
- **Sound and voices.** Recorded public-domain (CC0) sound effects from OpenGameArt (credits in `public/sfx/CREDITS.txt`), matched to each move type. Optional natural voices (Kokoro, open source) run on the device, on the graphics card when available: every character gets an original voice from their gender and temperament. Players can attach their own clips to any move or character (stored only in the browser).
- **Any character, real moves.** The Explorer also checks MyAnimeList (Jikan) for characters AniList lacks. With the player's own Anthropic API key (Settings), Claude writes a character's real techniques from their series; the game sets the numbers so balance holds, and the moves travel with the character into saved games.
- **Why the same fighters don't always win.** Results come from true stats (rolled per game), battle-day form (±12%), type matchups, arena, preparation, condition, momentum, awakenings and luck. Stat gaps have diminishing returns. After each battle, *What decided it* re-runs the identical matchup 60 times with different seeds and lists the factors from the event log.

## Data sources and content

- **Signature Legends** — 76 real anime characters. Official artwork is loaded at runtime from AniList's image CDN (not bundled), so pictures need an internet connection; without it the game falls back to drawn portraits and stays playable. Biographies are short summaries written for this game; combat stats are generated per game.
- **Arena Originals** — 40 original characters across 8 fictional series created for this game. Portraits are procedurally drawn SVG; no third-party artwork is bundled.
- **All Anime (online, default when online search is on)** — every character on AniList, searchable by name or by anime title (whole cast), most popular first. AniList results for the 76 legends are replaced by the legend version with signature moves. The pool's *Auto-fill: any anime* picks random characters from AniList's most popular few thousand.
- **AniList details** — the Explorer searches AniList's public GraphQL API. Only name, aliases, image, source title and description come from AniList; archetype, tags, abilities and all game stats are generated by the game and labelled as such. Requests have timeouts, retries with backoff on 429/5xx, response validation, caching and deduplication. If AniList is unreachable, the game remains fully playable with Arena Originals. Online search can be disabled in Settings.
