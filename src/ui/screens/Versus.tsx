// The 2D Arena: pick fighters from everyone who has animated clips and watch them fight on
// the stage (FightStage), outside any auction or tournament. Nothing here touches a saved
// game: the fight gets its own temporary game, handed to the battle screen through
// BattleOverride. The normal game keeps its card fights.
import { useMemo, useState, type CSSProperties } from 'react';
import type { BattleInput, BattleRecord, GameState, PublicCharacter } from '../../engine/types';
import { ENGINE_VERSION } from '../../engine/types';
import { LEGEND_CHARACTERS } from '../../engine/data/legends';
import { VILLAINS } from '../../engine/data/villains';
import { ENVIRONMENTS } from '../../engine/data/world';
import { generateHidden } from '../../engine/hidden';
import { simulateBattle } from '../../engine/combat/engine';
import { freshSeed } from '../../engine/rng';
import { clipFor, clipUrl, stageReady, useFighterClips, type FighterClips } from '../battlefield/fighterClips';
import { rigBase, rigReady, useRigIndex } from '../rig/rigIndex';
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const rigBasePath = (index: ReturnType<typeof useRigIndex>, id: string) => rigBase(index, id, 0);
import { BattleOverride, BattleView } from './Battle';
import { Seg } from '../components/common';

const EVERYONE: PublicCharacter[] = [...LEGEND_CHARACTERS, ...VILLAINS];
const SIDE_COLORS = ['#38bdf8', '#f43f5e'] as const;

/** A fighter's stance, playing frame by frame (for the roster tiles). */
function IdlePreview({ clips, rig, h = 120 }: { clips: FighterClips | undefined; rig?: string; h?: number }) {
  if (rig) return <img className="vs-idle" src={`${BASE}${rig.replace(/^\//, '')}art.webp`} alt="" style={{ height: h, maxWidth: '100%', objectFit: 'contain' }} />;
  const c = clipFor(clips, 0, 'idle');
  if (!c) return null;
  const w = (h * c.frameW) / c.frameH;
  return (
    <div className="vs-idle" style={{
      width: w, height: h, backgroundImage: `url(${clipUrl(c.url)})`, backgroundSize: `${c.frames * w}px ${h}px`,
      ['--w' as string]: `${w}px`, ['--n' as string]: c.frames, animationDuration: `${c.frames / c.fps}s`, animationTimingFunction: `steps(${c.frames})`,
    } as CSSProperties} />
  );
}

export function Versus() {
  const clips = useFighterClips();
  const rigs = useRigIndex();
  const [size, setSize] = useState<1 | 2 | 3>(1);
  const [sides, setSides] = useState<[string[], string[]]>([[], []]);
  const [active, setActive] = useState<0 | 1>(0);
  const [env, setEnv] = useState<string>('random');
  const [q, setQ] = useState('');
  const [record, setRecord] = useState<BattleRecord | null>(null);

  const ready = useMemo(() => EVERYONE.filter((c) => stageReady(clips?.[c.id]) || rigReady(rigs, c.id)), [clips, rigs]);
  const shown = ready.filter((c) => !q.trim() || `${c.name} ${c.series}`.toLowerCase().includes(q.trim().toLowerCase()));
  const byId = (id: string) => EVERYONE.find((c) => c.id === id)!;

  const pick = (id: string) => setSides((s) => {
    const next: [string[], string[]] = [s[0].filter((x) => x !== id), s[1].filter((x) => x !== id)];
    const mine = next[active];
    next[active] = mine.length < size ? [...mine, id] : [...mine.slice(1), id];
    return next;
  });
  const resize = (n: 1 | 2 | 3) => { setSize(n); setSides((s) => [s[0].slice(0, n), s[1].slice(0, n)]); };
  const randomize = () => {
    const pool = ready.slice().sort(() => Math.random() - 0.5);
    setSides([pool.slice(0, size).map((c) => c.id), pool.slice(size, size * 2).map((c) => c.id)]);
  };
  const full = sides[0].length === size && sides[1].length === size;

  const fight = () => {
    if (!full) return;
    const secret = freshSeed();
    const players = (['Left team', 'Right team'] as const).map((name, i) => ({ id: `vs-${i}`, name }));
    const snap = (id: string, side: 0 | 1, k: number) => {
      const c = byId(id);
      const h = generateHidden(c, secret);
      return {
        charId: c.id, name: c.name, playerId: players[side].id, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach, tags: c.tags,
        stats: h.stats, traits: h.traits, abilities: [...c.knownAbilities, h.hiddenAbility, h.evolution.unlockAbility],
        position: (size === 3 ? k < 2 : k < 1) ? 'front' as const : 'back' as const, fatigue: 0, injuries: [], price: 500, vulnerability: h.vulnerability,
      };
    };
    const input: BattleInput = {
      battleId: `versus-${secret}`, engineVersion: ENGINE_VERSION, seed: secret, mode: size === 1 ? 'solo' : size === 2 ? 'tag' : 'squad',
      environmentId: env === 'random' ? ENVIRONMENTS[secret % ENVIRONMENTS.length].id : env,
      sides: ([0, 1] as const).map((i) => ({ playerId: players[i].id, strategy: 'balanced' as const, mental: 'silent' as const, synergies: [], fighters: sides[i].map((id, k) => snap(id, i, k)), coach: 'auto' as const, reserves: [] })) as unknown as BattleInput['sides'],
      rivalry: null, calls: [],
    };
    setRecord({ battleId: input.battleId, kind: 'versus', input, result: simulateBattle(input), narration: [], postEffects: [] } as unknown as BattleRecord);
  };

  // The fight itself, with a temporary game so the saved game is never touched.
  const game = useMemo(() => record && ({
    id: 'versus', phase: 'battle', players: record.input.sides.map((s, i) => ({ id: s.playerId, name: i ? 'Right team' : 'Left team', color: SIDE_COLORS[i], emblem: i ? '◆' : '●', kind: 'human', coins: 0, roster: s.fighters.map((f) => f.charId) })),
    characters: Object.fromEntries(record.input.sides.flatMap((s) => s.fighters).map((f) => [f.charId, byId(f.charId)])),
  } as unknown as GameState), [record]); // eslint-disable-line react-hooks/exhaustive-deps

  if (record && game) {
    return (
      <BattleOverride.Provider value={{ game, onClose: () => setRecord(null) }}>
        <BattleView record={record} exhibition />
      </BattleOverride.Provider>
    );
  }

  return (
    <div className="col arena2d" style={{ gap: 16 }}>
      <div className="section-head">
        <div>
          <div className="eyebrow">2D Arena · {ready.length} of {EVERYONE.length} fighters animated</div>
          <h1>2D Arena</h1>
          <p className="muted" style={{ margin: 0 }}>Animated fighters on the stage: they run in, strike, take hits and fall for real. Pick both sides and watch. Auctions and tournaments keep the card fights.</p>
        </div>
      </div>
      {clips && ready.length < EVERYONE.length && (
        <div className="panel faint" style={{ fontSize: 13 }}>
          {ready.length ? `${EVERYONE.length - ready.length} more fighters are still being animated; they join this list as they finish.` : 'No fighters are animated yet. They join this list as they finish.'}
        </div>
      )}

      <div className="vs-setup panel col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="field"><span className="label">Fight</span><Seg value={size} onChange={resize} label="Fighters per side" options={[{ v: 1, label: '1 v 1' }, { v: 2, label: '2 v 2' }, { v: 3, label: '3 v 3' }]} /></div>
          <div className="field"><label className="label" htmlFor="vs-env">Arena</label>
            <select id="vs-env" className="input" value={env} onChange={(e) => setEnv(e.target.value)}>
              <option value="random">Random arena</option>
              {ENVIRONMENTS.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <button className="btn ghost" onClick={randomize} disabled={ready.length < size * 2}>🎲 Random fighters</button>
        </div>
        <div className="vs-sides">
          {([0, 1] as const).map((side) => (
            <button key={side} type="button" className={`vs-side${active === side ? ' active' : ''}`} style={{ ['--sc' as string]: SIDE_COLORS[side] } as CSSProperties} onClick={() => setActive(side)} aria-pressed={active === side}>
              <span className="label">{side ? 'Right team' : 'Left team'}{active === side ? ' · picking' : ''}</span>
              <span className="vs-picks">
                {Array.from({ length: size }, (_, k) => {
                  const id = sides[side][k];
                  return <span key={k} className="vs-slot">{id ? <><IdlePreview clips={clips?.[id]} rig={rigBasePath(rigs, id)} h={84} /><small>{byId(id).name}</small></> : <small className="faint">Empty</small>}</span>;
                })}
              </span>
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary lg" disabled={!full} onClick={fight}>⚔ Fight!</button>
        </div>
      </div>

      <div className="panel col" style={{ gap: 10 }}>
        <input className="input" placeholder="Search fighters or series" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search fighters" />
        <div className="vs-roster">
          {shown.map((c) => {
            const side = sides[0].includes(c.id) ? 0 : sides[1].includes(c.id) ? 1 : -1;
            return (
              <button key={c.id} type="button" className={`vs-tile${side >= 0 ? ' picked' : ''}`} style={side === 0 || side === 1 ? { ['--sc' as string]: SIDE_COLORS[side] } as CSSProperties : undefined} onClick={() => pick(c.id)} aria-pressed={side >= 0}>
                <IdlePreview clips={clips?.[c.id]} rig={rigBasePath(rigs, c.id)} />
                <b>{c.name}</b>
                <span className="faint">{c.series}</span>
              </button>
            );
          })}
          {!shown.length && <p className="faint">{clips ? 'No animated fighters match.' : 'Loading fighters…'}</p>}
        </div>
      </div>
    </div>
  );
}
