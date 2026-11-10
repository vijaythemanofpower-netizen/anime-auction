# Task: research real T20 stats for one batch of cricketers

Work only inside this folder. Do NOT run git. Do NOT edit any file except the one output file named below. Use web search (ESPNcricinfo / Cricbuzz / IPLT20 player pages, Wikipedia as fallback).

Input: the batch list file given in the prompt (`.tasks/stats/list-N.txt`), one player per line: `realName|country|role|bowl|bats`.

Output: `.tasks/stats/batch-N.csv` (same N), one row per input player, in the same order, with this exact header:

name,role,bowl,bats,t20_inns,bat_avg,bat_sr,sixes_per_inn,vs_spin,vs_pace,t20_overs_bowled,econ,bowl_sr,pp_skill,death_skill,speed_kmh,keeper,source

- Numbers are T20 career figures (all T20s incl. IPL and franchise leagues); if a player's last 3 seasons are clearly different, use the recent level and mention "recent" in source.
- `role`, `bowl`, `bats`: correct the input if it is wrong (role: opener|middle|finisher|keeper|allrounder|pace|spin; bowl: none|fast|fastmed|medium|offspin|legspin|slaorth|slachina; bats: R|L).
- `vs_spin`, `vs_pace`: one of `strong`, `normal`, `weak` (known strength or weakness; default normal).
- `pp_skill`, `death_skill`: bowlers only, one of `elite`, `good`, `average`, `poor` (powerplay and death-over reputation); empty for non-bowlers.
- `speed_kmh`: typical speed for pace bowlers; 0 for spinners; empty for non-bowlers.
- `keeper`: yes if they keep wicket regularly.
- Batting columns empty for genuine tail-enders with almost no batting; bowling columns empty for players who do not bowl.
- If you cannot find any T20 data for a player, fill name/role/bowl/bats and put `no data` in source.
- `source`: the page URL you used (one is enough).

Do every player in the batch. Do not stop early; if a lookup fails, mark `no data` and continue.
