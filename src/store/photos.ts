// Player photos the owner sets from their own computer. Stored only in this
// browser (IndexedDB), never bundled with the game or uploaded to the website.
import { useSyncExternalStore } from 'react';

const DB = 'cricket-auction-photos';
const STORE = 'photos';
let dbp: Promise<IDBDatabase> | null = null;
const urls = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function notify() { version++; for (const l of listeners) l(); }

/** Load every saved photo once at start-up. */
export async function loadPhotos(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const d = await db();
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(); return; }
      urls.set(String(cur.key), URL.createObjectURL(cur.value as Blob));
      cur.continue();
    };
    req.onerror = () => resolve();
  });
  notify();
}

/** Shrink to a 320 px square JPEG so the database stays small. */
async function shrink(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 320, 320);
  return new Promise((r) => c.toBlob((b) => r(b ?? file), 'image/jpeg', 0.85));
}

export async function setPhoto(id: string, file: Blob): Promise<void> {
  const blob = await shrink(file);
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.set(id, URL.createObjectURL(blob));
  notify();
}

export async function clearPhoto(id: string): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.delete(id);
  notify();
}

export function usePhoto(id: string): string | undefined {
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => version);
  return urls.get(id);
}

const norm = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z]/g, '');

/** Match a file name like "Virat Kohli.jpg" or "virat-kohli.png" to a player id (real name, alike name or id). */
export function matchPhoto(file: string, players: Array<{ id: string; name: string; realName: string }>): string | undefined {
  const k = norm(file);
  return players.find((p) => norm(p.realName) === k || norm(p.name) === k || norm(p.id) === k)?.id;
}

/** Pick a folder (or many files) and save every picture whose name matches a player. */
export function importPhotos(players: Array<{ id: string; name: string; realName: string }>, done: (matched: number, skipped: string[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.setAttribute('webkitdirectory', '');
  input.onchange = async () => {
    const skipped: string[] = [];
    let matched = 0;
    for (const f of Array.from(input.files ?? [])) {
      if (!f.type.startsWith('image/')) continue;
      const id = matchPhoto(f.name, players);
      if (id) { await setPhoto(id, f); matched++; } else skipped.push(f.name);
    }
    done(matched, skipped);
  };
  input.click();
}

/** Open the file picker and save the chosen picture for this player. */
export function pickPhoto(id: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => { const f = input.files?.[0]; if (f) void setPhoto(id, f); };
  input.click();
}
