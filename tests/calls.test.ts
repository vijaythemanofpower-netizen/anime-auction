import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/engine/combat/engine';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { ABILITIES } from '../src/engine/data/abilities';
import { DUOS, RIVALRIES } from '../src/engine/data/rivals';
import { generateHidden } from '../src/engine/hidden';
import { narrate, validateNarration } from '../src/engine/narration';
import { ENGINE_VERSION, type BattleInput, type BattleMode, type CoachCall, type FighterSnapshot } from '../src/engine/types';

const byKey = (k: string) => LEGEND_CHARACTERS.find((c) => c.id === `legend:${k}`)!;

function snap(key: string, side: 0 | 1, pos: 'front' | 'back'): FighterSnapshot {
  const c = byKey(key);
  const h = generateHidden(c, 7);
  return {
    charId: c.id, name: c.name, playerId: 'p' + side, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach,
    tags: c.tags, stats: h.stats, traits: h.traits, abilities: [...c.knownAbilities, h.hiddenAbility, h.evolution.unlockAbility], position: pos,
    fatigue: 0, injuries: [], price: 500, vulnerability: h.vulnerability,
  };
}

function battle(mode: BattleMode, seed: number, a: string[], b: string[], opts: { coach?: ['human' | 'auto', 'human' | 'auto']; reserves?: [string[], string[]]; calls?: CoachCall[] } = {}): BattleInput {
  const side = (i: 0 | 1, keys: string[]) => ({
    playerId: 'p' + i, strategy: 'balanced' as const, mental: 'silent' as const, synergies: [],
    fighters: keys.map((k, j) => snap(k, i, j === 0 ? 'front' : 'back')),
    coach: opts.coach?.[i] ?? 'human', reserves: (opts.reserves?.[i] ?? []).map((k) => snap(k, i, 'back')),
  });
  return { battleId: 'c' + seed, engineVersion: ENGINE_VERSION, seed, mode, environmentId: 'colosseum', sides: [side(0, a), side(1, b)], rivalry: null, calls: opts.calls ?? [] };
}

const ctx = { prices: {}, playerNames: { p0: 'Alpha', p1: 'Beta' }, previousLoss: {}, stageName: 'Test' };

describe('corner calls', () => {
  it('a call never changes anything before its corner moment', () => {
    let checked = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const base = battle('solo', seed, ['gojo'], ['sukuna'], { reserves: [['yuji'], ['megumi']] });
      const r0 = simulateBattle(base);
      const corner = r0.events.find((e) => e.type === 'corner' && e.context?.side === 0);
      if (!corner) continue;
      for (const kind of ['all_out', 'defend', 'callback', 'reinforce', 'ultimate'] as const) {
        if (!String(corner.context?.options).split(',').includes(kind)) continue;
        const r1 = simulateBattle({ ...base, calls: [{ side: 0, corner: Number(corner.context?.corner), kind }] });
        const prefix = (r: typeof r0) => r.events.slice(0, corner.seq).map((e) => JSON.stringify(e));
        expect(prefix(r1)).toEqual(prefix(r0));
        expect(r1.events[corner.seq].type).toBe('call');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('reinforcements come off the bench once and strike', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const base = battle('solo', seed, ['naruto'], ['luffy'], { reserves: [['kakashi'], []] });
      const r0 = simulateBattle(base);
      const corner = r0.events.find((e) => e.type === 'corner' && e.context?.side === 0 && String(e.context?.options).includes('reinforce'));
      if (!corner) continue;
      const r = simulateBattle({ ...base, calls: [{ side: 0, corner: Number(corner.context?.corner), kind: 'reinforce' }] });
      const rf = r.events.filter((e) => e.type === 'reinforcement');
      expect(rf).toHaveLength(1);
      expect(rf[0].actor).toBe('legend:kakashi');
      expect(r.events.filter((e) => e.type === 'corner' && e.context?.side === 0 && String(e.context?.options).includes('reinforce')).every((e) => e.seq <= corner.seq)).toBe(true);
      expect(validateNarration(narrate(base, r, ctx), base, r)).toEqual([]);
      seen++;
    }
    expect(seen).toBeGreaterThan(3);
  });

  it('callback swaps an injured front fighter out in a tag battle', () => {
    let seen = 0;
    for (let seed = 1; seed <= 25 && !seen; seed++) {
      const base = battle('tag', seed, ['zoro', 'sanji'], ['ichigo', 'byakuya']);
      const corner = simulateBattle(base).events.find((e) => e.type === 'corner' && e.context?.side === 0 && e.actor === 'legend:zoro');
      if (!corner) continue;
      const r = simulateBattle({ ...base, calls: [{ side: 0, corner: Number(corner.context?.corner), kind: 'callback' }] });
      const after = r.events.slice(corner.seq);
      if (after[1]?.type === 'replacement') { expect(after[1].actor).toBe('legend:sanji'); seen++; }
    }
    expect(seen).toBe(1);
  });

  it('computer corners make their own calls, and calls are capped', () => {
    let calls = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = simulateBattle(battle('solo', seed, ['goku'], ['vegeta'], { coach: ['auto', 'auto'], reserves: [['piccolo'], ['gohan']] }));
      const made = r.events.filter((e) => e.type === 'call');
      calls += made.length;
      for (const side of [0, 1]) expect(made.filter((e) => e.context?.side === side).length).toBeLessThanOrEqual(3);
    }
    expect(calls).toBeGreaterThan(5);
  });
});

describe('rivalries and duos from the series', () => {
  it('every rivalry and duo uses real characters and their own moves', () => {
    const ids = new Set(LEGEND_CHARACTERS.map((c) => c.id));
    for (const r of RIVALRIES) {
      expect(ids.has(r.a) && ids.has(r.b)).toBe(true);
      expect(ABILITIES[r.clash[0]]?.owner).toBe(r.a.replace('legend:', ''));
      expect(ABILITIES[r.clash[1]]?.owner).toBe(r.b.replace('legend:', ''));
    }
    for (const d of DUOS) expect(ids.has(d.a) && ids.has(d.b)).toBe(true);
  });

  it('rivals trade words and their signature moves collide', () => {
    let rivalClashes = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const inp = battle('solo', seed, ['naruto'], ['sasuke']);
      const r = simulateBattle(inp);
      expect(r.events.some((e) => e.type === 'rival')).toBe(true);
      rivalClashes += r.events.filter((e) => e.type === 'clash' && e.context?.rival).length;
      if (seed <= 5) expect(validateNarration(narrate(inp, r, ctx), inp, r)).toEqual([]);
    }
    expect(rivalClashes).toBeGreaterThan(0);
  });

  it('partners from the same series unlock their named combo', () => {
    let named = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = simulateBattle(battle('tag', seed, ['goku', 'vegeta'], ['frieza', 'aizen']));
      named += r.events.filter((e) => e.type === 'combo' && String(e.context?.duo).includes('Gogeta')).length;
    }
    expect(named).toBeGreaterThan(0);
  });
});

describe('coach review', () => {
  it('branches only change what happens after the corner', async () => {
    const base = battle('solo', 3, ['gojo'], ['sukuna'], { reserves: [['yuji'], []] });
    const r0 = simulateBattle(base);
    const corner = r0.events.find((e) => e.type === 'corner' && e.context?.side === 0)!;
    const r1 = simulateBattle({ ...base, branch: { side: 0, corner: Number(corner.context?.corner), salt: 9 } });
    expect(r1.events.slice(0, corner.seq).map((e) => JSON.stringify(e))).toEqual(r0.events.slice(0, corner.seq).map((e) => JSON.stringify(e)));
  });

  it('grades each corner call against every option and gives an IQ', async () => {
    const { reviewSide } = await import('../src/engine/review');
    const base = battle('solo', 3, ['gojo'], ['sukuna'], { reserves: [['yuji'], []] });
    const r0 = simulateBattle(base);
    const corner = r0.events.find((e) => e.type === 'corner' && e.context?.side === 0)!;
    const input = { ...base, calls: [{ side: 0 as const, corner: Number(corner.context?.corner), kind: 'all_out' as const }] };
    const record = { battleId: 'x', input, result: simulateBattle(input), matchId: null, kind: 'tournament' as const, narration: [], createdAt: 0, postEffects: [] };
    const rv = reviewSide(record, 0, {}, 4);
    expect(rv.calls.length).toBeGreaterThan(0);
    const first = rv.calls[0];
    expect(first.chosen.kind).toBe('all_out');
    expect(first.options.some((o) => o.reserveId === 'legend:yuji')).toBe(true);
    for (const o of first.options) expect(o.win).toBeGreaterThanOrEqual(0);
    expect(first.best.win).toBeGreaterThanOrEqual(first.chosen.win);
    expect(rv.iq).toBeGreaterThanOrEqual(70);
    expect(rv.iq).toBeLessThanOrEqual(130);
    expect(rv.strategy).not.toBeNull();
  });
});

describe('banter, jump-ins and twists', () => {
  const many = (mode: BattleMode, a: string[], b: string[], extra: Partial<BattleInput> = {}, n = 40) =>
    Array.from({ length: n }, (_, i) => { const inp = { ...battle(mode, 100 + i, a, b, { reserves: [['luffy', 'naruto'], ['vegeta']] }), ...extra }; return { inp, r: simulateBattle(inp) }; });

  it('fighters mock, pump themselves up and react according to their nature', () => {
    const all = many('solo', ['vegeta'], ['naruto']);
    const banter = all.flatMap(({ r }) => r.events.filter((e) => e.type === 'banter'));
    expect(banter.some((e) => e.context?.kind === 'mock')).toBe(true);
    expect(banter.some((e) => e.context?.kind === 'pump')).toBe(true);
    // Naruto is hot-blooded: mocking him fires him up.
    const replies = banter.filter((e) => e.actor === 'legend:naruto' && ['fired', 'ignore', 'rattled'].includes(String(e.context?.kind)));
    for (const e of replies) expect(e.context?.kind).toBe('fired');
    for (const { inp, r } of all.slice(0, 6)) expect(validateNarration(narrate(inp, r, ctx), inp, r)).toEqual([]);
  });

  it('bench fighters ask to jump in, unless told never to', () => {
    const ask = many('tag', ['zoro', 'sanji'], ['ichigo', 'kenpachi']);
    expect(ask.some(({ r }) => r.events.some((e) => e.type === 'corner' && e.context?.reason === 'jump_in'))).toBe(true);
    const never = many('tag', ['zoro', 'sanji'], ['ichigo', 'kenpachi'], {});
    for (const x of never) x.inp.sides[0].jumpIn = { 'legend:luffy': 'never', 'legend:naruto': 'never' };
    for (const { inp } of never) {
      const r = simulateBattle(inp);
      expect(r.events.some((e) => e.type === 'corner' && e.context?.reason === 'jump_in' && e.context?.side === 0)).toBe(false);
    }
    const auto = many('tag', ['zoro', 'sanji'], ['ichigo', 'kenpachi']);
    let jumped = 0;
    for (const { inp } of auto) {
      inp.sides[0].jumpIn = { 'legend:luffy': 'auto', 'legend:naruto': 'auto' };
      jumped += simulateBattle(inp).events.filter((e) => e.type === 'reinforcement' && e.context?.jumped).length;
    }
    expect(jumped).toBeGreaterThan(0);
  });

  it('twists happen only when the situation calls for them', () => {
    const all = [...many('tag', ['goku', 'vegeta'], ['frieza', 'aizen']), ...many('solo', ['luffy'], ['zoro'])];
    const twists = all.flatMap(({ r }) => r.events.filter((e) => e.type === 'twist'));
    expect(twists.length).toBeGreaterThan(0);
    for (const { r } of all) {
      const keys = r.events.filter((e) => e.type === 'twist').map((e) => `${e.context?.twist}:${e.actor ?? ''}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
