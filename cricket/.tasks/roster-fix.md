# Task: rewrite the roster BY HAND (second pass)

Work in `C:\Users\vamsi\Cricket Auction`. Do NOT run git. Only edit `src/engine/data/players.ts` and write `.tasks/roster-fix.result.md`.

Your first version of `src/engine/data/players.ts` was generated with formulas and templates, and it shows:
- Name-alikes made by swapping the last letter for "a" ("K. Rahua", "R. Gaikwaa", "P. Shaa", "M. Shora"). These read as typos, not as fun name-alikes.
- Ratings copied between players of the same tier (Matthew Short and Prithvi Shaw have identical stats; KL Rahul and Ruturaj Gaikwad too). Matthew Short is an aggressive hitter but got tempo 69.

Redo the whole file. Keep the same 262 players (`.tasks/squads2026.csv`), the same `Cricketer` contract (`src/engine/types.ts`), and the rules in `.tasks/roster.md`, plus:

1. **Do not use a script, formula, template or tier table to create ratings or names.** Write every player's line yourself, one by one, from what you know about that cricketer's real T20 game. A throwaway script is allowed ONLY for checking (counts, duplicates, CSV coverage), never for generating values.
2. **Name-alikes** should sound like a cheeky nickname a commentator might use, recognisable at a glance, and varied in how they change the name. Good examples: "V. Kohly", "R. Sharmaa", "J. Bumrar", "H. Klaasan", "R. Khaan", "S. Yaadav", "T. Heady", "P. Cummings", "MS Dhony", "Y. Jaiswall", "R. Pantt", "S. Narain", "N. Pooraan", "J. Buttlar", "K. Rabadaa". Vary the change: doubled letter, swapped vowel, softened ending, playful suffix. Never a word that mocks the person. Two players must never share an alike.
3. **Ratings must differ between players** and follow their real reputation. Examples of what we expect (illustrative, use your own judgement):
   - Travis Head / Abhishek Sharma: tempo 92-96, power 88-92, consistency ~65.
   - Virat Kohli: vsPace ~88, vsSpin ~85, tempo ~78, power ~74, consistency ~92, captaincy ~70.
   - Heinrich Klaasen: vsSpin 95, vsPace 84, tempo 93, power 94.
   - Jasprit Bumrah: attack 96, control 95, death 97, powerplay 90, speed 145; batting 15-20.
   - Rashid Khan: legspin, attack 92, control 92, death 80, batting power ~72.
   - Sunil Narine: offspin, control 93, attack 85, and as an opener tempo ~95, power ~85, consistency ~45.
   - MS Dhoni: keeper, power ~82 vs pace, tempo ~85, consistency lower now (~60), captaincy 98, clutch 95, calm.
   - Matthew Short: tempo ~88. Prithvi Shaw: tempo ~85, consistency ~45.
   - Teenage or obscure uncapped players: modest skill (40-65) but honest potential.
4. Spread across the scale: about 15 players at 90+ in their best skill, most regulars 60-85, fringe players 40-60, tail-end batting 10-30.
5. Keep roles honest: Hardik Pandya, Axar Patel, Ravindra Jadeja, Washington Sundar, Marcus Stoinis, Marco Jansen, Sam Curran, Cameron Green etc. are all-rounders with real bowling skills; keepers include Pant, Samson, Kishan, Buttler, Klaasen, Pooran, Jurel, Rickelton, de Kock, Inglis, Salt, Jitesh, Porel, Prabhsimran, Dhoni (choose one role per player).

Check: 262 entries, every CSV realName once, unique ids and names, `npx tsc --noEmit -p .` clean for this file. Write `.tasks/roster-fix.result.md` with counts per role/tier and 10 sample lines.
