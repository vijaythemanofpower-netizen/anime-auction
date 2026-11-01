import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/engine/combat/engine';
import { ORIGINAL_CHARACTERS } from '../src/engine/data/originals';
import { generateHidden } from '../src/engine/hidden';
import { ENVIRONMENTS } from '../src/engine/data/world';
import { LEGEND_MOVESETS } from '../src/engine/data/legendMoves';
import { ENGINE_VERSION, type BattleInput, type BattleMode, type BattleRecord, type FighterSnapshot } from '../src/engine/types';
import { CLIP_VARIANTS, buildBattlefield, frameAt, marksAt, propStatesAt, type Clip } from '../src/ui/battlefield/director';
import { CLIMATES, PROPS, ELEMENT_WEATHER } from '../src/ui/battlefield/climate';
import { clipFrames, profileOf } from '../src/ui/battlefield/motion';
import { motifsOf } from '../src/ui/fx/motifs';

function snap(i: number, side: 0 | 1, pos: 'front' | 'back'): FighterSnapshot {
  const c = ORIGINAL_CHARACTERS[i % ORIGINAL_CHARACTERS.length];
  const h = generateHidden(c, 42);
  return {
    charId: c.id + (side ? '#b' : ''), name: c.name + (side ? ' II' : ''), playerId: 'p' + side, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach,
    tags: c.tags, stats: h.stats, traits: h.traits, abilities: [...c.knownAbilities, h.hiddenAbility], position: pos, fatigue: 0, injuries: [], price: 100, vulnerability: h.vulnerability,
  };
}

function record(mode: BattleMode, n: number, seed: number, env: string): BattleRecord {
  const ids = (o: number) => Array.from({ length: n }, (_, j) => (o + j * 5 + seed) % 40);
  const input: BattleInput = {
    battleId: `bf-${env}-${seed}`, engineVersion: ENGINE_VERSION, seed, mode, environmentId: env,
    sides: [
      { playerId: 'p0', strategy: 'balanced', mental: 'silent', fighters: ids(0).map((i, j) => snap(i, 0, j === 0 ? 'front' : 'back')), synergies: [] },
      { playerId: 'p1', strategy: 'aggressive', mental: 'silent', fighters: ids(3).map((i, j) => snap(i, 1, j === 0 ? 'front' : 'back')), synergies: [] },
    ],
    rivalry: null,
  };
  return { battleId: input.battleId, input, result: simulateBattle(input), matchId: null, kind: 'tournament', narration: [], createdAt: 0, postEffects: [] };
}

const RECORDS: BattleRecord[] = [];
for (const env of ENVIRONMENTS) for (const [mode, n, seed] of [['solo', 1, 11], ['tag', 2, 23], ['squad', 3, 37]] as Array<[BattleMode, number, number]>) RECORDS.push(record(mode, n, seed, env.id));

describe('battlefield director', () => {
  it('every arena has a climate and breakable props on both sides', () => {
    for (const env of ENVIRONMENTS) {
      expect(CLIMATES[env.id], env.id).toBeTruthy();
      const props = PROPS[env.id];
      expect(props.some((p) => p.side === 0) && props.some((p) => p.side === 1)).toBe(true);
    }
  });

  it('is a pure function of the record: every viewer and every replay sees the same battlefield', () => {
    for (const r of RECORDS.slice(0, 6)) expect(JSON.stringify(buildBattlefield(r))).toBe(JSON.stringify(buildBattlefield(r)));
  });

  it('has one frame per event and weather that stays within the arena climate or a fighter-caused change', () => {
    const caused = new Set(Object.values(ELEMENT_WEATHER));
    for (const r of RECORDS) {
      const s = buildBattlefield(r);
      expect(s.frames.length).toBe(r.result.events.length);
      const pool = new Set(CLIMATES[r.input.environmentId].pool.map(([k]) => k));
      for (const f of s.frames) {
        expect(pool.has(f.weather.kind) || caused.has(f.weather.kind) || ['storm', 'blizzard', 'ash', 'rain', 'wind'].includes(f.weather.kind)).toBe(true);
        expect(f.weather.intensity).toBeGreaterThanOrEqual(0);
        expect(f.weather.intensity).toBeLessThanOrEqual(1);
        expect(f.weather.wet).toBeGreaterThanOrEqual(0);
        expect(f.weather.snow).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the weather changes during fights', () => {
    const changing = RECORDS.filter((r) => new Set(buildBattlefield(r).frames.map((f) => f.weather.kind)).size > 1);
    expect(changing.length).toBeGreaterThan(RECORDS.length * 0.4);
  });

  it('destruction persists: marks and broken props never disappear as the fight goes on', () => {
    let broken = 0, marks = 0;
    for (const r of RECORDS) {
      const s = buildBattlefield(r);
      let prevIds = new Set<number>();
      let prevStates: Record<string, number> = {};
      for (const e of r.result.events) {
        const m = marksAt(s, e.seq);
        const ids = new Set(m.map((x) => x.id));
        if (m.length < 70) for (const id of prevIds) expect(ids.has(id)).toBe(true);
        prevIds = ids;
        const st = propStatesAt(s, e.seq);
        for (const [id, v] of Object.entries(prevStates)) expect(st[id]).toBeGreaterThanOrEqual(v);
        prevStates = st;
      }
      marks += marksAt(s, Infinity).length;
      broken += Object.values(propStatesAt(s, Infinity)).filter((v) => v === 2).length;
    }
    expect(marks).toBeGreaterThan(RECORDS.length * 3);
    expect(broken).toBeGreaterThan(0);
  });

  it('every strike moves both fighters, and nobody repeats the same move variant twice in a row', () => {
    for (const r of RECORDS) {
      const s = buildBattlefield(r);
      const last = new Map<string, number>();
      r.result.events.forEach((e) => {
        const f = frameAt(s, e.seq)!;
        if ((e.type === 'attack' || e.type === 'counter') && e.actor && !e.context?.environmental) expect(f.motion[e.actor], `${e.type} actor`).toBeTruthy();
        if ((e.type === 'attack' || e.type === 'counter') && e.target && (e.damage ?? 0) > 0) expect(f.motion[e.target]).toBeTruthy();
        for (const [id, m] of Object.entries(f.motion)) {
          const key = `${id}:${m.clip}`;
          if (CLIP_VARIANTS[m.clip] > 1 && last.has(key)) expect(m.variant).not.toBe(last.get(key));
          last.set(key, m.variant);
        }
      });
    }
  });

  it('the camera varies its shots', () => {
    let same = 0, total = 0;
    for (const r of RECORDS) {
      const fr = buildBattlefield(r).frames.filter((f) => f.camera.shot !== 'wide');
      for (let i = 1; i < fr.length; i++) { total++; if (fr[i].camera.shot === fr[i - 1].camera.shot) same++; }
    }
    expect(same / total).toBeLessThan(0.35);
  });
});

describe('character animation', () => {
  const clips = Object.keys(CLIP_VARIANTS).filter((c) => c !== 'idle') as Clip[];
  it('every clip and variant has keyframes for every fighter style', () => {
    const styles = new Set<string>();
    for (const c of ORIGINAL_CHARACTERS) {
      const p = profileOf(snap(ORIGINAL_CHARACTERS.indexOf(c), 0, 'front'));
      styles.add(p.style);
      for (const clip of clips) for (let v = 0; v < CLIP_VARIANTS[clip]; v++) for (const region of ['head', 'body', 'legs'] as const) {
        const f = clipFrames({ clip, variant: v, power: 0.7, region }, p, 1);
        expect(f.dur, `${clip}/${v}`).toBeGreaterThan(0);
        expect(f.body.length).toBeGreaterThanOrEqual(2);
        expect(f.body[0].offset).toBe(0);
        expect(f.body[f.body.length - 1].offset).toBe(1);
      }
    }
    expect(styles.size).toBeGreaterThanOrEqual(4);
  });

  it('faces the opponent: mirrored for the right side', () => {
    const p = profileOf(snap(0, 0, 'front'));
    const a = clipFrames({ clip: 'strike', variant: 0, power: 0.8 }, p, 1).body.map((k) => k.transform);
    const b = clipFrames({ clip: 'strike', variant: 0, power: 0.8 }, p, -1).body.map((k) => k.transform);
    expect(a).not.toEqual(b);
  });
});

describe('move motifs', () => {
  it('most signature moves get their own look, picked the same way every time', () => {
    const moves = Object.values(LEGEND_MOVESETS).flat();
    const withMotif = moves.filter((m) => motifsOf(m).length > 0);
    expect(withMotif.length / moves.length).toBeGreaterThan(0.8);
    const looks = new Set(moves.map((m) => `${m.vfx}:${motifsOf(m).join('+')}`));
    expect(looks.size).toBeGreaterThan(60);
    for (const m of moves.slice(0, 40)) expect(motifsOf(m)).toEqual(motifsOf({ ...m }));
  });
});
