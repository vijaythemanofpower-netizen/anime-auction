// Free local drawings: talks to ComfyUI running on this computer
// (http://127.0.0.1:8188) with an anime model, and keeps every finished
// drawing in this browser so replays and reviews show the same comic.
import type { ComicDrawing } from '../../engine/comic';
import { NEGATIVE } from '../../engine/comic';

// While developing, Vite forwards /comfy to the drawing app (vite.config.ts), so no
// cross-site permission is needed. The website talks to it directly; the drawing
// app allows the website's address (Start Drawing AI.bat).
export const COMFY_URL = import.meta.env.DEV ? '/comfy' : 'http://127.0.0.1:8188';
const MODEL_HINT = /animagine|illustrious|noob|anime/i;
const SPEED_HINT = /dmd2|lightning|hyper|turbo/i;

export type DrawStatus = 'off' | 'checking' | 'ready' | 'no-model' | 'unreachable';

type Listener = () => void;

class Drawer {
  status: DrawStatus = 'off';
  model = '';
  speedLora = '';
  /** Drawings finished this session: key -> object URL. */
  private urls = new Map<string, string>();
  /** Panels drawn by the host of an online room, by key. */
  private remote = new Map<string, string>();
  /** Online: the host is drawing this fight, so missing panels are on their way. */
  private remoteExpected = false;
  private drawnHooks = new Set<(key: string, blob: Blob) => void>();
  private failed = new Set<string>();
  private pending = new Map<string, { promptId?: string; waiters: Array<(url: string | null) => void> }>();
  private listeners = new Set<Listener>();
  private lastCheck = 0;
  private clientId = `anime-auction-${Math.random().toString(36).slice(2)}`;

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const f of this.listeners) f(); }
  private set(s: DrawStatus) { if (this.status !== s) { this.status = s; this.emit(); } }

  /** Looks for ComfyUI and an anime model. Cheap to call often. */
  async check(force = false): Promise<DrawStatus> {
    if (!force && this.status === 'ready') return this.status;
    if (!force && Date.now() - this.lastCheck < 4000 && this.status !== 'off') return this.status;
    this.lastCheck = Date.now();
    if (this.status !== 'ready') this.set('checking');
    try {
      const [ckpts, loras] = await Promise.all([options('CheckpointLoaderSimple', 'ckpt_name'), options('LoraLoader', 'lora_name').catch(() => [] as string[])]);
      this.model = ckpts.find((c) => MODEL_HINT.test(c)) ?? '';
      this.speedLora = loras.find((l) => SPEED_HINT.test(l)) ?? '';
      this.set(this.model ? 'ready' : 'no-model');
    } catch {
      this.set('unreachable');
    }
    return this.status;
  }

  url(key: string): string | undefined { return this.urls.get(key) ?? this.remote.get(key); }

  /** Called with every finished drawing (new or from the browser's store), e.g. to share it. */
  onDrawn(fn: (key: string, blob: Blob) => void) { this.drawnHooks.add(fn); return () => { this.drawnHooks.delete(fn); }; }
  private drawn(key: string, blob: Blob) { for (const f of this.drawnHooks) f(key, blob); }

  /** Online guest: panels the host has drawn and shared. */
  setRemote(items: Array<{ key: string; url: string }>) {
    for (const { key, url } of items) this.remote.set(key, url);
    if (items.length) this.emit();
  }
  expectRemote(on: boolean) { if (this.remoteExpected !== on) { this.remoteExpected = on; this.emit(); } }

  /** Loads finished drawings for these keys from the browser's store. */
  async restore(keys: string[]): Promise<void> {
    let any = false;
    for (const k of keys) {
      if (this.urls.has(k)) continue;
      const blob = await cacheGet(k);
      if (blob) { this.urls.set(k, URL.createObjectURL(blob)); this.drawn(k, blob); any = true; }
    }
    if (any) this.emit();
  }

  /** Queues drawings in order; each resolves with its image URL, or null if it could not be drawn. */
  request(list: ComicDrawing[]): void {
    for (const d of list) {
      if (this.urls.has(d.key) || this.pending.has(d.key)) continue;
      this.failed.delete(d.key);
      const entry: { promptId?: string; waiters: Array<(url: string | null) => void> } = { waiters: [] };
      this.pending.set(d.key, entry);
      void this.draw(d, entry);
    }
  }

  isPending(key: string) { return this.pending.has(key); }

  /** Where a drawing stands: finished, given up on, still coming, or never asked for. */
  state(key: string): 'done' | 'failed' | 'pending' | 'none' {
    if (this.urls.has(key) || this.remote.has(key)) return 'done';
    if (this.pending.has(key)) return 'pending';
    if (this.failed.has(key)) return 'failed';
    return this.remoteExpected ? 'pending' : 'none';
  }

  /** Drops drawings still waiting in ComfyUI's queue (when the battle screen closes). */
  async cancel(keys: string[]): Promise<void> {
    const ids = keys.map((k) => this.pending.get(k)?.promptId).filter((x): x is string => !!x);
    for (const k of keys) this.pending.delete(k);
    if (!ids.length) return;
    try { await fetch(`${COMFY_URL}/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: ids }) }); } catch { /* ComfyUI closed */ }
  }

  private async draw(d: ComicDrawing, entry: { promptId?: string; waiters: Array<(url: string | null) => void> }) {
    const finish = (url: string | null) => {
      if (this.pending.get(d.key) !== entry) return;
      this.pending.delete(d.key);
      if (url) this.urls.set(d.key, url); else this.failed.add(d.key);
      for (const w of entry.waiters) w(url);
      this.emit();
    };
    try {
      const cached = await cacheGet(d.key);
      if (cached) { finish(URL.createObjectURL(cached)); this.drawn(d.key, cached); return; }
      if (this.status !== 'ready' && (await this.check()) !== 'ready') { finish(null); return; }
      const res = await fetch(`${COMFY_URL}/prompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow(d, this.model, this.speedLora), client_id: this.clientId }),
      });
      if (!res.ok) { finish(null); return; }
      const { prompt_id: promptId } = (await res.json()) as { prompt_id: string };
      entry.promptId = promptId;
      const started = Date.now();
      // Poll until done; the queue may hold the rest of the fight's panels ahead of this one.
      while (this.pending.get(d.key) === entry && Date.now() - started < 10 * 60_000) {
        await wait(700);
        const h = await fetch(`${COMFY_URL}/history/${promptId}`).then((r) => r.json() as Promise<Record<string, HistoryItem>>).catch(() => null);
        const item = h?.[promptId];
        if (!item) continue;
        if (item.status?.status_str === 'error') { finish(null); return; }
        const img = Object.values(item.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
        if (!img) { if (item.status?.completed) { finish(null); return; } continue; }
        const raw = await fetch(`${COMFY_URL}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'temp' })}`).then((r) => r.blob());
        const small = await compress(raw);
        void cachePut(d.key, small);
        finish(URL.createObjectURL(small));
        this.drawn(d.key, small);
        return;
      }
      finish(null);
    } catch {
      this.set('unreachable');
      finish(null);
    }
  }
}

interface HistoryItem { outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>; status?: { status_str?: string; completed?: boolean } }

async function options(node: string, field: string): Promise<string[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${COMFY_URL}/object_info/${node}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const info = (await res.json()) as Record<string, { input: { required: Record<string, unknown[]> } }>;
    const spec = info[node]?.input.required[field];
    // Older ComfyUI: [[...names]]; newer: ['COMBO', { options: [...] }].
    if (Array.isArray(spec?.[0])) return spec[0] as string[];
    const opts = (spec?.[1] as { options?: string[] } | undefined)?.options;
    return opts ?? [];
  } finally { clearTimeout(t); }
}

/** The ComfyUI graph: anime model (+ speed add-on when installed) -> one picture. */
export function workflow(d: ComicDrawing, model: string, speedLora: string): Record<string, unknown> {
  const fast = !!speedLora;
  const g: Record<string, unknown> = {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: d.prompt, clip: [fast ? 'lora' : 'ckpt', 1] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE, clip: [fast ? 'lora' : 'ckpt', 1] } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: d.width, height: d.height, batch_size: 1 } },
    sample: {
      class_type: 'KSampler',
      inputs: {
        seed: d.seed, steps: fast ? 8 : 24, cfg: fast ? 1 : 5, sampler_name: fast ? 'lcm' : 'euler_ancestral', scheduler: fast ? 'sgm_uniform' : 'normal', denoise: 1,
        model: [fast ? 'lora' : 'ckpt', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0],
      },
    },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
    out: { class_type: 'PreviewImage', inputs: { images: ['decode', 0] } },
  };
  if (fast) g.lora = { class_type: 'LoraLoader', inputs: { lora_name: speedLora, strength_model: 1, strength_clip: 1, model: ['ckpt', 0], clip: ['ckpt', 1] } };
  return g;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PNG from ComfyUI -> a much smaller JPEG for storage. */
async function compress(png: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(png);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? png), 'image/jpeg', 0.86));
  } catch { return png; }
}

// --- Browser storage for finished drawings (newest 400 kept).
const DB = 'anime-auction-comics';
const STORE = 'art';
const KEEP = 400;
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function req<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function cacheGet(key: string): Promise<Blob | undefined> {
  try { return (await req<{ blob: Blob } | undefined>('readonly', (s) => s.get(key)))?.blob; } catch { return undefined; }
}
async function cachePut(key: string, blob: Blob): Promise<void> {
  try {
    await req('readwrite', (s) => s.put({ blob, t: Date.now() }, key));
    const keys = await req<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    if (keys.length > KEEP) {
      const all = await req<Array<{ t: number }>>('readonly', (s) => s.getAll());
      const order = keys.map((k, i) => ({ k, t: all[i]?.t ?? 0 })).sort((a, b) => a.t - b.t);
      for (const o of order.slice(0, keys.length - KEEP)) await req('readwrite', (s) => s.delete(o.k));
    }
  } catch { /* storage full or unavailable: the drawing still shows this session */ }
}

export const drawer = new Drawer();
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __drawer: Drawer }).__drawer = drawer;
