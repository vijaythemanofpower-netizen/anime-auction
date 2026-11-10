# Task: verify the most important player stats, then regenerate ratings

Work only inside this folder. Do NOT run git. Use web search.

The research CSVs in `.tasks/stats/` contain some wrong numbers (e.g. Ravindra Jadeja shows 260 T20 overs bowled; the real figure is far higher) and some weak sources (a betting site for Naman Dhir).

1. Make a list of the 120 most important players: everyone currently tier 3, 4 or 5 in `src/engine/data/ratings.ts` (pick by tier then by overall value until you have 120), plus Shubman Gill, Hardik Pandya, Ravindra Jadeja, Axar Patel, Rinku Singh, Shreyas Iyer if not already in.
2. For each, check the row against the player's ESPNcricinfo profile (T20 career "T20s" column; Cricbuzz if ESPNcricinfo fails). Never use betting, fantasy or odds sites. Correct any wrong number (innings, average, strike rate, sixes per innings computed as sixes/innings, overs bowled, economy, bowling strike rate) and set the source to the ESPNcricinfo/Cricbuzz URL. Write the corrected rows to `.tasks/stats/batch-verified.csv` (same header); `tools/rate.mjs` must load it LAST so it overrides earlier rows. Log every change (player, field, old, new) in `.tasks/verify.result.md`.
3. In `tools/rate.mjs`, make small samples count less: batting reliability innings/(innings+60) instead of /(innings+20); bowling reliability overs/(overs+80). Change nothing else.
4. Run `node tools/rate.mjs`, the roster check, and `npx tsc --noEmit -p .`. Append to `.tasks/verify.result.md` the new tier counts and the full tier-5 and tier-4 lists.
