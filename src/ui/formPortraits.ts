// Form portraits: when a fighter transforms (Sage Mode, Bankai, Gear Fifth...), the arena
// swaps their picture for one of that form. In order: your own picture for the form, then
// one the drawing app painted (drawn once, kept in this browser, shared with your room
// while you host), and otherwise the normal portrait with the form's glow.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BattleRecord, PublicCharacter } from '../engine/types';
import type { ComicDrawing } from '../engine/comic';
import { characterTags } from '../engine/comic';
import { kitFor } from '../engine/data/kits';
import { hashString } from '../engine/rng';
import { clipKeys, formPicKey, getClip, onClipsChanged } from '../store/media';
import { drawer } from './comic/drawing';
import { rooms, shareImage } from '../online/room';

/** The drawing key for a form portrait: the same for every fight, so it is drawn only once. */
export const formDrawKey = (charId: string, stage: number) => `form:${charId}:${stage}:v1`;

/** What the drawing app paints for a form: the character in that form, upper body, facing us. */
export function formDrawing(c: PublicCharacter, stage: number): ComicDrawing | null {
  const form = kitFor(c.id, c.name)?.forms[stage - 1];
  if (!form) return null;
  const prompt = [
    `(${characterTags(c, c.name)}, ${form.look}:1.2)`, `(${form.name.toLowerCase().replace(/[^a-z0-9 ]/g, '')}:0.8)`,
    'solo, upper body, looking at viewer, battle stance, glowing aura, dramatic lighting, anime coloring, bold lineart, cel shading, dark background',
    'safe', 'masterpiece, high score, great score, absurdres',
  ].join(', ');
  const ref = !c.id.startsWith('legend:') && c.source !== 'original' ? c.imageUrl : undefined;
  return { key: formDrawKey(c.id, stage), prompt, seed: hashString(`${c.id}:form:${stage}`) >>> 0, width: 832, height: 1216, ref };
}

// Your own pictures, as object URLs, loaded once per session.
const own = new Map<string, string>();
const ownListeners = new Set<() => void>();
let ownVersion = 0;
async function loadOwn(key: string): Promise<string | undefined> {
  if (own.has(key)) return own.get(key);
  if (!(await clipKeys()).has(key)) return undefined;
  const blob = await getClip(key);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  own.set(key, url);
  ownVersion++;
  ownListeners.forEach((l) => l());
  return url;
}
onClipsChanged(() => { for (const u of own.values()) URL.revokeObjectURL(u); own.clear(); ownVersion++; ownListeners.forEach((l) => l()); });

/** The picture for this fighter in this form, if there is one yet. */
export function useFormPicture(c: PublicCharacter | undefined, stage: number): string | undefined {
  const v = useSyncExternalStore((f) => { ownListeners.add(f); return () => { ownListeners.delete(f); }; }, () => ownVersion);
  // Re-render when a drawing finishes (the drawer has no version number to watch).
  const [, setTick] = useState(0);
  useEffect(() => drawer.subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => { if (c && stage > 0) void loadOwn(formPicKey(c.id, stage)); }, [c?.id, stage, v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c || stage <= 0) return undefined;
  return own.get(formPicKey(c.id, stage)) ?? drawer.url(formDrawKey(c.id, stage));
}

/**
 * When a fight opens: gets a picture ready for every form reached in it. Your own pictures
 * are used (and shared with your room if you host); missing ones are painted by the
 * drawing app if it is running, a few seconds each, long before the transformation plays.
 */
export async function prepareFormPortraits(record: BattleRecord, characters: Record<string, PublicCharacter>, draw: boolean): Promise<void> {
  const reached = new Map<string, number>();
  for (const e of record.result.events) if (e.type === 'transform' && e.actor) reached.set(`${e.actor}|${Number(e.context?.stage ?? 1)}`, 1);
  if (!reached.size) return;
  const room = rooms.get();
  const hosting = !!room?.connected && room.role === 'host';
  const toDraw: ComicDrawing[] = [];
  for (const k of reached.keys()) {
    const [id, st] = k.split('|');
    const stage = Number(st);
    const c = characters[id];
    if (!c) continue;
    const mine = formPicKey(id, stage);
    if ((await clipKeys()).has(mine)) {
      await loadOwn(mine);
      if (hosting) { const blob = await getClip(mine); if (blob) void shareImage(formDrawKey(id, stage), blob); }
      continue;
    }
    const d = formDrawing(c, stage);
    if (!d) continue;
    await drawer.restore([d.key]);
    if (!drawer.url(d.key) && draw) toDraw.push(d);
  }
  if (toDraw.length && (await drawer.check()) === 'ready') drawer.request(toDraw);
}
