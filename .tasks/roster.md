# Task: write the Cricket Auction player roster (2026 season squads)

You are working in the repository `C:\Users\vamsi\Cricket Auction` (React + TypeScript game). Do NOT run git commands, do not commit. Do not touch any file except `src/engine/data/players.ts` (create it) and the result note below.

`src/engine/data/players.ts` must compile against `src/engine/types.ts` (read it first; the `Cricketer` interface is the contract):

```ts
import type { Cricketer } from '../types';
export const PLAYERS: Cricketer[] = [ ... ];
```

## Who
EVERY player in `.tasks/squads2026.csv` (262 rows: the 10 franchise squads of the 2026 season after the December 2025 auction, plus 12 in-season replacement signings). One entry per row, no extra players, no missing players. The CSV's `role`, `country` and `capped` columns are filled only where a source stated them; fill the blanks from your own knowledge of the player. If you genuinely don't know an obscure uncapped domestic player, give a sensible modest profile (tier 1, base 20-30) in the role their name is best known for, and list those names in the result note.

Do NOT store the franchise name anywhere in the file (the game uses made-up franchises).

## Fields
- `id`: kebab-case of the alike name, unique (e.g. `v-kohly`).
- `name`: a playful NAME-ALIKE, recognisable but altered: initial + tweaked surname, e.g. "V. Kohly", "R. Sharmaa", "J. Bumrar", "H. Klaasan", "R. Khaan". Never insulting, never a pun on religion, region, family, or appearance. Must differ from the real spelling. Avoid two alikes that are identical.
- `realName`: the real full name, spelled as in the CSV.
- `country`: 'IND' | 'AUS' | 'ENG' | 'SA' | 'NZ' | 'WI' | 'AFG' | 'SL' | 'BAN' | 'ZIM'. `overseas` = country !== 'IND'.
- `uncapped`: true if the player had not played international cricket for his country by the 2026 season (CSV capped=N means uncapped). Uncapped players get `potential` 45-90 (higher for young standouts such as teenagers who starred); nobody else has `potential`.
- `role`: 'opener' | 'middle' | 'finisher' | 'keeper' | 'allrounder' | 'pace' | 'spin'. Batters split by their usual batting position; keeper = anyone who usually keeps; allrounder = bats AND bowls regularly; pace/spin = specialist bowlers.
- `bats`: real batting hand. `bowl`: real style ('none' for players who don't bowl; 'fast' 140+ kph, 'fastmed', 'medium', 'offspin', 'legspin', 'slaorth' = left-arm orthodox, 'slachina' = left-arm wrist spin).
- `bat`: 0-100 ratings reflecting real T20 strengths (the game's own estimates, never exact real figures). Elite batters 85-95 in their best area; tail-end bowlers 10-30. `tempo` = strike-rate tendency (anchors ~60-70, hitters 85-95). `power` = six-hitting. `consistency` = getting out rarely. Make `vsPace` and `vsSpin` differ where the player has a known strength or weakness.
- `bowling`: for every player whose `bowl !== 'none'`: attack, control, powerplay (new-ball skill), death, speed (kph, e.g. 145 fast, 133 fastmed, 125 medium, 0 for spinners). Elite bowlers 85-95, part-timers 35-55. Omit `bowling` when `bowl === 'none'`.
- `fielding` 40-95; `keeping` (50-95) ONLY for role 'keeper'.
- `temper`: 'calm' | 'steady' | 'fiery' following the on-field persona (roughly 30% fiery, 35% calm).
- `clutch` 30-95, `captaincy` 20-95 (proven captains high).
- `tier`: 5 superstar (~15 players), 4 star (~40), 3 solid (~70), 2 squad (~70), 1 filler (rest, most obscure uncapped).
- `basePrice` in lakh: tier5 200, tier4 150, tier3 100, tier2 50, tier1 30; uncapped tier1 may be 20 or 30.
- `age`: approximate age in 2026.

Write compact one-line-per-player objects, grouped by role with a short comment per group, and a 3-line header saying the ratings are the game's own estimates, not real statistics, and that names are deliberate name-alikes.

## Check
Write a quick node or python check (in your head or a throwaway script outside src) that every CSV realName appears exactly once and ids are unique. Run `npx tsc --noEmit -p .` if it works in your sandbox and fix errors in your file only (ignore unrelated errors in other files). Then write `.tasks/roster.result.md`: counts per role, overseas, uncapped, tiers, and the list of players you weren't sure about.
