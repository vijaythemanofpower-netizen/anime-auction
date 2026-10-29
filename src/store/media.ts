// "Bring your own sounds": audio clips the player adds for a move or a
// character. Stored only in this browser (IndexedDB), never uploaded.
const DB = 'anime-auction-media';
const STORE = 'clips';

export const MAX_CLIP_BYTES = 3 * 1024 * 1024;
export const MAX_MUSIC_BYTES = 25 * 1024 * 1024;
/** move:<abilityId> plays when the move is used; cry:<charId> is a character's battle cry. */
export const moveKey = (abilityId: string) => `move:${abilityId}`;
export const cryKey = (charId: string) => `cry:${charId}`;
/** bgm:<charId> is a character's own battle music; bgm-series:<series> plays for anyone from that series. */
export const musicKey = (charId: string) => `bgm:${charId}`;
export const seriesMusicKey = (series: string) => `bgm-series:${series.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('No local storage available.')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

const listeners = new Set<() => void>();
let keys: Set<string> | null = null;
export function onClipsChanged(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const changed = () => { for (const f of listeners) f(); };

export async function clipKeys(): Promise<Set<string>> {
  if (keys) return keys;
  try { keys = new Set((await tx('readonly', (s) => s.getAllKeys())).map(String)); } catch { keys = new Set(); }
  return keys;
}

export async function putClip(key: string, file: Blob): Promise<void> {
  if (!file.type.startsWith('audio/')) throw new Error('That file is not an audio file.');
  const music = key.startsWith('bgm');
  if (file.size > (music ? MAX_MUSIC_BYTES : MAX_CLIP_BYTES)) throw new Error(music ? 'Music files can be up to 25 MB.' : 'Clips can be up to 3 MB.');
  await tx('readwrite', (s) => s.put(file, key));
  (await clipKeys()).add(key);
  changed();
}

export async function getClip(key: string): Promise<Blob | undefined> {
  try { return await tx<Blob | undefined>('readonly', (s) => s.get(key)); } catch { return undefined; }
}

export async function deleteClip(key: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(key));
  (await clipKeys()).delete(key);
  changed();
}
