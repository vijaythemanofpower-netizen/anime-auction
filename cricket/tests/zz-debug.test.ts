import { it } from 'vitest';
import { PLAYERS } from '../src/engine/data/players';
import { autoLineup, createGame, ctxOf, matchSetup } from '../src/engine/game';
import { autoPlay } from '../src/engine/match';
import { finishAuction } from '../src/engine/auction';
import { simulateAuction } from '../src/store/store';
const P = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));
it('dbg', () => {
  let g = createGame({ humans: [{ id: 'h0', name: 'a', color: '' }], teamMode: 'solo', npcs: 1, mode: 'standard', timer: 10, mystery: true, realNames: false, seed: 21 }, PLAYERS, 0);
  const r = simulateAuction(g, 0);
  g = { ...g, franchises: finishAuction(ctxOf({ ...g, franchises: r.franchises }, P), r.a, g.poolIds) };
  for (const f of g.franchises) g.lineups[f.id] = autoLineup(f.squad.map((id) => P[id]), g.form);
  for (let seed = 1; seed <= 30; seed++) {
    const rec = autoPlay(matchSetup(g, P, g.franchises[0].id, g.franchises[1].id, seed));
    for (const inn of rec.innings.slice(0, 2)) for (const bw of inn.bowl) if (bw.balls > 24) {
      console.log(seed, rec.overs, bw.id, bw.balls, rec.events.filter((e) => e.notes.length || !e.bowler).map((e) => e.text + e.notes.join('|')).join('\n'));
      console.log(rec.events.filter((e) => e.bowler === bw.id && !e.extra).map((e) => `${e.inn}:${e.over}.${e.ball}`).join(' '));
    }
  }
});
