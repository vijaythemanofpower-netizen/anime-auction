// Animated fighter clips (public/fighters/manifest.json, made by tools/make-fighters.ts):
// for each built-in, per form ('base', '1', '2', '3'), a transparent strip of frames per
// move (idle, run, strike, special, hit, knockdown). The fight stage plays them.
import { useEffect, useState } from 'react';

export interface FighterClip { url: string; frames: number; fps: number; loop: boolean; frameW: number; frameH: number; ax: number; ay: number }
export interface FighterClips { states: Record<string, Partial<Record<ClipName, FighterClip>>> }
export type ClipName = 'idle' | 'run' | 'strike' | 'special' | 'hit' | 'knockdown';

type Manifest = Record<string, FighterClips>;
let manifest: Manifest | null = null;
let loading: Promise<Manifest> | null = null;
const listeners = new Set<() => void>();
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const clipUrl = (u: string) => `${BASE}${u.replace(/^\//, '')}`;

function load(): Promise<Manifest> {
  if (manifest) return Promise.resolve(manifest);
  loading ??= fetch(`${BASE}fighters/manifest.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m: Manifest) => {
    manifest = m && typeof m === 'object' ? m : {};
    listeners.forEach((f) => f());
    return manifest;
  });
  return loading;
}

/** The clip manifest (null while it loads). */
export function useFighterClips(): Manifest | null {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); listeners.add(f); void load(); return () => { listeners.delete(f); }; }, []);
  return manifest;
}

/** What to fall back to when a form has no clip for a move. */
const ALIAS: Record<ClipName, ClipName[]> = { idle: [], run: ['idle'], strike: ['special', 'idle'], special: ['strike', 'idle'], hit: ['idle'], knockdown: ['hit', 'idle'] };

/** A fighter's clip for a move in their current form: the form's own clip, else the base form's. */
export function clipFor(c: FighterClips | undefined, stage: number, name: ClipName): FighterClip | undefined {
  if (!c) return undefined;
  for (const n of [name, ...ALIAS[name]]) {
    const own = stage > 0 ? c.states[String(stage)]?.[n] : undefined;
    if (own) return own;
  }
  for (const n of [name, ...ALIAS[name]]) if (c.states.base?.[n]) return c.states.base[n];
  return undefined;
}

/** A fighter can stand on the stage once they have at least a stance and a strike. */
export const stageReady = (c: FighterClips | undefined) => !!c?.states.base?.idle && !!(c.states.base.strike || c.states.base.special);

/** Loads every frame strip a fight will need before the bell. */
const kept: HTMLImageElement[] = [];
export function preloadClips(c: FighterClips | undefined) {
  if (!c) return;
  for (const s of Object.values(c.states)) for (const clip of Object.values(s)) if (clip) { const img = new Image(); img.src = clipUrl(clip.url); kept.push(img); }
}
