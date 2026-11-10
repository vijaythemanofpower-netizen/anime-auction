// Simulate many T20 matches between auction-built squads and print scoring
// statistics, to tune the engine against real T20 numbers.
// Run: npx vite-node tools/tune.ts [matches=2000]
import { PLAYERS } from '../src/engine/data/players';
import '../src/engine/data/linesInit';
import { autoLineup, createGame, ctxOf, matchSetup } from '../src/engine/game';
import { DIAG, autoPlay } from '../src/engine/match';
DIAG.on = true;
import { simulateAuction } from '../src/store/store';
import { finishAuction } from '../src/engine/auction';

const N = Number(process.argv[2] ?? 2000);
const P = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));
const acc = { first: [] as number[], second: [] as number[], sixes: [] as number[], fours: [] as number[], wkts1: [] as number[], extras: [] as number[], chaseWins: 0, superOvers: 0, rain: 0, econ: [] as number[], bigScores: 0, low: 0, matches: 0, sr: [] as number[], fifties: 0, hundreds: 0, tossBat: 0, highest: 0, drs: 0, sledges: 0, offences: 0, injuries: 0, impact: 0, bonus: 0 };

let seed = 1;
while (acc.matches < N) {
  const humans = [{ id: 'h0', name: 'A', color: '#fff' }];
  let g = createGame({ humans, teamMode: 'solo', npcs: 3, mode: 'standard', timer: 10, mystery: true, realNames: false, seed: seed++ }, PLAYERS, 0);
  const r = simulateAuction(g, 0);
  const fr = finishAuction(ctxOf({ ...g, franchises: r.franchises }, P), r.a, g.poolIds);
  g = { ...g, franchises: fr };
  for (const f of g.franchises) g.lineups[f.id] = autoLineup(f.squad.map((id) => P[id]), g.form);
  const ids = g.franchises.map((f) => f.id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (acc.matches >= N) break;
    const rec = autoPlay(matchSetup(g, P, ids[i], ids[j], seed++));
    acc.matches++;
    const [a, b] = rec.innings;
    if (rec.revised || rec.overs < 20) { acc.rain++; continue; }
    acc.first.push(a.runs); acc.second.push(b.runs); acc.wkts1.push(a.wkts);
    acc.highest = Math.max(acc.highest, a.runs, b.runs);
    if (a.runs >= 220) acc.bigScores++;
    if (a.runs < 130) acc.low++;
    const main = rec.events.filter((e) => e.inn < 2 && e.bowler);
    acc.sixes.push(main.filter((e) => e.runs === 6).length);
    acc.fours.push(main.filter((e) => e.runs === 4).length);
    acc.extras.push(a.extras + b.extras);
    for (const s of [a, b]) for (const bw of s.bowl) if (bw.balls >= 18) acc.econ.push((bw.runs / bw.balls) * 6);
    for (const s of [a, b]) for (const bt of s.bat) { if (bt.balls >= 15) acc.sr.push((bt.runs / bt.balls) * 100); if (bt.runs >= 100) acc.hundreds++; else if (bt.runs >= 50) acc.fifties++; }
    if (rec.outcome?.winner === b.team) acc.chaseWins++;
    if ((rec.outcome?.superOvers ?? 0) > 0) acc.superOvers++;
    if (rec.toss.choice === 'bat') acc.tossBat++;
    acc.drs += rec.events.filter((e) => e.banners.includes('drs')).length;
    acc.sledges += rec.sledges.length; acc.offences += rec.offences.length; acc.injuries += rec.injuries.length; acc.impact += rec.impact.length;
    if (rec.outcome?.bonus) acc.bonus++;
  }
}
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const pct = (xs: number[], p: number) => { const s = xs.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const n = acc.first.length;
console.log(`matches ${acc.matches} (rain-affected ${acc.rain})`);
console.log(`1st innings avg ${avg(acc.first).toFixed(1)}  p10 ${pct(acc.first, 0.1)}  p90 ${pct(acc.first, 0.9)}  wkts ${avg(acc.wkts1).toFixed(1)}  highest ${acc.highest}`);
console.log(`2nd innings avg ${avg(acc.second).toFixed(1)}   chase win ${((acc.chaseWins / n) * 100).toFixed(0)}%   super overs ${((acc.superOvers / n) * 100).toFixed(1)}%`);
console.log(`sixes/match ${avg(acc.sixes).toFixed(1)}  fours/match ${avg(acc.fours).toFixed(1)}  extras/match ${avg(acc.extras).toFixed(1)}`);
console.log(`220+ ${((acc.bigScores / n) * 100).toFixed(0)}%  under 130 ${((acc.low / n) * 100).toFixed(0)}%  econ avg ${avg(acc.econ).toFixed(2)} (p10 ${pct(acc.econ, 0.1).toFixed(1)} p90 ${pct(acc.econ, 0.9).toFixed(1)})  batter SR ${avg(acc.sr).toFixed(0)}`);
console.log(`50s/match ${(acc.fifties / n).toFixed(2)}  100s/match ${(acc.hundreds / n).toFixed(3)}  toss->bat ${((acc.tossBat / n) * 100).toFixed(0)}%  bonus pts ${((acc.bonus / n) * 100).toFixed(0)}%`);
console.log(`per match: DRS ${(acc.drs / n).toFixed(2)}  sledges ${(acc.sledges / n).toFixed(2)}  offences ${(acc.offences / n).toFixed(2)}  injuries ${(acc.injuries / n).toFixed(2)}  impact subs ${(acc.impact / n).toFixed(2)}`);
console.log(`model: edge ${(DIAG.edge / DIAG.n).toFixed(2)}  aggression ${(DIAG.agg / DIAG.n).toFixed(2)}  bat ${(DIAG.bat / DIAG.n).toFixed(1)}  bowl ${(DIAG.bowl / DIAG.n).toFixed(1)}`);
