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

Drawings come from **ComfyUI** running on this computer (`%USERPROFILE%\ComfyUI_windows_portable`) with the **NoobAI-XL 1.1** anime model (falls back to Animagine XL 4.0) and the **DMD2** speed add-on: about 6–7 seconds per drawing on an RTX 3060 laptop (the model runs in a compact 8-bit mode so it fits in 6 GB of graphics memory), free and offline. `Start Game.bat` starts it automatically, or run `Start Drawing AI.bat`. Finished drawings are kept in the browser (newest 400). Without ComfyUI, panels use comic-styled portraits, each cropped, flipped and tinted to suit its moment (close-up, hit, knockdown, power-up). Clashes and face-offs are drawn as one picture of both fighters at medium range. A bench fighter sent in (by a corner call or jumping in) dashes into the arena view for their move with a FROM THE BENCH badge. Comics read like a printed comic: the narrator's sentences in caption boxes and the fighters' real lines in speech balloons, with no sound-effect lettering. Characters found through the Explorer get their portrait as a light look reference (IP-Adapter add-on). Comics run 16, 32 or 50 panels, and drawn panels pick from several poses per shot. Every built-in character has a hand-cast voice (one of the game's own Kokoro voices, tuned for pitch and pace to fit the character; no voice copying), and delivery follows the line: shouts come quicker, trailing or hurt lines slower. The fight waits for each spoken line before moving on, and the music dips under speech. In Arena view, an injured body part shows a crack that draws in with a flash (red for fractures), and badly hurt fighters glow red and breathe heavily. Switch between **Comic** and **Arena** views in battle or in Settings.

## Online play (rooms and accounts)

**🌐 Play Online with Friends** signs players in (as a guest with just a name, or by email link to keep the account on every device) and lets one player create a room with a 6-character code that friends join. The host's browser runs the game; everyone else's moves (bids, prep, corner calls) are sent to the host over a private Supabase Realtime channel, and each player receives only the hidden stats of their own fighters. Hosted games are saved to the host's account and can be resumed on any device with the same room code.

- Backend: a free Supabase project. `supabase/schema.sql` creates profiles, rooms, members, cloud saves, the room functions and the rules for who can read and write what (run it once in the SQL Editor).
- Sign-in settings in Supabase: anonymous sign-ins on (for guests); Site URL and Redirect URLs set to the website and `http://localhost:5173/`.
- `src/online/client.ts` holds the project URL and publishable key (public by design). Override with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to use another project.
- Supabase's built-in email sender allows only a few sign-in emails per hour; add a custom SMTP provider (Authentication → Emails) before many people sign in by email.
- The 76 built-in anime characters have canon stat sheets (src/engine/data/canonStats.ts) based on their feats in their own series; each game varies them only slightly (±5), so the strongest stay strong. About 140 more popular characters have canon sheets matched by name when they come from AniList (src/engine/data/canonByName.ts; AniList's copies of the built-ins get theirs too). Everyone else gets stats from their fighter type, shifted by a strength guess from their AniList profile (a captain or 'strongest' sorcerer rates higher, a high-school student in a romance lower), and "All anime" fills prefer characters from fighting shows. On top of that, the AI move writer has rated them: with your Anthropic key, Claude writes their real moves and a canon-based stat sheet on the same scale (per character in the Explorer, or for every all-anime fighter when creating a game with "AI-accurate stats" ticked). Stats are fixed when a character joins the auction, so rating happens before.
- New games choose who's in the auction: Mix (built-in favourites plus random popular characters from every anime on AniList), All anime, or the built-in 76. During bidding, each player sees whether the advisor recommends bidding (Recommended / Maybe / Not recommended), with a note that "not recommended" is about price, budget and team fit, not strength.
- Manga styling: inked panels with screen-tone corners and hard shadows, a huge vertical katakana title down each page (オークション, バトル, 殿堂...), a faded character poster per page, an ink header with a scene-coloured spine, speed lines on hover. The home page opens on a live lot card: a built-in fighter goes under the hammer with blacked-out stats, a few bids land, a SOLD stamp slams down and one canon stat is revealed, then the next lot (shown sold and still with reduced motion). Below it: how a game goes (bid, build, battle), the ways to fight (tournament, boss raid, team battle, online rooms), and official fight clips embedded from the rights holders' YouTube channels (Crunchyroll, Aniplex), skipping any blocked in the viewer's country. Home page styles live in src/ui/home.css.
- Living background: one of five scenes (Sakura Night, Thunder Clash, Inferno, Frost Moon, Shadow Realm), picked at random each visit and changing every 45 s, each with its own colours and effects (petals, lightning, embers, snow, wisps); the whole site's accent colours follow the scene. The home page shows a background duel: two fighters dash in, clash with a flash and shockwave, and a new pair follows. Sign in (email link or guest) right on the home page. Effects stop with reduced motion.
- While a comic is drawn, the finished panels appear one by one and facts about the fighters rotate underneath (hand-written for the 76 built-in anime characters, from the AniList biography for others).
- Your roster shows a private power ranking of your own fighters (#1 strongest), visible only to you.
- Fight length comes from the matchup: everyone's health pool is scaled by how even and how strong the two sides are, so mismatches end quickly (Gojo vs Zenitsu ~17 moves) and even clashes between strong fighters run long (Aizen vs Meruem ~87). It changes length, not who is favoured, and the comic's panel count follows. Engine 2.6.0.
- Healers (Support fighters, or anyone with a healing technique) mend the most hurt teammate every few turns (a solid chunk, not a full refill) and once per fight can bring a knocked-out teammate back to their feet. Engine 2.5.0.
- Comics draw the whole fight by default: one panel per exchange until the knockout (Settings → Comic length still offers 16/32/50).
- Team Battle (tournament hub → 🤝 Team Battle): the host splits players into Team A and Team B (default: alternating seats; 2v2, 3v3, or 2 vs 1 where the smaller team's players send more each), every player picks their own fighters on their own device (synced; NPCs and anyone who doesn't pick send their best), and the host starts the fight. Results show the winning team, an MVP from either side and everyone's share. Never changes the tournament (src/engine/teambattle.ts).
- Raid Boss (tournament hub → ⚔ Raid Boss): each player picks which of their own fighters to send (party of up to 8, synced online; anyone who doesn't pick sends their best), then the host picks one of 47 real anime villains (11 built-in characters plus 36 built-in villains from AniList: Kaido, Big Mom, Blackbeard, Akainu, Beerus, Jiren, Zamasu, Kaguya, Muzan, Yhwach, Kenjaku, Zeref, Acnologia, Griffith, Alucard and more; src/engine/data/villains.ts). Game mode 'Boss Raid' (new game / online lobby) opens the game on the Raid tab after the auction and every player's two strongest fighters (up to six) take it on. Bosses are scaled to the party and win most raids (about 30-42% party wins in simulation). Afterwards each fighter's contribution (damage dealt, hits absorbed, healing, final blow) is shown with an MVP. Raids are shared with the room, can be re-watched, and never change the tournament.
- Live predictions: during a fight, questions pop up with a 7-second countdown while it keeps playing (who wins, who lands the next clean hit, will a badly hurt fighter survive, a knockdown in the next 15 moves). Answers come from the fight itself and are revealed when the moment arrives; an Oracle score with streak bonuses builds up over the game on each device.
- Transformations and secret moves: every built-in fighter and raid villain has a fighting kit (src/engine/data/kits.ts): 1-3 named forms reached mid-fight when the moment calls for it (Naruto: Sage Mode → Kurama Link Mode → Baryon Mode; Sung Jinwoo: Shadow Monarch → Monarch's Domain → Ashborn Inheritance, with Igris, Beru and Bellion), more of their real attacks (some only in a form), and one secret move held back until a teammate falls, they're the last one standing, or they're nearly beaten. Forms show on the arena portrait (colour, glow, name) and in drawings.
- Every other character (from the full AniList search) gets one Awakened form when pushed to the limit, plus a Limit Break secret move. A small label under each arena portrait shows the mode they're in (Base form, Sage Mode, Bankai...).
- Form pictures: when a fighter transforms, their arena picture switches to that form. Add your own picture per form on the character's card (🌀 Form pictures, saved on this device); forms without one are painted once by the drawing app when it's running, then kept. The host's form pictures are shared with the room.
- Arena play-by-play: under the arena, the last few actions in words (move, element, damage, critical, blocks, heals, transformations).
- Raids against 1 to 4 bosses at once; more bosses is harder but still winnable.
- Comics are off by default: press 🎨 Draw this fight on the fights you want drawn.
- Online fights follow the host's clock so everyone sees the same moment; skipping to the result needs everyone's vote (the host can skip for all).
- Career dashboard (account menu → 📊 My career): tournaments, titles, fights, boss raids won/lost, team battles, MVP awards, badges (most received first) and rivals, saved to your account (profiles.career) and this device.
- Friends (account menu → 👥 Friends): find players by name or add someone from a room you played in; once they accept, invite them straight into your room. Invites pop up instantly with a Join button. Needs supabase/friends.sql run once.
- Corner calls: up to 5 per fight, with taunt, focus the weakest, transform now and no more holding back alongside the classic calls.
- Body chart under each fighter: an anatomical figure where each area (head, torso, each arm and leg) is coloured by how damaged it is, with fracture marks on injuries, plus overall damage % and the worst-hit area. The corner report lists every area's %.
- Injuries: cracks are drawn as real fractures (bruise, dark split with a lit edge, branches, a chip at the impact) with a bone-crack sound.
- Pre-fight poll: while the comic is drawing, everyone calls the fight (who wins, who falls first, who deals the most damage). In a room everyone sees each other's picks; answers and a mini scoreboard appear when the fight ends.
- Arena conditions: the arena is announced when a match is prepared. Fighters whose elements or fighting style suit it get a ⭐ tag and a real edge in the fight (about +5 percentage points of win chance per fit point in an even matchup), so the recommended pick wins more often, not always.
- Plot twists: about a third of fights get one random story event midway (an intruder attacks everyone, the arena shifts to eclipse/flood/lava/blizzard/storm and favours some elements, a fighter's ultimate gets sealed, a flashback revives a nearly beaten fighter, sudden death drains everyone, or a teammate betrays their side). Each gets a big comic panel and a PLOT TWIST stamp. Rolled on separate dice; engine 2.4.0.
- Roast badges: players earn playful titles from how they bid and play (Wallet Arsonist, Overpaid Clown, Bid Spammer, Last-Second Rat, Eternal Bridesmaid, Professional Spectator, Leftovers Collector, Daylight Robber, Undisputed), shown in the auction economy table, the standings and a Hall of Shame at the end.
- Facts while drawing come from hand-written trivia for built-in characters and from AniList profiles (age, height, birthday, affiliation, story) for everyone else. Finished panels stay face down until the fight plays.
- Settings shows the natural-voice download's progress, errors and a Retry button.
- Sign in from the top-right button (or the home page): email and password, with a one-time confirmation email when the account is created, "Forgot password?" by email, and play-as-guest. Guests can save their account with an email and password and keep their record.
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
- **Illustrated battlegrounds.** Ten arenas (volcano, tundra, storm spire, temple, neon rooftops, moonlit forest, flooded colosseum, desert dunes, ruined capital, grand arena) with animated embers, snow, rain, fireflies and lightning. Each boosts certain elements and some have hazards.
- **Fights without health bars (engine 2.0).** Every attack is an exchange: the defender dodges, blocks (spending guard), parries and counters, throws a technique of their own that clashes head-on, or gets caught clean. Only clean hits wear a fighter down, cause injuries to the arm, leg, ribs or head (each with its own effect) and can knock them down or out. Fights end by knockout, finishing move, stoppage (too injured, or three knockdowns) or the judges, who score clean hits, knockdowns and injuries. The arena shows condition words (Fresh to Barely standing), guard and stamina meters, injury tags and knockdown marks; endurance is never shown as a number.
- **Your corner (engine 2.1).** At big moments the fight pauses and the player gets an injury report (a body chart coloured by how badly each part is hurt, plus guard and stamina in words) and up to 3 calls per fight: go all out, guard up, use the ultimate now, call back / fall back, or send in a benched teammate for one strike. Calls are stored in the battle input, so a battle with calls still replays exactly; the fight is re-simulated from the same seed and is identical up to the corner moment. Computer players make their own calls.
- **Rivalries and duos from the series.** 20 famous rivalries trade lines before the bell, fight 5% harder, and their signature moves collide (Rasengan vs Chidori, Hollow Purple vs Malevolent Shrine, ORA vs MUDA, Excalibur vs Enuma Elish). 17 same-series partnerships unlock named combos (Gogeta's Stardust Breaker, Yin-Yang Release, Brothers' Black Flash). Data in `src/engine/data/rivals.ts`.
- **Sound and voice.** Hits, blocks, clashes, knockdowns and the K.O. bell are synthesized in the browser (Web Audio), and the commentary is read aloud with the browser's speech voice. Both can be toggled on the battle screen; no audio files or services are used.
- **Anime staging and effects (update 5).** A GPU effects layer (PixiJS) draws particles, beams, lightning, slash arcs, shockwaves, speed lines and giant summons, with impact frames (the black-and-white flash), hit-stop, camera zoom on charge-ups and slow motion on knockouts. About 45 iconic moves (Rasengan, Chidori, Kamehameha, Hollow Purple, Malevolent Shrine, Getsuga Tensho, Excalibur vs Enuma Elish, ORA/MUDA...) have their own effect; every other move uses its type's effect. Falls back to the CSS effects if WebGL is unavailable.
- **Living battlefield (update 6).** A fight director (`src/ui/battlefield/director.ts`) turns each finished battle into a script: the weather (rain, thunderstorms, snow, blizzards, wind, fog, ash, ember storms, heatwaves, petals, spirit lights, dust storms) drifts within each arena's climate and bends to strong moves (a lightning ultimate brings a storm, fire dries the rain, ice brings a blizzard); rain pools into puddles and snow settles. Craters, cracks, scorch marks, frost, slash scars and lava glow stay on the ground for the rest of the fight, and every arena has breakable objects (pillars, statues, lanterns, bells, trees, ice spikes, water tanks, neon signs...) that crack, break into rubble and smoke; fighters get thrown into them. The camera pushes in, tilts and letterboxes for big moments, arena hazards strike from the sky, moves light up the arena, and the colosseum crowd jumps on big hits. Every fighter is animated procedurally (dashes, uppercuts, spins, slams, casting, bracing a beam, hit reactions by body area, knockbacks, dodges, knockdowns, get-ups, transformations, victory poses), shaped by archetype, speed and temperament, never repeating the same variant twice in a row. Each built-in also moves like themself (Luffy's punches stretch, Minato and Zenitsu flash-step, Levi spins, Sanji kicks, Jotaro's Stand does the hitting, Saitama barely winds up, the giants slam), and injuries show between moves (limping on a hurt leg, slumping when worn out). Fighters with drawn poses in `public/sprites/` (made offline with `tools/make-sprites.ts` and the local drawing app) play those poses instead. Status effects (burn, bleed, freeze, stun, weaken, haste, focus, regen) show on the fighter. Moves without a hand-made effect get motifs from their own description (clones, petals, chains, gravity, serpents, volleys...). It is all derived from the battle record, so replays and every player in an online room see the same battlefield, and the combat engine is unchanged.
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
