// A fighter's body on the battlefield. The portrait is cut into head, torso and
// base bands that bend independently inside a card that dashes, jumps, recoils
// and falls (Web Animations on the compositor, so it stays smooth). Fast moves
// leave afterimages. If dedicated animation art exists for a character
// (public/sprites/manifest.json, see public/sprites/README.md), its sprite sheet plays
// instead of the procedural rig, clip by clip.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { MotionCue } from './director';
import { clipFrames, type MotionProfile } from './motion';

// ---------------------------------------------------------- sprite sheets

/** A clip is a row of frames on the sheet, or its own picture (`url`, one pose). */
export interface SpriteClip { row?: number; frames?: number; fps?: number; loop?: boolean; url?: string }
export interface SpriteSheet { url: string; frameW: number; frameH: number; clips: Record<string, SpriteClip> }
type Manifest = Record<string, SpriteSheet>;
let manifest: Manifest | null = null;
let loading: Promise<Manifest> | null = null;
const listeners = new Set<() => void>();
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const spriteUrl = (u: string) => (/^(https?:|data:|blob:)/.test(u) ? u : `${BASE}${u.replace(/^\//, '')}`);
const kept: HTMLImageElement[] = [];
function loadManifest(): Promise<Manifest> {
  if (manifest) return Promise.resolve(manifest);
  if (!loading) {
    loading = fetch(`${BASE}sprites/manifest.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m: Manifest) => {
      manifest = m && typeof m === 'object' ? m : {};
      // Preload every sheet and pose once, so nothing loads mid-fight.
      for (const s of Object.values(manifest)) for (const u of new Set([s.url, ...Object.values(s.clips ?? {}).map((c) => c.url)].filter(Boolean) as string[])) { const img = new Image(); img.src = spriteUrl(u); kept.push(img); }
      listeners.forEach((f) => f());
      return manifest;
    });
  }
  return loading;
}

/** The closest pose a sheet has for a moment it has no pose for. */
const ALIAS: Record<string, string[]> = {
  throw: ['strike', 'cast'], beam: ['cast', 'strike'], charge: ['cast'], ultimate: ['cast', 'strike'], powerup: ['cast'], transform: ['cast'],
  knockback: ['hit'], flinch: ['hit'], hurt: ['hit'], stagger: ['hit'], recoil: ['hit'], defeated: ['knockdown', 'hit'], getup: ['knockdown', 'idle'],
  block: ['idle'], parry: ['strike', 'idle'], dodge: ['idle'], clash: ['strike'], dashin: ['strike', 'idle'], taunt: ['victory', 'idle'], recover: ['cast', 'idle'],
};
export function pickClip(sheet: SpriteSheet, clip: string): { name: string; c: SpriteClip } | null {
  for (const n of [clip, ...(ALIAS[clip] ?? []), 'idle']) if (sheet.clips[n]) return { name: n, c: sheet.clips[n] };
  return null;
}
export function useSpriteSheet(charId: string): SpriteSheet | undefined {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); listeners.add(f); void loadManifest(); return () => { listeners.delete(f); }; }, []);
  return manifest?.[charId];
}

function SpriteBody({ sheet, clip, seq, dir, hold }: { sheet: SpriteSheet; clip: string; seq: number; dir: 1 | -1; hold: number }) {
  const el = useRef<HTMLDivElement>(null);
  // An action pose shows for the length of the move, then the fighter settles back into their stance.
  const [showing, setShowing] = useState(clip);
  useEffect(() => {
    setShowing(clip);
    if (clip === 'idle' || clip === 'defeated' || clip === 'knockdown' || clip === 'victory') return;
    const t = setTimeout(() => setShowing('idle'), hold);
    return () => clearTimeout(t);
  }, [seq, clip]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = pickClip(sheet, showing);
  const c = pick?.c;
  useEffect(() => {
    if (!el.current || !c || c.url || !c.frames || c.frames < 2) return;
    const row = c.row ?? 0;
    const a = el.current.animate(
      [{ backgroundPosition: `0px ${-row * sheet.frameH}px` }, { backgroundPosition: `${-c.frames * sheet.frameW}px ${-row * sheet.frameH}px` }],
      { duration: (c.frames / (c.fps ?? 12)) * 1000, easing: `steps(${c.frames})`, iterations: c.loop || pick?.name === 'idle' ? Infinity : 1 },
    );
    return () => a.cancel();
  }, [seq, showing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return null;
  const flip = dir < 0 ? 'scaleX(-1)' : undefined;
  if (c.url) return <img className="rig-sprite-pose" key={c.url} src={spriteUrl(c.url)} alt="" draggable={false} style={{ transform: flip }} />;
  return <div ref={el} className="rig-sprite" style={{ backgroundImage: `url(${spriteUrl(sheet.url)})`, backgroundPosition: `0px ${-(c.row ?? 0) * sheet.frameH}px`, aspectRatio: `${sheet.frameW} / ${sheet.frameH}`, transform: flip }} />;
}

// ------------------------------------------------------------- the rig

export function FighterRig({ art, cue, seq, dir, profile, reduced, speed, sheet, pose = '', rest = 'idle' }: {
  art: ReactNode; cue: MotionCue | undefined; seq: number; dir: 1 | -1; profile: MotionProfile; reduced: boolean; speed: number; sheet?: SpriteSheet;
  /** How the fighter carries their injuries between moves: 'worn', 'limp', 'arm' (space separated). */
  pose?: string;
  /** The pose between moves: 'idle', or 'knockdown' / 'defeated' while on the floor. */
  rest?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const torso = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cue || reduced || !root.current) return;
    const pf = root.current.closest('.pf') as HTMLElement | null;
    if (!pf || typeof pf.animate !== 'function') return;
    const f = clipFrames(cue, profile, dir);
    if (!f.dur || !f.body.length) return;
    // Faster playback shortens moves, but not so much they become a blur.
    const duration = f.dur / Math.sqrt(Math.max(0.5, speed));
    const opts: KeyframeAnimationOptions = { duration, easing: f.easing ?? 'cubic-bezier(.2,.75,.25,1)' };
    const anims: Animation[] = [pf.animate(f.body, opts)];
    if (!sheet) {
      if (f.head && head.current) anims.push(head.current.animate(f.head, opts));
      if (f.torso && torso.current) anims.push(torso.current.animate(f.torso, opts));
      if (f.base && base.current) anims.push(base.current.animate(f.base, opts));
    }
    if (f.ghosts) {
      const ghosts = pf.parentElement?.querySelectorAll<HTMLElement>(':scope > .rig-ghost') ?? [];
      ghosts.forEach((g, i) => {
        const a = 0.42 - i * 0.16;
        const frames = f.body.map((kf, j) => ({ ...kf, opacity: j === 0 || j === f.body.length - 1 ? 0 : a, filter: 'blur(1.5px) saturate(1.4)' }));
        anims.push(g.animate(frames, { ...opts, delay: 40 * (i + 1) }));
      });
    }
    return () => anims.forEach((a) => a.cancel());
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sheet) return <div ref={root} className="rig sprite"><SpriteBody sheet={sheet} clip={cue?.clip ?? rest} seq={seq} dir={dir} hold={Math.max(500, (cue ? clipFrames(cue, profile, dir).dur : 700) / Math.sqrt(Math.max(0.5, speed)))} /></div>;
  return (
    <div ref={root} className={`rig idle-${profile.idle}${reduced ? ' still' : ''}${pose ? pose.split(' ').map((p) => ` pose-${p}`).join('') : ''}`} style={{ ['--tempo' as string]: profile.tempo, ['--dir' as string]: dir } as CSSProperties}>
      <div className="rig-slice base" ref={base}>{art}</div>
      <div className="rig-slice torso" ref={torso}>{art}</div>
      <div className="rig-slice head" ref={head}>{art}</div>
    </div>
  );
}

/** Afterimages that trail behind the card on fast moves (siblings of the card). */
export function RigGhosts({ art }: { art: ReactNode }) {
  return <>{[0, 1].map((i) => <div key={i} className="rig-ghost" aria-hidden="true">{art}</div>)}</>;
}
