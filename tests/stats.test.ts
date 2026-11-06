import { describe, expect, it } from 'vitest';
import { BOARDS, addAuction, addMatch, emptyLab, factsFor, masterKeys, masters, mergeLab, rank, reportFor, type Lab, type MatchFacts, type PlayerRecord, type Row } from '../src/engine/stats';

import { makeGame, runAuction, runTournament } from './helpers';

const fact = (won: boolean, extra: Partial<MatchFacts> = {}): MatchFacts => ({
  won, mode: 'solo', arena: 'ruins', strategy: 'aggressive', mental: 'silent',
  mine: [{ name: 'Gojo', series: 'Jujutsu Kaisen', role: 'MAGE' }], theirs: ['Sukuna'], ...extra,
});
const play = (facts: MatchFacts[], lab: Lab = emptyLab()) => facts.reduce(addMatch, lab);
const record = (extra: Partial<PlayerRecord> = {}): PlayerRecord => ({ tournaments: 0, titles: 0, fights: 0, fightsWon: 0, raids: 0, raidsWon: 0, teamBattles: 0, teamWins: 0, mvps: 0, badges: 0, rivals: {}, lab: emptyLab(), ...extra });
const board = (id: string) => BOARDS.find((b) => b.id === id)!;
const row = (name: string, r: Partial<PlayerRecord>): Row => ({ id: name, name, record: record(r) });

describe('adding to a record', () => {
  it('counts fighters, arenas, modes and foes', () => {
    const l = play([fact(true), fact(false), fact(true)]);
    expect(l.picks.Gojo).toEqual({ w: 2, l: 1, bought: 0, paid: 0 });
    expect(l.arenas.ruins).toEqual({ w: 2, l: 1 });
    expect(l.modes.solo).toEqual({ w: 2, l: 1 });
    expect(l.foes.Sukuna).toEqual({ w: 2, l: 1 });
  });

  it('does not change the record it was given', () => {
    const l = emptyLab();
    addMatch(l, fact(true));
    addAuction(l, [{ name: 'Gojo', price: 900 }]);
    expect(l).toEqual(emptyLab());
  });

  it('counts a series once per match, however many fighters came from it', () => {
    const l = addMatch(emptyLab(), fact(true, { mine: [{ name: 'Gojo', series: 'JJK', role: 'A' }, { name: 'Yuji', series: 'JJK', role: 'B' }] }));
    expect(l.series.JJK).toEqual({ w: 1, l: 0 });
    expect(Object.keys(l.picks)).toHaveLength(2);
  });

  it('tracks streaks through a loss', () => {
    const l = play([fact(true), fact(true), fact(true), fact(false), fact(true)]);
    expect(l.bestStreak).toBe(3);
    expect(l.streak).toBe(1);
  });

  it('records auctions', () => {
    const l = addAuction(emptyLab(), [{ name: 'Gojo', price: 900 }, { name: 'Yuji', price: 300 }]);
    expect(l.spent).toBe(1200);
    expect(l.lots).toBe(2);
    expect(l.biggestBuy).toEqual({ name: 'Gojo', price: 900 });
    expect(l.picks.Gojo.paid).toBe(900);
  });

  it('merges two devices without doubling, keeping both sides\' entries', () => {
    const a = play([fact(true), fact(true)]);
    const b = addAuction(play([fact(true), fact(true), fact(true), fact(false, { arena: 'desert' })]), [{ name: 'Zoro', price: 500 }]);
    const m = mergeLab(a, b);
    expect(m.picks.Gojo.w).toBe(3);
    expect(m.arenas.desert).toEqual({ w: 0, l: 1 });
    expect(m.biggestBuy?.name).toBe('Zoro');
    expect(mergeLab(m, m)).toEqual(m);
  });

  it('merges an old record that has no detail yet', () => {
    expect(mergeLab({} as Lab, play([fact(true)])).picks.Gojo.w).toBe(1);
  });
});

describe('a player report', () => {
  it('says nothing from too few games', () => {
    const r = reportFor(record({ lab: play([fact(true), fact(false)]) }));
    expect(r.good).toEqual([]);
    expect(r.bad).toEqual([]);
    expect(r.bestFighter).toBeNull();
  });

  it('finds what they are good and bad at', () => {
    const lab = play([
      fact(true), fact(true), fact(true), fact(true),
      fact(false, { arena: 'desert', mode: 'tag', strategy: 'defensive' }), fact(false, { arena: 'desert', mode: 'tag', strategy: 'defensive' }), fact(false, { arena: 'desert', mode: 'tag', strategy: 'defensive' }),
    ]);
    const r = reportFor(record({ lab }), (id) => id.toUpperCase());
    expect(r.good.map((x) => x.label)).toContain('1v1 duels');
    expect(r.bad.map((x) => x.label)).toContain('2v2 tag team');
    expect(r.good.map((x) => x.label)).toContain('Fighting in RUINS');
    expect(r.bestArena?.name).toBe('RUINS');
    expect(r.worstArena?.name).toBe('DESERT');
  });

  it('never lists the same thing as both good and bad', () => {
    const r = reportFor(record({ raids: 10, raidsWon: 5, lab: play([fact(true), fact(false), fact(true), fact(false)]) }));
    const good = new Set(r.good.map((x) => x.label));
    for (const x of r.bad) expect(good.has(x.label)).toBe(false);
  });

  it('finds their always-pick, rivalry and best and worst win chance', () => {
    const lab = play([fact(true), fact(true), fact(false), fact(true, { mine: [{ name: 'Yuji', series: 'JJK', role: 'A' }] })]);
    const r = reportFor(record({ lab, rivals: { Mia: { w: 5, l: 5 }, Sam: { w: 3, l: 0 }, Lee: { w: 0, l: 4 }, Once: { w: 1, l: 0 } } }));
    expect(r.alwaysPick?.name).toBe('Gojo');
    expect(r.bestRivalry?.name).toBe('Mia');
    expect(r.bestWinChance?.name).toBe('Sam');
    expect(r.worstWinChance?.name).toBe('Lee');
    expect(r.nemesisFighter?.name).toBe('Sukuna');
  });

  it('copes with a brand new player', () => {
    const r = reportFor(record());
    expect(r.alwaysPick).toBeNull();
    expect(r.bestRivalry).toBeNull();
  });
});

describe('leaderboards', () => {
  it('ranks best first and hides players with nothing', () => {
    const rows = [row('A', { titles: 1 }), row('B', { titles: 4 }), row('C', {})];
    expect(rank(rows, board('titles')).map((x) => x.name)).toEqual(['B', 'A']);
  });

  it('keeps one lucky win off the percentage boards', () => {
    const rows = [row('Lucky', { fights: 1, fightsWon: 1 }), row('Solid', { fights: 20, fightsWon: 15 })];
    const r = rank(rows, board('winrate'));
    expect(r.map((x) => x.name)).toEqual(['Solid']);
    expect(r[0].shown).toBe('75%');
  });

  it('has unique ids and works on a record with no detail', () => {
    expect(new Set(BOARDS.map((b) => b.id)).size).toBe(BOARDS.length);
    const old = row('Old', { fights: 12, fightsWon: 6 });
    (old.record as { lab?: Lab }).lab = undefined;
    for (const b of BOARDS) expect(() => rank([old], b)).not.toThrow();
  });

  it('finds the master of a fighter', () => {
    const rows = [row('A', { lab: play([fact(true), fact(false)]) }), row('B', { lab: play([fact(true), fact(true)]) }), row('C', {})];
    expect(masters(rows, 'picks', 'Gojo').map((x) => x.name)).toEqual(['B', 'A']);
    expect(masterKeys(rows, 'arenas')).toEqual(['ruins']);
  });
});

describe('a real game', () => {
  it('adds up to the tournament it came from', () => {
    const { g, vault } = makeGame(4, 3, 'live', 501);
    runAuction(g);
    const records = runTournament(g, vault, 9);
    const me = g.players[0].id;
    let lab = emptyLab(), won = 0, played = 0;
    for (const rec of records) {
      const f = factsFor(g, rec, me);
      if (!f) continue;
      lab = addMatch(lab, f);
      played++;
      if (f.won) won++;
      expect(f.mine.length).toBeGreaterThan(0);
      expect(f.mine.every((m) => m.series !== 'Unknown')).toBe(true);
      expect(f.theirs.length).toBeGreaterThan(0);
    }
    expect(played).toBeGreaterThan(0);
    const total = (m: Record<string, { w: number; l: number }>) => Object.values(m).reduce((s, x) => s + x.w + x.l, 0);
    expect(total(lab.modes)).toBe(played);
    expect(total(lab.arenas)).toBe(played);
    expect(Object.values(lab.modes).reduce((s, x) => s + x.w, 0)).toBe(won);
    expect(lab.bestStreak).toBeLessThanOrEqual(won);
    expect(factsFor(g, records[0], 'nobody')).toBeNull();
    expect(() => reportFor(record({ lab }))).not.toThrow();
  });
});
