# Rating generation result

Generated 317 name-keyed ratings from the seven research CSVs, including 53 explicit modest fallback entries for supplemental unsold players without CSV rows. Correction batches are loaded last, so their entries replace earlier rows for the same player. Two supplied research names (Sahil Parakh and Tejasvi Singh Dahiya) are not in the 315-player game roster; every roster player has a rating.

## Formula

- Batting average maps linearly through 10 → 25, 25 → 60, 35 → 80, and 45 → 92 consistency. Strike rate maps through 70 → 15, 100 → 40, 130 → 68, 150 → 85, and 170 → 95 tempo. Sixes per innings map through 0 → 22, 0.2 → 30, 1.0 → 70, and 1.8 → 92 power.
- Batting dimensions shrink toward consistency 32, tempo 48, and power 35 with reliability `innings / (innings + 20)`. Rows marked `no data` get modest values (24/38/24); bowlers with no batting sample get tail-end values (22/22/20), without being treated as no-data. Matchup skills start at the mean of consistency and tempo; strong adds 6, weak subtracts 8.
- With more than 20 bowling overs, control maps economy 6.5/7.5/8.5/10 to 90/78/62/40, and attack maps bowling strike rate 14/18/22/28 to 92/78/62/45. Both shrink toward 45 by `overs / (overs + 20)`. Phase words map elite/good/average/poor to 90/78/64/48, shrink toward 45, then blend 65% word score with 35% control. Lower samples use modest ratings. Spin speed is 0; pace speed is clamped to 110–160 km/h.
- Keepers receive 60–92 keeping skill based on batting consistency. Overall value averages batting skills with tempo and consistency weighted twice, averages bowling skills, uses bowling value for pace/spin specialists and batting value for batters/keepers (keepers get +2); all-rounders blend batting and bowling 55/45. Rank-based tiers use 15/40/90/90/rest; only rows whose `source` is `no data` are excluded from ranking and stay tier 1.
- Batting sanity ranking uses the mean of the five batting skills. Bowling ranking uses the mean of attack, control, powerplay, and death.

## Top 10 batters

| Player | Mean batting rating |
|---|---:|
| Mitchell Marsh | 83 |
| Suryakumar Yadav | 82 |
| Finn Allen | 81 |
| Jos Buttler | 81 |
| Tim David | 81 |
| Heinrich Klaasen | 80 |
| Nicholas Pooran | 79 |
| Abhishek Sharma | 78 |
| Naman Dhir | 78 |
| Phil Salt | 78 |

## Top 10 bowlers

| Player | Mean bowling rating |
|---|---:|
| Rashid Khan | 85 |
| Jasprit Bumrah | 83 |
| Wanindu Hasaranga | 81 |
| Sunil Narine | 79 |
| Kuldeep Yadav | 78 |
| Mitchell Starc | 78 |
| Bhuvneshwar Kumar | 77 |
| Akeal Hosein | 76 |
| Axar Patel | 75 |
| Fazalhaq Farooqi | 75 |

## Game roster tier counts (315 players)

| Tier | Count |
|---|---:|
| 1 | 80 |
| 2 | 90 |
| 3 | 90 |
| 4 | 40 |
| 5 | 15 |

## Checks

- `node tools/rate.mjs`: passed, generated 317 ratings.
- `node tools/check-roster.mjs`: passed with no issues. A temporary Node preload was used to teach the CommonJS-based checker to resolve and transpile the new `ratings.ts` import; the checker itself was left unchanged.
- `npx tsc --noEmit -p .`: passed.

## Rank-based tiers (Nov 10, 2026)

The 315-player game roster is ranked by the revised role-specific overall value: 15 players in tier 5, the next 40 in tier 4, the next 90 in tier 3, the next 90 in tier 2, and the remaining 80 in tier 1. Only rows marked `no data` in the CSV `source` column stay out of the ranking and remain tier 1. Ties are ordered by player name for deterministic assignment.

| Tier | Count |
|---|---:|
| 1 | 80 |
| 2 | 90 |
| 3 | 90 |
| 4 | 40 |
| 5 | 15 |

Tier 5: Abhishek Sharma, Bhuvneshwar Kumar, Finn Allen, Heinrich Klaasen, Jasprit Bumrah, Jos Buttler, KL Rahul, Kuldeep Yadav, Mitchell Starc, Naman Dhir, Nicholas Pooran, Phil Salt, Rashid Khan, Suryakumar Yadav, Tim David.

Tier 4: Adam Milne, Akeal Hosein, Anrich Nortje, Arshdeep Singh, Ben Dwarshuis, David Miller, Devon Conway, Fazalhaq Farooqi, Ishan Kishan, Jofra Archer, Jonny Bairstow, Jordan Cox, Josh Hazlewood, Josh Inglis, Lockie Ferguson, MS Dhoni, Mitchell Marsh, Mohsin Khan, Mujeeb Ur Rahman, Mustafizur Rahman, Nathan Ellis, Noor Ahmad, Prabhsimran Singh, Quinton de Kock, Ravi Bishnoi, Rishabh Pant, Rohit Sharma, Ruturaj Gaikwad, Ryan Rickelton, Sandeep Sharma, Sanju Samson, Shashank Singh, Shimron Hetmyer, Taskin Ahmed, Tilak Varma, Tim Seifert, Travis Head, Tristan Stubbs, Virat Kohli, Yashasvi Jaiswal.

- `node tools/rate.mjs`: passed, generated 317 ratings.
- `node tools/check-roster.mjs`: passed with 315 players and no issues (using a temporary preload to resolve the checker's CommonJS/TypeScript import).
- `npx tsc --noEmit -p .`: passed.
