import { PLAYERS } from '../src/engine/data/players';

// Skill calibration used for the added unsold-player scouting inputs:
// tempo = clamp(35 + (SR - 90) * 60 / 80, 10, 95)
// power = clamp(25 + sixes-per-innings * 30, 10, 95)
// consistency = clamp(20 + (T20 average - 10) * 2.3, 10, 95)
// Bowling attack = clamp(80 - (bowling average - 22) * 1.2, 35, 92)
// Bowling control = clamp(92 - (economy - 6.5) * 9, 35, 92)
// Batting inputs in players.ts are T20 career estimates; recent seasons are
// weighted qualitatively in choosing the inputs. vsPace/vsSpin are adjusted
// only when a documented matchup trait exists. Specialist bowling phase scores
// and attributes beyond these formulas remain scouting judgments.
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
export const fromBatting = (average: number, strikeRate: number, sixesPerInnings: number) => ({
  tempo: clamp(35 + (strikeRate - 90) * 60 / 80, 10, 95),
  power: clamp(25 + sixesPerInnings * 30, 10, 95),
  consistency: clamp(20 + (average - 10) * 2.3, 10, 95),
});
export const fromBowling = (average: number, economy: number) => ({
  attack: clamp(80 - (average - 22) * 1.2, 35, 92),
  control: clamp(92 - (economy - 6.5) * 9, 35, 92),
});

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/tools/rate.ts')) {
  const counts = PLAYERS.reduce<Record<string, number>>((out, p) => { out[p.tier] = (out[p.tier] ?? 0) + 1; return out; }, {});
  console.log(`Loaded ${PLAYERS.length} players; tiers: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log('Calibration example (average 30, SR 140, 1.2 sixes/innings):', fromBatting(30, 140, 1.2));
  console.log('This script documents the reproducible batting/bowling calibration; it does not mutate source data.');
}
