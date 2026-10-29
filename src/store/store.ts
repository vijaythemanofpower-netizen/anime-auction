// Application store. Holds the active GameState (public), the hidden Vault
// (private to this module; exposed only through permission-checked getters),
// battle records, settings and navigation. Every mutation clones state, runs
// an engine function, and autosaves.
import { useSyncExternalStore } from 'react';
import type { BattleRecord, CoachCall, GameState, HallEntry, HiddenProfile, PublicCharacter } from '../engine/types';
import { Vault } from '../engine/hidden';
import * as G from '../engine/game';
import { registerCharacterMoves } from '../engine/data/abilities';
import { buildHallEntries } from '../engine/hall';
import { Persistence, type SaveSummary, type Settings, DEFAULT_SETTINGS } from './persistence';

export type Screen = 'home' | 'explorer' | 'setup' | 'game' | 'hall' | 'howto' | 'settings' | 'saves';

export interface AppState {
  screen: Screen;
  game: GameState | null;
  battles: Record<string, BattleRecord>;
  settings: Settings;
  hall: HallEntry[];
  saves: SaveSummary[];
  toast: { text: string; kind: 'error' | 'info' | 'success'; id: number } | null;
  viewer: string | null;
  recent: PublicCharacter[];
  durable: boolean;
  ready: boolean;
  exhibition: BattleRecord | null;
  saving: boolean;
  lastSaved: number | null;
}

type Listener = () => void;

class Store {
  private state: AppState = {
    screen: 'home', game: null, battles: {}, settings: DEFAULT_SETTINGS, hall: [], saves: [], toast: null, viewer: null,
    recent: [], durable: true, ready: false, exhibition: null, saving: false, lastSaved: null,
  };
  private vault: Vault | null = null;
  private listeners = new Set<Listener>();
  private db: Persistence;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toastSeq = 0;

  constructor() {
    this.db = new Persistence();
  }

  async init() {
    try {
      await this.db.listSaves();
    } catch {
      this.db = new Persistence(null);
    }
    const [settings, hall, saves] = await Promise.all([this.db.loadSettings(), this.db.loadHall(), this.db.listSaves()]);
    let recent: PublicCharacter[] = [];
    try { recent = JSON.parse(sessionStorage.getItem('aa-recent') ?? '[]'); } catch { /* ignore */ }
    this.set({ settings, hall, saves, ready: true, durable: this.db.durable, recent });
  }

  subscribe = (l: Listener) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getState = () => this.state;

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------ navigation

  go(screen: Screen) { this.set({ screen, exhibition: null }); }

  toast(text: string, kind: 'error' | 'info' | 'success' = 'info') {
    const id = ++this.toastSeq;
    this.set({ toast: { text, kind, id } });
    setTimeout(() => { if (this.state.toast?.id === id) this.set({ toast: null }); }, kind === 'error' ? 5000 : 3200);
  }

  setViewer(playerId: string | null) { this.set({ viewer: playerId }); }

  viewCharacter(pc: PublicCharacter) {
    const recent = [pc, ...this.state.recent.filter((r) => r.id !== pc.id)].slice(0, 12);
    try { sessionStorage.setItem('aa-recent', JSON.stringify(recent)); } catch { /* ignore */ }
    this.set({ recent });
  }

  // ---------------------------------------------------------------- game

  /** Runs an engine mutation on a cloned draft; commits and autosaves on success. */
  act(fn: (g: GameState, v: Vault) => G.R, opts: { silent?: boolean } = {}): G.R {
    const g = this.state.game;
    if (!g || !this.vault) return { ok: false, error: 'No active game.' };
    const draft = structuredClone(g);
    let r: G.R;
    try { r = fn(draft, this.vault); } catch (e) { r = { ok: false, error: (e as Error).message }; }
    if (r.ok) {
      draft.updatedAt = Date.now();
      this.set({ game: draft });
      this.scheduleSave();
    } else if (!opts.silent) this.toast(r.error, 'error');
    return r;
  }

  /** For timer/NPC ticks: commits only if fn reports a change. */
  tick(fn: (g: GameState) => boolean) {
    const g = this.state.game;
    if (!g) return;
    const draft = structuredClone(g);
    if (fn(draft)) { draft.updatedAt = Date.now(); this.set({ game: draft }); this.scheduleSave(); }
  }

  createGame(setup: G.GameSetup) {
    try {
      const game = G.newGame(setup);
      this.vault = new Vault(game.secret);
      this.set({ game, battles: {}, screen: 'game', viewer: null, exhibition: null });
      this.scheduleSave(0);
      return true;
    } catch (e) {
      this.toast((e as Error).message, 'error');
      return false;
    }
  }

  async loadGame(id: string) {
    try {
      const { game, vault, battles } = await this.db.loadGame(id);
      // Characters with written moves bring them along.
      for (const c of Object.values(game.characters)) registerCharacterMoves(c);
      this.vault = vault;
      // A resumed auction gets a fresh clock rather than expiring instantly.
      const lot = game.auction?.lot;
      if (game.phase === 'auction' && lot?.status === 'open') lot.deadline = Date.now() + game.auction!.config.timerSeconds * 1000;
      this.set({ game, battles: Object.fromEntries(battles.map((b) => [b.battleId, b])), screen: 'game', viewer: null, exhibition: null });
      this.toast(`Resumed "${game.config.name}".`, 'success');
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  }

  closeGame() {
    this.flushSave();
    this.vault = null;
    this.set({ game: null, battles: {}, screen: 'home', viewer: null, exhibition: null });
    void this.refreshSaves();
  }

  async refreshSaves() { this.set({ saves: await this.db.listSaves() }); }

  async deleteSave(id: string) {
    await this.db.deleteGame(id);
    if (this.state.game?.id === id) { this.vault = null; this.set({ game: null }); }
    await this.refreshSaves();
    this.toast('Save deleted.', 'info');
  }

  async exportSave(id: string): Promise<string | null> {
    this.flushSave();
    await new Promise((r) => setTimeout(r, 50));
    try { return await this.db.exportGame(id); } catch (e) { this.toast((e as Error).message, 'error'); return null; }
  }

  async importSave(json: string) {
    try {
      const g = await this.db.importGame(json);
      await this.refreshSaves();
      this.toast(`Imported "${g.config.name}".`, 'success');
    } catch (e) { this.toast((e as Error).message, 'error'); }
  }

  private scheduleSave(delay = 400) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), delay);
  }

  flushSave() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    const g = this.state.game;
    if (!g || !this.vault) return;
    this.set({ saving: true });
    this.db.saveGame(g, this.vault)
      .then(() => this.set({ saving: false, lastSaved: Date.now() }))
      .catch(() => { this.set({ saving: false }); this.toast('Autosave failed. Export your game to be safe.', 'error'); });
  }

  // -------------------------------------------------------------- hidden

  /** Hidden profile, only when the current viewer is permitted to see it. */
  hiddenFor(charId: string, viewerId: string | null): HiddenProfile | null {
    const g = this.state.game;
    if (!g || !this.vault || !G.canSeeHidden(g, viewerId, charId)) return null;
    return this.vault.get(charId);
  }

  // -------------------------------------------------------------- battles

  runBattle(): BattleRecord | null {
    let rec: BattleRecord | null = null;
    const r = this.act((g, v) => { rec = G.runMatchBattle(g, v); return { ok: true }; });
    if (!r.ok || !rec) return null;
    const record = rec as BattleRecord;
    this.set({ battles: { ...this.state.battles, [record.battleId]: record } });
    void this.db.saveBattle(this.state.game!.id, record);
    return record;
  }

  completeBattle(battleId: string) {
    const rec = this.state.battles[battleId];
    if (!rec) return;
    const r = this.act((g) => G.completeBattle(g, rec));
    if (r.ok && this.state.game?.tournament?.championId) {
      const entries = buildHallEntries(this.state.game, Object.values(this.state.battles));
      void this.db.addHall(entries).then(() => this.db.loadHall()).then((hall) => this.set({ hall }));
    }
  }

  replay(battleId: string) {
    const rec = this.state.battles[battleId];
    if (!rec) return;
    try {
      const { record, identical } = G.exactReplay(rec);
      this.set({ exhibition: record });
      this.toast(identical ? 'Exact replay verified: identical event sequence.' : 'Replay diverged from the original!', identical ? 'success' : 'error');
    } catch (e) { this.toast((e as Error).message, 'error'); }
  }

  rematch(battleId: string) {
    const rec = this.state.battles[battleId];
    const g = this.state.game;
    if (!rec || !g) return;
    const r = G.freshRematch(g, rec);
    this.set({ exhibition: r, battles: { ...this.state.battles, [r.battleId]: r } });
    void this.db.saveBattle(g.id, r);
  }

  closeExhibition() { this.set({ exhibition: null }); }

  /** Stores a player's coach IQ from the end-of-fight review. */
  saveReview(battleId: string, playerId: string, iq: number) {
    const g = this.state.game;
    const rec = this.state.battles[battleId];
    if (!g || !rec || rec.kind !== 'tournament') return;
    const next = { ...rec, reviews: [...(rec.reviews ?? []).filter((r) => r.playerId !== playerId), { playerId, iq }] };
    this.set({ battles: { ...this.state.battles, [battleId]: next } });
    void this.db.saveBattle(g.id, next);
  }

  /** A corner call made during playback: re-runs the fight from the same seed with the call included. */
  makeCall(record: BattleRecord, call: CoachCall) {
    const g = this.state.game;
    if (!g || !this.vault) return;
    try {
      const next = G.withCall(g, this.vault, record, call);
      const patch: Partial<AppState> = {};
      if (this.state.exhibition?.battleId === record.battleId) patch.exhibition = next;
      if (this.state.battles[record.battleId]) patch.battles = { ...this.state.battles, [record.battleId]: next };
      this.set(patch);
      if (patch.battles) void this.db.saveBattle(g.id, next);
    } catch (e) { this.toast((e as Error).message, 'error'); }
  }

  // ------------------------------------------------------------ settings

  async updateSettings(patch: Partial<Settings>) {
    const settings = { ...this.state.settings, ...patch };
    this.set({ settings });
    await this.db.saveSettings(settings);
  }

  async clearHall() {
    await this.db.clearHall();
    this.set({ hall: [] });
  }
}

export const store = new Store();

export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store.getState()));
}
