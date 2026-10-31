// IndexedDB persistence with separate stores for game state, hidden vaults,
// battle records, Hall of Legends and settings. Falls back to memory when
// IndexedDB is unavailable (e.g. private browsing), so play is never blocked.
import type { BattleRecord, GameState, HallEntry } from '../engine/types';
import { SCHEMA_VERSION } from '../engine/types';
import { validateGameState } from '../engine/validation';
import { Vault } from '../engine/hidden';

const DB_NAME = 'anime-auction-uba';
const DB_VERSION = 1;
const STORES = ['games', 'vaults', 'battles', 'hall', 'settings'] as const;
type StoreName = (typeof STORES)[number];

export interface Settings {
  narrationSpeed: number;
  reducedMotion: 'system' | 'on' | 'off';
  useOnlineProvider: boolean;
  privacyDefault: boolean;
  /** Battle sound effects. */
  sound: boolean;
  /** Commentary read aloud. */
  voice: boolean;
  /** 'natural' uses the downloadable Kokoro voices; 'system' the browser's built-in voice. */
  voiceQuality: 'system' | 'natural';
  /** How battles are shown: as a self-drawing comic or the classic arena. */
  battleView: 'comic' | 'arena';
  /** Use the free local drawing app (ComfyUI) for comic panels when it is running. */
  aiDrawings: boolean;
  /** Battle music. */
  music: boolean;
  /** Panels per comic, and colour anime or black-and-white manga drawings. */
  comicLength: 'short' | 'full' | 'epic' | 'whole';
  /** Set once the comic length was moved to the whole fight. */
  wholeFightV1?: boolean;
  /** Drawing quality: fast (~7 s a panel) or best (~27 s, full detail). */
  drawQuality?: 'fast' | 'best';
  comicStyle: 'color' | 'manga';
}
/** True when the game runs on this computer (npm run dev / Start Game.bat), not from a website. */
export const RUNNING_LOCALLY = typeof location === 'undefined' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export const DEFAULT_SETTINGS: Settings = { narrationSpeed: 1, reducedMotion: 'system', useOnlineProvider: true, privacyDefault: true, sound: true, voice: true, voiceQuality: 'system', battleView: 'comic', aiDrawings: RUNNING_LOCALLY, music: true, comicLength: 'whole', comicStyle: 'color' };

export interface SaveSummary { id: string; name: string; phase: string; updatedAt: number; players: string[]; archived: boolean }

interface Backend {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  del(store: StoreName, key: string): Promise<void>;
  all<T>(store: StoreName): Promise<T[]>;
}

class MemoryBackend implements Backend {
  private data = new Map<string, Map<string, unknown>>();
  private s(store: string) { let m = this.data.get(store); if (!m) { m = new Map(); this.data.set(store, m); } return m; }
  async get<T>(store: StoreName, key: string) { return structuredClone(this.s(store).get(key)) as T | undefined; }
  async put(store: StoreName, key: string, value: unknown) { this.s(store).set(key, structuredClone(value)); }
  async del(store: StoreName, key: string) { this.s(store).delete(key); }
  async all<T>(store: StoreName) { return [...this.s(store).values()].map((v) => structuredClone(v)) as T[]; }
}

class IdbBackend implements Backend {
  private dbp: Promise<IDBDatabase>;
  constructor(factory: IDBFactory) {
    this.dbp = new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.dbp;
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req.result as T);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  get<T>(store: StoreName, key: string) { return this.tx<T | undefined>(store, 'readonly', (s) => s.get(key)); }
  async put(store: StoreName, key: string, value: unknown) { await this.tx(store, 'readwrite', (s) => s.put(value, key)); }
  async del(store: StoreName, key: string) { await this.tx(store, 'readwrite', (s) => s.delete(key)); }
  all<T>(store: StoreName) { return this.tx<T[]>(store, 'readonly', (s) => s.getAll()); }
}

export class Persistence {
  readonly backend: Backend;
  readonly durable: boolean;

  constructor(factory?: IDBFactory | null) {
    const f = factory === undefined ? (typeof indexedDB !== 'undefined' ? indexedDB : null) : factory;
    if (f) { this.backend = new IdbBackend(f); this.durable = true; }
    else { this.backend = new MemoryBackend(); this.durable = false; }
  }

  async saveGame(g: GameState, vault: Vault): Promise<void> {
    await this.backend.put('games', g.id, g);
    await this.backend.put('vaults', g.id, { gameId: g.id, data: vault.encode() });
  }

  async saveBattle(gameId: string, b: BattleRecord): Promise<void> {
    await this.backend.put('battles', b.battleId, { gameId, record: b });
  }

  async listSaves(): Promise<SaveSummary[]> {
    const games = await this.backend.all<GameState>('games');
    return games
      .map((g) => ({ id: g.id, name: g.config?.name ?? 'Untitled', phase: g.phase, updatedAt: g.updatedAt, players: (g.players ?? []).map((p) => p.name), archived: !!g.archived }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Loads and validates a game. Throws with a readable message if invalid. */
  async loadGame(id: string): Promise<{ game: GameState; vault: Vault; battles: BattleRecord[] }> {
    const game = await this.backend.get<GameState>('games', id);
    if (!game) throw new Error('Save not found.');
    const errors = validateGameState(game);
    if (errors.length) throw new Error(`This save is invalid: ${errors.slice(0, 3).join(' ')}`);
    const v = await this.backend.get<{ data: string }>('vaults', id);
    let vault: Vault;
    try { vault = Vault.decode(game.secret, v?.data ?? ''); } catch { throw new Error('Hidden character data for this save is corrupted.'); }
    for (const cid of Object.keys(game.characters)) if (!vault.has(cid)) vault.ensure(game.characters[cid]);
    const all = await this.backend.all<{ gameId: string; record: BattleRecord }>('battles');
    const battles = all.filter((b) => b.gameId === id).map((b) => b.record).sort((a, b) => a.createdAt - b.createdAt);
    return { game, vault, battles };
  }

  async deleteGame(id: string): Promise<void> {
    await this.backend.del('games', id);
    await this.backend.del('vaults', id);
    const all = await this.backend.all<{ gameId: string; record: BattleRecord }>('battles');
    for (const b of all) if (b.gameId === id) await this.backend.del('battles', b.record.battleId);
  }

  async exportGame(id: string): Promise<string> {
    const { game, vault, battles } = await this.loadGame(id);
    return JSON.stringify({ format: 'anime-auction-save', schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), game, vault: vault.encode(), battles });
  }

  async importGame(json: string): Promise<GameState> {
    let data: { format?: string; game?: GameState; vault?: string; battles?: BattleRecord[] };
    try { data = JSON.parse(json); } catch { throw new Error('File is not valid JSON.'); }
    if (data.format !== 'anime-auction-save' || !data.game) throw new Error('This is not an Anime Auction save file.');
    const errors = validateGameState(data.game);
    if (errors.length) throw new Error(`Import rejected: ${errors.slice(0, 3).join(' ')}`);
    let vault: Vault;
    try { vault = Vault.decode(data.game.secret, data.vault ?? ''); } catch { throw new Error('Import rejected: hidden data is corrupted.'); }
    for (const cid of Object.keys(data.game.characters)) if (!vault.has(cid)) throw new Error('Import rejected: missing hidden data.');
    await this.saveGame(data.game, vault);
    for (const b of data.battles ?? []) if (b && typeof b.battleId === 'string' && b.input && b.result) await this.saveBattle(data.game.id, b);
    return data.game;
  }

  async loadHall(): Promise<HallEntry[]> {
    return (await this.backend.all<HallEntry>('hall')).sort((a, b) => b.at - a.at);
  }

  async addHall(entries: HallEntry[]): Promise<void> {
    for (const e of entries) await this.backend.put('hall', e.id, e);
  }

  async clearHall(): Promise<void> {
    for (const e of await this.loadHall()) await this.backend.del('hall', e.id);
  }

  async loadSettings(): Promise<Settings> {
    const s = await this.backend.get<Settings>('settings', 'settings');
    const merged: Settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
    // Comics used to stop at a fixed number of panels; move everyone to the whole fight once.
    if (!merged.wholeFightV1) { merged.comicLength = 'whole'; merged.wholeFightV1 = true; }
    return merged;
  }

  async saveSettings(s: Settings): Promise<void> {
    await this.backend.put('settings', 'settings', s);
  }
}
