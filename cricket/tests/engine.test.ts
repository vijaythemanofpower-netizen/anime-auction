import { describe, expect, it } from 'vitest';
import { PLAYERS } from '../src/engine/data/players';
import { autoLineup, createGame, ctxOf, lineupProblems, matchSetup, type GameState } from '../src/engine/game';
import { autoPlay, playMatch, withDefaults, type MatchRecord } from '../src/engine/match';
import { canBuy, counts, needs, penaltyFill, RULES, slotsNeeded } from '../src/engine/squad';
import { closeIfDue, finishAuction } from '../src/engine/auction';
import { simulateAuction } from '../src/store/store';
import type { Cricketer } from '../src/engine/types';

const P: Record<string, Cricketer> = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));
const human = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, name: `P${i}`, color: '#fff' }));

function auctioned(seed: number, teamMode: 'solo' | 'boss' = 'solo', humans = 1, npcs = 1): GameState {
  let g = createGame({ humans: human(humans), teamMode, npcs, mode: 'standard', timer: 10, mystery: true, realNames: false, seed }, PLAYERS, 0);
  const r = simulateAuction(g, 0);
  g = { ...g, franchises: finishAuction(ctxOf({ ...g, franchises: r.franchises }, P), r.a, g.poolIds) };
  for (const f of g.franchises) g.lineups[f.id] = autoLineup(f.squad.map((id) => P[id]), g.form);
  return g;
}

/** Answer every decision with its default until the match ends. */
function playOut(setup: Parameters<typeof playMatch>[0]): { rec: MatchRecord; asked: number } {
  let answers: Record<string, string> = {};
  let rec = playMatch(setup, answers);
  let asked = 0;
  for (let i = 0; i < 400 && rec.pending?.length; i++) { asked += rec.pending.length; answers = withDefaults(rec, answers); rec = playMatch(setup, answers); }
  return { rec, asked };
}

describe('roster', () => {
  it('has unique ids and valid players', () => {
    expect(new Set(PLAYERS.map((p) => p.id)).size).toBe(PLAYERS.length);
    expect(new Set(PLAYERS.map((p) => p.name)).size).toBe(PLAYERS.length);
    for (const p of PLAYERS) {
      expect(p.overseas).toBe(p.country !== 'IND');
      expect((p.bowl === 'none') === !p.bowling).toBe(true);
      if (p.role === 'pace' || p.role === 'spin') expect(p.bowling).toBeDefined();
    }
  });
});

describe('squad rules', () => {
  const r = RULES.standard;
  const keepers = PLAYERS.filter((p) => p.role === 'keeper' && !p.overseas);
  const overseas = PLAYERS.filter((p) => p.overseas && p.role !== 'keeper');
  it('blocks a sixth overseas player', () => {
    const squad = overseas.slice(0, 5);
    expect(canBuy(squad, 10000, overseas[5], 100, r)?.reason).toMatch(/Overseas/);
  });
  it('blocks a pick that leaves no room for compulsory slots', () => {
    const squad: Cricketer[] = [];
    let blocked = false;
    for (const k of keepers) { if (canBuy(squad, 10000, k, 30, r)) { blocked = true; break; } squad.push(k); }
    expect(blocked).toBe(true);
    expect(slotsNeeded(squad, r)).toBeLessThanOrEqual(r.size - squad.length);
  });
  it('keeps enough purse for empty slots', () => {
    expect(canBuy([], 300, keepers[0], 290, r)?.reason).toMatch(/Keep/);
  });
  it('fills empty compulsory slots at double price', () => {
    const fill = penaltyFill([], PLAYERS.filter((p) => p.tier <= 3), r);
    const squad = fill.map((f) => P[f.id]);
    expect(squad.length).toBe(r.size);
    expect(needs(squad, r)).toEqual([]);
    expect(fill.filter((f) => f.doubled).every((f) => f.price === Math.max(r.minPrice, P[f.id].basePrice) * 2)).toBe(true);
  });
});

describe('auction', () => {
  it('does not sell an overseas mystery player past the squad cap', () => {
    const g = createGame({ humans: human(1), teamMode: 'solo', npcs: 1, mode: 'standard', timer: 10, mystery: true, realNames: false, seed: 42 }, PLAYERS, 0);
    const f = g.franchises[0];
    const overseas = PLAYERS.filter((p) => p.overseas && p.role !== 'keeper');
    const squad = overseas.slice(0, RULES.standard.maxOverseas).map((p) => p.id);
    const lot = overseas[RULES.standard.maxOverseas];
    const ctx = ctxOf({ ...g, franchises: [{ ...f, squad, purse: 5000 }, ...g.franchises.slice(1)] }, P);
    const auction = {
      queue: [], index: 0,
      live: { lot: { id: lot.id, set: 'Mystery' as const, base: 100, mystery: true }, bid: 100, bidder: f.id, endsAt: 1000, history: [], startedAt: 0 },
      sold: [], unsold: [], returned: [], done: false, timer: 10, extension: 5, gapUntil: 0,
    };
    const result = closeIfDue(ctx, auction, 1000);
    expect(result.franchises.find((x) => x.id === f.id)?.squad).toEqual(squad);
    expect(result.a.unsold).toEqual([lot.id]);
    expect(result.a.last?.to).toBeNull();
  });

  it('ends with legal squads for every franchise', () => {
    const g = auctioned(11, 'solo', 1, 3);
    for (const f of g.franchises) {
      const sq = f.squad.map((id) => P[id]);
      expect(sq.length).toBe(13);
      expect(counts(sq).overseas).toBeLessThanOrEqual(5);
      expect(needs(sq, RULES.standard)).toEqual([]);
      expect(lineupProblems(g.lineups[f.id], P)).toEqual([]);
    }
    const all = g.franchises.flatMap((f) => f.squad);
    expect(new Set(all).size).toBe(all.length);
  });
  it('1v4 Boss: four humans share one franchise against a richer NPC', () => {
    const g = createGame({ humans: human(4), teamMode: 'boss', npcs: 0, mode: 'standard', timer: 10, mystery: false, realNames: false, seed: 5 }, PLAYERS, 0);
    expect(g.franchises).toHaveLength(2);
    expect(g.franchises[0].owners).toHaveLength(4);
    expect(g.franchises[1].boss).toBe(true);
    expect(g.franchises[1].startPurse).toBe(g.franchises[0].startPurse * 2.5);
    expect(new Set(Object.values(g.roles).flat()).size).toBe(4);
  });
});

describe('match engine', () => {
  const g = auctioned(21);
  const [a, b] = g.franchises;
  it('is deterministic', () => {
    const s = matchSetup(g, P, a.id, b.id, 99);
    expect(JSON.stringify(autoPlay(s))).toBe(JSON.stringify(autoPlay(s)));
  });
  it('produces a sane full match with a result', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rec = autoPlay(matchSetup(g, P, a.id, b.id, seed));
      expect(rec.outcome).toBeDefined();
      for (const inn of rec.innings.slice(0, 2)) {
        expect(inn.wkts).toBeLessThanOrEqual(10);
        expect(inn.balls).toBeLessThanOrEqual(inn.overs * 6);
        for (const bw of inn.bowl) expect(bw.balls).toBeLessThanOrEqual(Math.ceil(rec.overs / 5) * 6);
      }
    }
  });
  it('asks human captains and finishes when every call takes its default', () => {
    const s = matchSetup(g, P, a.id, b.id, 7);
    const { rec, asked } = playOut(s);
    expect(asked).toBeGreaterThan(3);
    expect(rec.outcome).toBeDefined();
  });
  it('earlier balls never change when a later decision is answered', () => {
    const s = matchSetup(g, P, a.id, b.id, 8);
    const first = playMatch(s, {});
    const n = first.events.length;
    const second = playMatch(s, withDefaults(first, {}));
    expect(JSON.stringify(second.events.slice(0, n))).toBe(JSON.stringify(first.events));
  });
});
