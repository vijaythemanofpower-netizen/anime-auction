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

export interface SpriteClip { row: number; frames: number; fps: number; loop?: boolean }
export interface SpriteSheet { url: string; frameW: number; frameH: number; clips: Record<string, SpriteClip> }
type Manifest = Record<string, SpriteSheet>;
let manifest: Manifest | null = null;
let loading: Promise<Manifest> | null = null;
const listeners = new Set<() => void>();
function loadManifest(): Promise<Manifest> {
  if (manifest) return Promise.resolve(manifest);
  if (!loading) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    loading = fetch(`${base}sprites/manifest.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m: Manifest) => {
      manifest = m;
      // Preload every sheet once so nothing loads mid-fight.
      for (const s of Object.values(m)) { const img = new Image(); img.src = s.url.startsWith('http') ? s.url : `${base}${s.url.replace(/^\//, '')}`; }
      listeners.forEach((f) => f());
      return m;
    });
  }
  return loading;
}
export function useSpriteSheet(charId: string): SpriteSheet | undefined {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); listeners.add(f); void loadManifest(); return () => { listeners.delete(f); }; }, []);
  return manifest?.[charId];
}

function SpriteBody({ sheet, clip, seq }: { sheet: SpriteSheet; clip: string; seq: number }) {
  const el = useRef<HTMLDivElement>(null);
  const c = sheet.clips[clip] ?? sheet.clips.idle;
  useEffect(() => {
    if (!el.current || !c) return;
    const a = el.current.animate(
      [{ backgroundPosition: `0px ${-c.row * sheet.frameH}px` }, { backgroundPosition: `${-c.frames * sheet.frameW}px ${-c.row * sheet.frameH}px` }],
      { duration: (c.frames / c.fps) * 1000, easing: `steps(${c.frames})`, iterations: c.loop || clip === 'idle' ? Infinity : 1 },
    );
    return () => a.cancel();
  }, [seq, clip]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={el} className="rig-sprite" style={{ backgroundImage: `url(${sheet.url})`, aspectRatio: `${sheet.frameW} / ${sheet.frameH}` }} />;
}

// ------------------------------------------------------------- the rig

export function FighterRig({ art, cue, seq, dir, profile, reduced, speed, sheet }: {
  art: ReactNode; cue: MotionCue | undefined; seq: number; dir: 1 | -1; profile: MotionProfile; reduced: boolean; speed: number; sheet?: SpriteSheet;
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

  if (sheet) return <div ref={root} className="rig sprite"><SpriteBody sheet={sheet} clip={cue?.clip ?? 'idle'} seq={seq} /></div>;
  return (
    <div ref={root} className={`rig idle-${profile.idle}${reduced ? ' still' : ''}`} style={{ ['--tempo' as string]: profile.tempo } as CSSProperties}>
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
