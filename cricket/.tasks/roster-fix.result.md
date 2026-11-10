# Roster fix result

## Checks

- Entries: 262; CSV rows: 262.
- CSV coverage: every CSV `player` appears once; no missing or extra players.
- Duplicate real names, IDs, and display names: 0.
- `npx tsc --noEmit -p .`: passed.
- Overseas: 83; uncapped: 47.

## Counts

| Role | Count |
| --- | ---: |
| Opener | 26 |
| Middle | 39 |
| Finisher | 26 |
| Keeper | 27 |
| All-rounder | 38 |
| Pace | 81 |
| Spin | 25 |

| Tier | Count |
| --- | ---: |
| 1 | 46 |
| 2 | 14 |
| 3 | 122 |
| 4 | 63 |
| 5 | 17 |

## Sample lines

```text
R. Gaikwadd (Ruturaj Gaikwad): opener, tier 4, bat 83/87/78/75/89
A. Mhatra (Ayush Mhatre): opener, tier 2, bat 54/53/56/45/59
M. Shorty (Matthew Short): opener, tier 3, bat 80/76/88/83/66
K. Rahool (KL Rahul): opener, tier 4, bat 86/81/71/76/87
P. Shaww (Prithvi Shaw): opener, tier 2, bat 75/70/85/74/45
B. Ducketa (Ben Duckett): opener, tier 4, bat 84/80/83/72/86
P. Nissanky (Pathum Nissanka): opener, tier 4, bat 84/80/83/72/86
S. Gila (Shubman Gill): opener, tier 5, bat 93/89/92/81/95
S. Sudharsaa (Sai Sudharsan): opener, tier 4, bat 81/80/83/72/86
T. Bantoa (Tom Banton): opener, tier 3, bat 70/66/69/58/72
```

## Remaining work

This pass is incomplete. I revised the example profiles for Ruturaj Gaikwad, Matthew Short, KL Rahul, Prithvi Shaw, Virat Kohli, Travis Head, Abhishek Sharma, MS Dhoni, Heinrich Klaasen, Jasprit Bumrah, Rashid Khan, and Sunil Narine. The rest of `players.ts` still needs the requested hand rewrite: many generated-looking name-alikes and repeated or inaccurate ratings remain. I have not established a reliable full list of uncertain uncapped players.
