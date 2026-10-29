import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/engine/combat/engine';
import { ORIGINAL_CHARACTERS } from '../src/engine/data/originals';
import { generateHidden } from '../src/engine/hidden';
import { getAbility } from '../src/engine/data/abilities';
import { ENGINE_VERSION, type BattleInput, type BattleMode, type FighterSnapshot, type MentalApproach, type Strategy } from '../src/engine/types';
import { Rng } from '../src/engine/rng';
import { narrate, validateNarration } from '../src/engine/narration';

function snap(i: number, side: 0 | 1, pos: 'front' | 'back', over: Partial<FighterSnapshot> = {}): FighterSnapshot {
  const c = ORIGINAL_CHARACTERS[i % ORIGINAL_CHARACTERS.length];
  const h = generateHidden(c, 42);
  return {
    charId: c.id + (side ? '#b' : ''), name: c.name + (side ? ' II' : ''), playerId: 'p' + side, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach,
    tags: c.tags, stats: h.stats, traits: h.traits, abilities: [...c.knownAbilities, h.hiddenAbility], position: pos, fatigue: 0, injuries: [], price: 100 * (i + 1), vulnerability: h.vulnerability, ...over,
  };
}

function input(mode: BattleMode, seed: number, idsA: number[], idsB: number[], opts: { env?: string; strat?: [Strategy, Strategy]; mental?: [MentalApproach, MentalApproach] } = {}): BattleInput {
  return {
    battleId: 'b' + seed, engineVersion: ENGINE_VERSION, seed, mode, environmentId: opts.env ?? 'colosseum',
    sides: [
      { playerId: 'p0', strategy: opts.strat?.[0] ?? 'balanced', mental: opts.mental?.[0] ?? 'silent', fighters: idsA.map((i, j) => snap(i, 0, j === 0 ? 'front' : 'back')), synergies: [] },
      { playerId: 'p1', strategy: opts.strat?.[1] ?? 'balanced', mental: opts.mental?.[1] ?? 'silent', fighters: idsB.map((i, j) => snap(i, 1, j === 0 ? 'front' : 'back')), synergies: [] },
    ],
    rivalry: null,
  };
}

const modes: Array<[BattleMode, number]> = [['solo', 1], ['tag', 2], ['squad', 3], ['squad', 4]];

describe('combat engine', () => {
  it('identical seed and inputs reproduce identical results', () => {
    for (const [mode, n] of modes) {
      const inp = input(mode, 777, [0, 5, 10, 15].slice(0, n), [20, 25, 30, 35].slice(0, n));
      const a = simulateBattle(inp), b = simulateBattle(inp);
      expect(a.hash).toBe(b.hash);
      expect(a.events).toEqual(b.events);
      expect(a.winnerSide).toBe(b.winnerSide);
    }
  });

  it('fresh seeds produce different event sequences', () => {
    const hashes = new Set<string>();
    for (let s = 0; s < 10; s++) hashes.add(simulateBattle(input('solo', 1000 + s, [3], [8])).hash);
    expect(hashes.size).toBeGreaterThan(5);
  });

  it('rematches can produce different winners', () => {
    const winners = new Set<number>();
    for (let s = 0; s < 40; s++) winners.add(simulateBattle(input('solo', s, [1], [16])).winnerSide);
    expect(winners.size).toBe(2);
  });

  it('keeps health and stamina within limits and the log agrees with the final state', () => {
    const rng = new Rng(5);
    for (let k = 0; k < 120; k++) {
      const [mode, n] = modes[k % modes.length];
      const ids = rng.shuffle([...Array(40).keys()]);
      const inp = input(mode, k, ids.slice(0, n), ids.slice(n, 2 * n), { env: ['volcano', 'storm', 'tundra', 'forest', 'ocean', 'temple'][k % 6] });
      const r = simulateBattle(inp);
      const lastHp = new Map<string, number>();
      for (const e of r.events) {
        for (const v of [e.hpBefore, e.hpAfter]) if (v !== undefined) expect(v).toBeGreaterThanOrEqual(0);
        if (e.damage !== undefined) expect(e.damage).toBeGreaterThanOrEqual(1);
        if (e.target && e.hpAfter !== undefined) lastHp.set(e.target, e.hpAfter);
        if (e.actor && e.hpAfter !== undefined && e.type === 'awakening') lastHp.set(e.actor, e.hpAfter);
      }
      for (const f of r.fighters) {
        expect(f.hp).toBeGreaterThanOrEqual(0);
        expect(f.hp).toBeLessThanOrEqual(f.maxHp);
        expect(f.stamina).toBeGreaterThanOrEqual(0);
        expect(f.stamina).toBeLessThanOrEqual(f.maxStamina);
        if (lastHp.has(f.charId)) expect(lastHp.get(f.charId)).toBe(f.hp);
        // Fighters go down by knockout, stoppage or collapse, not only at zero endurance.
        if (f.hp === 0) expect(f.defeated).toBe(true);
        expect(f.defeated).toBe(!!f.howDown);
      }
      // Winner agrees with log
      const losers = r.fighters.filter((f) => f.side !== r.winnerSide);
      if (r.decision !== 'judges') expect(losers.every((f) => f.defeated)).toBe(true);
      expect(r.fighters.filter((f) => f.side === r.winnerSide).some((f) => !f.defeated)).toBe(true);
      const verdict = r.events[r.events.length - 1];
      expect(verdict.type).toBe('verdict');
      expect(verdict.context?.winnerSide).toBe(r.winnerSide);
    }
  });

  it('defeated fighters never act again', () => {
    for (let s = 0; s < 60; s++) {
      const r = simulateBattle(input('squad', s, [0, 1, 2], [3, 4, 5]));
      const dead = new Set<string>();
      for (const e of r.events) {
        if (e.actor && dead.has(e.actor) && !['defeat'].includes(e.type)) throw new Error(`defeated ${e.actor} acted: ${e.type}`);
        if (e.type === 'defeat' && e.target) dead.add(e.target);
      }
    }
  });

  it('respects ability cooldowns', () => {
    for (let s = 0; s < 30; s++) {
      const r = simulateBattle(input('tag', s, [6, 7], [11, 12]));
      const lastUse = new Map<string, number>();
      const actions = new Map<string, number>();
      for (const e of r.events) {
        if (!e.actor) continue;
        if (['attack', 'ability', 'desperation', 'guard', 'recover', 'protect', 'miss', 'block', 'status', 'combo', 'replacement'].includes(e.type)) {
          // count actor turns approximately by turn number
        }
        if ((e.type === 'ability' || e.type === 'desperation') && e.ability) {
          const key = e.actor + e.ability;
          const prev = lastUse.get(key);
          if (prev !== undefined) {
            const cd = getAbility(e.ability).cooldown;
            // at least `cd` other events-turns must have passed for that actor
            expect(e.turn - prev).toBeGreaterThanOrEqual(cd);
          }
          lastUse.set(key, e.turn);
          actions.set(e.actor, (actions.get(e.actor) ?? 0) + 1);
        }
      }
    }
  });

  it('fatigue and injuries reduce effectiveness', () => {
    let freshWins = 0, tiredWins = 0;
    for (let s = 0; s < 80; s++) {
      const base = input('solo', s, [2], [2]);
      const tired = structuredClone(base);
      tired.sides[1].fighters[0].fatigue = 90;
      tired.sides[1].fighters[0].injuries = [{ id: 'x', name: 'Fractured Arm', stat: 'attack', penalty: 0.12, matchesRemaining: 1 }];
      if (simulateBattle(base).winnerSide === 1) freshWins++;
      if (simulateBattle(tired).winnerSide === 1) tiredWins++;
    }
    expect(tiredWins).toBeLessThan(freshWins);
  });

  it('strategy choices change behaviour', () => {
    // Defensive play shows as guarding and blocking, per exchange faced.
    const rate = (strat: Strategy) => {
      let defend = 0, faced = 0;
      const me = ORIGINAL_CHARACTERS[12].id;
      for (let s = 0; s < 30; s++) {
        const r = simulateBattle(input('solo', s, [12], [22], { strat: [strat, 'balanced'] }));
        for (const e of r.events) {
          if (e.type === 'guard' && e.actor === me) defend++;
          if (e.response && (e.target === me || (e.type === 'parry' && e.actor === me))) { faced++; if (e.response === 'block') defend++; }
        }
      }
      return defend / faced;
    };
    expect(rate('defensive')).toBeGreaterThan(rate('aggressive'));
  });

  it('taunting a hot-blooded fighter backfires', () => {
    const hot = ORIGINAL_CHARACTERS.findIndex((c) => c.temperament === 'hot-blooded' && !generateHidden(c, 42).traits.includes('Short Fuse'));
    const r = simulateBattle(input('solo', 3, [0], [hot], { mental: ['taunt', 'analyze'] }));
    const pre = r.events.find((e) => e.type === 'prebattle' && e.action === 'taunt');
    expect(pre?.context?.backfire).toBe(true);
  });

  it('environments with hazards emit environmental events by rule', () => {
    let envEvents = 0;
    for (let s = 0; s < 30; s++) envEvents += simulateBattle(input('squad', s, [0, 1, 2], [5, 6, 7], { env: 'storm' })).events.filter((e) => e.type === 'environment').length;
    expect(envEvents).toBeGreaterThan(0);
    let neutral = 0;
    for (let s = 0; s < 30; s++) neutral += simulateBattle(input('squad', s, [0, 1, 2], [5, 6, 7], { env: 'colosseum' })).events.filter((e) => e.type === 'environment').length;
    expect(neutral).toBe(0);
  });

  it('team modes use real team mechanics', () => {
    const types = new Set<string>();
    for (let s = 0; s < 60; s++) for (const e of simulateBattle(input('tag', s, [20, 21], [26, 27])).events) types.add(e.type);
    expect(types.has('assist') || types.has('combo') || types.has('protect')).toBe(true);
    // Squad: melee fighters can only hit frontline while it stands
    for (let s = 0; s < 30; s++) {
      const inp = input('squad', s, [0, 2, 26], [1, 3, 4]);
      const r = simulateBattle(inp);
      const positions = new Map(inp.sides.flatMap((x) => x.fighters).map((f) => [f.charId, f.position]));
      const reach = new Map(inp.sides.flatMap((x) => x.fighters).map((f) => [f.charId, f]));
      for (const e of r.events) {
        if (e.type === 'replacement' && e.actor) positions.set(e.actor, 'front');
        if (e.type === 'replacement' && e.action === 'tag' && e.target) positions.set(e.target, 'back');
        if (e.type === 'attack' && e.action === 'strike' && e.actor && e.target) {
          const att = reach.get(e.actor)!;
          if (att.reach === 'melee' && att.archetype !== 'Assassin') {
            const side = reach.get(e.target)!.side;
            const frontAlive = [...positions.entries()].some(([id, p]) => p === 'front' && reach.get(id)!.side === side && !r.events.some((x) => x.type === 'defeat' && x.target === id && x.seq < e.seq));
            if (frontAlive && positions.get(e.target) === 'back') {
              // protected-intercepts redirect to guardians, which are frontline-or-back allies; allow if an intercept happened just before
              const prev = r.events[e.seq - 2];
              expect(prev?.type === 'protect' && prev.action === 'intercept').toBe(true);
            }
          }
        }
      }
    }
  });

  it('narration is grounded in verified events', () => {
    for (let s = 0; s < 25; s++) {
      const inp = input(modes[s % 4][0], s, [0, 1, 2, 3].slice(0, modes[s % 4][1]), [4, 5, 6, 7].slice(0, modes[s % 4][1]));
      const r = simulateBattle(inp);
      const lines = narrate(inp, r, { prices: {}, playerNames: { p0: 'Alpha', p1: 'Beta' }, previousLoss: {}, stageName: 'Test' });
      expect(lines.length).toBeGreaterThan(5);
      expect(validateNarration(lines, inp, r)).toEqual([]);
      // deterministic
      expect(narrate(inp, r, { prices: {}, playerNames: { p0: 'Alpha', p1: 'Beta' }, previousLoss: {}, stageName: 'Test' })).toEqual(lines);
    }
  });

  it('validator rejects fabricated narration', () => {
    const inp = input('solo', 1, [0], [1]);
    const r = simulateBattle(inp);
    const atk = r.events.find((e) => e.type === 'attack')!;
    const bad = [{ eventId: atk.id, seq: atk.seq, speaker: 'narrator', text: `A massive 99999 damage blow!`, tone: 'hype' as const }, { eventId: 'nope', seq: 0, speaker: 'narrator', text: 'x', tone: 'calm' as const }];
    expect(validateNarration(bad, inp, r).length).toBe(2);
  });

  it('rejects replays from a different engine version', () => {
    const inp = { ...input('solo', 1, [0], [1]), engineVersion: '0.0.1' };
    expect(() => simulateBattle(inp)).toThrow();
  });

  describe('exchanges instead of health bars', () => {
    const inputs = Array.from({ length: 60 }, (_, k) => {
      const [mode, n] = modes[k % modes.length];
      return input(mode, 500 + k, [k % 40, (k + 5) % 40, (k + 9) % 40, (k + 13) % 40].slice(0, n), [(k + 20) % 40, (k + 25) % 40, (k + 29) % 40, (k + 33) % 40].slice(0, n));
    });
    const battles = inputs.map((inp) => simulateBattle(inp));
    const all = battles.flatMap((r) => r.events);

    it('every attack is met with a defense response', () => {
      for (const e of all) if (e.type === 'attack' && !e.context?.environmental) expect(['clean', 'clash', 'block', 'dodge', 'parry']).toContain(e.response);
      const kinds = new Set(all.map((e) => e.type));
      for (const t of ['block', 'miss', 'parry', 'clash', 'injury', 'knockdown', 'guard_break'] as const) expect(kinds.has(t)).toBe(true);
    });

    it('fighters are knocked out before their endurance runs dry', () => {
      const early = battles.flatMap((r) => r.fighters).filter((f) => f.howDown === 'knockout' || f.howDown === 'finisher');
      expect(early.length).toBeGreaterThan(0);
      expect(early.some((f) => f.hp > 0)).toBe(true);
    });

    it('injuries are tracked per body part and three knockdowns stop the fight (unless a second wind)', () => {
      for (const r of battles) for (const f of r.fighters) {
        expect(new Set(f.injuries.map((i) => i.part)).size).toBe(f.injuries.length);
        const sw = r.events.some((e) => e.type === 'twist' && e.context?.twist === 'secondwind' && e.actor === f.charId);
        expect(f.knockdowns).toBeLessThanOrEqual(sw ? 4 : 3);
        if (f.knockdowns === (sw ? 4 : 3)) expect(f.howDown).toBe('stoppage');
      }
    });

    it('commentary never quotes health numbers', () => {
      battles.slice(0, 12).forEach((r, i) => {
        const lines = narrate(inputs[i], r, { prices: {}, playerNames: { p0: 'Alpha', p1: 'Beta' }, previousLoss: {}, stageName: 'Test' });
        expect(validateNarration(lines, inputs[i], r)).toEqual([]);
        for (const l of lines) expect(l.text).not.toMatch(/HP/);
      });
      for (const e of all) expect(e.explanation).not.toMatch(/HP/);
    });
  });
});
