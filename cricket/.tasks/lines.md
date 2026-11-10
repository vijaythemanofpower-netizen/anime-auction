# Task: write commentary and sledging lines for Cricket Auction

Work in `C:\Users\vamsi\Cricket Auction`. Do NOT run git. Overwrite exactly ONE file: `src/engine/data/lines.ts` (it currently holds an empty placeholder). Touch nothing else (except the result note at the end).

The file exports plain string arrays. Placeholders in braces are replaced by the game: `{bat}` batter name, `{bowl}` bowler name, `{fld}` fielder name, `{team}` batting team, `{opp}` bowling team, `{runs}` a number, `{need}` runs needed, `{balls}` balls left, `{score}` e.g. "142/4". Use only the placeholders listed for each array.

```ts
export const LINES = {
  dot: [...],          // {bat} {bowl}  — 25 lines: beaten outside off, solid block, swing and a miss...
  single: [...],       // {bat} {bowl}  — 20 lines
  two: [...],          // {bat} {fld}   — 12 lines
  three: [...],        // {bat}         — 6 lines
  four: [...],         // {bat} {bowl}  — 30 lines, excited, varied shots (cover drive, pull, late cut, edge past slip...)
  six: [...],          // {bat} {bowl}  — 30 lines, very excited, varied (over long-on, into the stands, onto the roof...)
  wide: [...],         // {bowl}        — 8
  noball: [...],       // {bowl}        — 6, mention the free hit coming
  freehit: [...],      // {bat}         — 5, before the free-hit ball
  bowled: [...],       // {bat} {bowl}  — 12
  caught: [...],       // {bat} {bowl} {fld} — 18
  caughtBehind: [...], // {bat} {bowl} {fld} — 8
  lbw: [...],          // {bat} {bowl}  — 10
  runout: [...],       // {bat} {fld}   — 8
  stumped: [...],      // {bat} {bowl} {fld} — 6
  dropped: [...],      // {bat} {fld}   — 10, catch put down
  fifty: [...],        // {bat} {balls} — 8 ({balls} = balls faced)
  hundred: [...],      // {bat} {balls} — 6
  hatTrickBall: [...], // {bowl}        — 5, the crowd on its feet before a hat-trick ball
  hatTrick: [...],     // {bowl}        — 5
  lastOver: [...],     // {need} {balls} {team} — 8, tension before the last over
  chaseWon: [...],     // {team} — 8
  defended: [...],     // {opp} — 8 ({opp} is the team that defended)
  tie: [...],          // none — 5, heading to a super over
  newBatter: [...],    // {bat} — 10
  milestoneWickets: [...], // {bowl} — 5, a bowler takes his third wicket
  rain: [...],         // none — 6
  drsOut: [...],       // {bat} — 5, review upholds out
  drsOverturned: [...],// {bat} — 5, decision overturned
  umpiresCall: [...],  // {bat} — 5, stays with the umpire's call
  injury: [...],       // {bat} — 5 generic "is down, physio is on" lines; any player
  // Sledging (playful, cheeky, like friends' banter; NOTHING abusive, nothing about family, religion, region,
  // country, race, appearance, or bodies. Cricket-only jabs: "you couldn't hit that with a door", "the sightscreen
  // is that way" etc.)
  sledgeLight: [...],  // spoken lines — 15, a light chirp, written as the spoken line in quotes, e.g. "\"Is that bat on loan?\""
  sledgeStare: [...],  // {bowl} {bat} — 8 narrated stare-downs (third person, e.g. "{bowl} stops at the end of his follow-through and just stares at {bat}.")
  sledgeHeavy: [...],  // spoken lines — 12, cheekier but still friendly-safe
  sledgeCalm: [...],   // {bat} — 8, the batter ignores it entirely
  sledgeFired: [...],  // {bat} {bowl} — 8, the batter is rattled and fires back
  sledgeBackfire: [...], // {bat} {bowl} — 8, the batter answers with a boundary, bowler embarrassed
  taunt: [...],        // spoken lines by a batter after hitting a six — 10, cheeky
  refereeWarn: [...],  // {opp} — 4, referee warns the team
  refereeFine: [...],  // {opp} — 4, match fee fine
  refereeBan: [...],   // {bowl} — 3, a player is banned next match
} as const;
export type LineKey = keyof typeof LINES;
```

Style: British/Indian TV commentary, energetic, short (max ~110 characters), no real broadcaster catchphrases, no brand names, no real-world league names (no "IPL"). Variety matters: no two lines in the same array should start with the same three words. Use straight quotes; escape quotes inside strings correctly.

When done, run `npx tsc --noEmit -p .` if possible and fix errors in your file only. Then write a one-paragraph summary (line counts per key) to `.tasks/lines.result.md`.
