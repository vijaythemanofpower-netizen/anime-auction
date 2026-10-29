// Online rooms. A player creates a room and shares its 6-character code;
// friends join with the code. The host's browser runs the real game (with the
// hidden stats) and sends everyone the public game state as it changes;
// players send their moves (bids, prep, corner calls) to the host. Each
// player receives hidden stats only for their own fighters.
import { useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { BattleRecord, CoachCall, GameState, HiddenProfile } from '../engine/types';
import type { GameSetup } from '../engine/game';
import { DEFAULT_AUCTION, DEFAULT_TOURNAMENT } from '../engine/game';
import { isPlayerMove, type PlayerMove } from '../engine/actions';
import { supabase } from './client';
import { auth } from './auth';
import { Reassembler, pack, split, unpack } from './wire';
import { store } from '../store/store';
import { drawer } from '../ui/comic/drawing';
import type { ComicLength, ComicStyle } from '../engine/comic';

export interface Member { userId: string; name: string; online: boolean }
/** Whether the host is drawing comics for the room, and the comic settings everyone should use. */
export interface ArtistInfo { active: boolean; length: ComicLength; style: ComicStyle }
export interface LobbySettings { name: string; rosterSize: 3 | 4; npcs: number; timerSeconds: number; soloRounds: number; tagRound: boolean }
export interface RoomState {
  code: string;
  role: 'host' | 'guest';
  userId: string;
  hostId: string;
  members: Member[];
  settings: LobbySettings;
  /** playerId -> userId, once the game has started. */
  seats: Record<string, string>;
  myPlayerId: string | null;
  started: boolean;
  connected: boolean;
  /** Guests: the host's comic drawing, when they have the drawing app running. */
  artist: ArtistInfo | null;
}

export const DEFAULT_LOBBY: LobbySettings = { name: 'Online Showdown', rosterSize: 3, npcs: 0, timerSeconds: 15, soloRounds: 1, tagRound: true };
export const MAX_PLAYERS = 6;

const COLORS = ['#a78bfa', '#f472b6', '#22d3ee', '#f5c451', '#34d399', '#fb923c'];
const EMBLEMS = ['◆', '✦', '❖', '☾', '✸', '⬢'];
const NPC_NAMES = ['House Kurogane', 'Syndicate Vale', 'Baron Ashcroft', 'The Ivory Court', 'Clan Mizuchi'];

type Msg =
  | { k: 'hello' }
  | { k: 'lobby'; settings: LobbySettings; seats: Record<string, string>; started: boolean }
  | { k: 'sync'; game: GameState; sentAt: number }
  | { k: 'battle'; record: BattleRecord }
  | { k: 'hidden'; profiles: Record<string, HiddenProfile> }
  | { k: 'move'; move: PlayerMove }
  | { k: 'call'; battleId: string; call: CoachCall }
  | { k: 'artist'; artist: ArtistInfo }
  | { k: 'art'; items: Array<{ key: string; url: string }> }
  | { k: 'error'; text: string }
  | { k: 'closed' };

let room: RoomState | null = null;
/** Message counters, readable from the browser console while testing (window.__roomDebug). */
const debug = { sent: 0, received: [] as string[], failed: [] as string[] };
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __roomDebug: typeof debug }).__roomDebug = debug;
let channel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();
const parts = new Reassembler();
let unsubStore: (() => void) | null = null;

function setRoom(next: RoomState | null) {
  room = next;
  store.setOnline(next ? { role: next.role, myPlayerId: next.myPlayerId, started: next.started, code: next.code } : null);
  for (const l of listeners) l();
}
const patch = (p: Partial<RoomState>) => { if (room) setRoom({ ...room, ...p }); };

export const rooms = { get: () => room, subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; } };
export function useRoom(): RoomState | null { return useSyncExternalStore(rooms.subscribe, rooms.get); }

function me(): { userId: string; name: string } {
  const a = auth.get();
  if (!a.userId) throw new Error('Sign in to play online.');
  return { userId: a.userId, name: a.profile?.display_name ?? (a.email?.split('@')[0] ?? 'Player') };
}

// ------------------------------------------------------------ joining

export async function createRoom(): Promise<string> {
  const { name } = me();
  const sb = await supabase();
  const { data, error } = await sb.rpc('create_room', { p_display: name });
  if (error) throw new Error(error.message);
  await connect(String(data));
  return String(data);
}

export async function joinRoom(code: string): Promise<void> {
  const { name } = me();
  const sb = await supabase();
  const { error } = await sb.rpc('join_room', { p_code: code.trim().toUpperCase(), p_display: name });
  if (error) throw new Error(error.message);
  await connect(code.trim().toUpperCase());
}

export async function leaveRoom(): Promise<void> {
  if (!room) return;
  const r = room;
  try {
    const sb = await supabase();
    if (r.role === 'host') {
      await send({ k: 'closed' });
      await removeSharedPanels(sb, r.code);
      if (!r.started) await sb.from('rooms').delete().eq('code', r.code);
    } else if (!r.started) {
      await sb.from('room_members').delete().eq('room_code', r.code).eq('user_id', r.userId);
    }
  } catch { /* leaving anyway */ }
  await disconnect();
}

async function disconnect() {
  unsubStore?.(); unsubStore = null;
  unsubArt?.(); unsubArt = null;
  drawer.expectRemote(false);
  if (channel) { const sb = await supabase(); await sb.removeChannel(channel); channel = null; }
  if (room?.role === 'guest') store.leaveOnlineGame();
  setRoom(null);
}

async function connect(code: string) {
  await disconnect();
  const { userId } = me();
  const sb = await supabase();
  const { data: roomRow, error } = await sb.from('rooms').select('code, host_id, status').eq('code', code).single();
  if (error || !roomRow) throw new Error('Could not open that room.');
  const role = roomRow.host_id === userId ? 'host' : 'guest';
  setRoom({ code, role, userId, hostId: roomRow.host_id, members: [], settings: DEFAULT_LOBBY, seats: {}, myPlayerId: null, started: roomRow.status !== 'lobby', connected: false, artist: null });
  await refreshMembers();

  const { data: session } = await sb.auth.getSession();
  await sb.realtime.setAuth(session.session?.access_token ?? null);
  const ch = sb.channel(`room:${code}`, { config: { private: true, broadcast: { self: false }, presence: { key: userId } } });
  channel = ch;
  ch.on('broadcast', { event: 'm' }, ({ payload }) => { void receive(payload as Wire); });
  ch.on('presence', { event: 'sync' }, () => { void refreshMembers(); });
  await new Promise<void>((resolve, reject) => {
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { patch({ connected: true }); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { patch({ connected: false }); reject(new Error('Could not connect to the room. Check your internet connection.')); }
      else if (status === 'CLOSED') patch({ connected: false });
    });
  });
  await ch.track({ userId, at: Date.now() });
  if (role === 'host') startHosting();
  else await send({ k: 'hello' });
}

async function refreshMembers() {
  if (!room) return;
  const sb = await supabase();
  const { data } = await sb.from('room_members').select('user_id, display_name, joined_at').eq('room_code', room.code).order('joined_at');
  const present = new Set(Object.keys(channel?.presenceState() ?? {}));
  const members = (data ?? []).map((m) => ({ userId: m.user_id as string, name: m.display_name as string, online: present.has(m.user_id as string) || m.user_id === room!.userId }));
  patch({ members });
}

// ------------------------------------------------------------ messages

interface Wire { from: string; to?: string; id: string; i: number; n: number; z: string }

async function send(msg: Msg, to?: string): Promise<void> {
  if (!channel || !room) return;
  const packed = await pack(msg);
  const chunks = split(packed);
  const id = `${room.userId.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  for (let i = 0; i < chunks.length; i++) {
    const wire: Wire = { from: room.userId, to, id, i, n: chunks.length, z: chunks[i] };
    const res = await channel.send({ type: 'broadcast', event: 'm', payload: wire });
    debug.sent++;
    if (res !== 'ok') { debug.failed.push(`${msg.k}:${res}`); console.warn(`[room] ${msg.k} part ${i + 1}/${chunks.length} not sent: ${res}`); }
  }
}

async function receive(w: Wire) {
  if (!room || (w.to && w.to !== room.userId)) return;
  const whole = parts.add(w.id, w.i, w.n, w.z);
  if (whole === null) return;
  let msg: Msg;
  try { msg = await unpack<Msg>(whole); } catch (e) { debug.failed.push(`unpack:${(e as Error).message}`); return; }
  debug.received.push(msg.k);
  if (room.role === 'host') hostReceive(w.from, msg);
  else if (w.from === room.hostId) guestReceive(msg);
}

// ---------------------------------------------------------------- host

let lastGame: GameState | null = null;
let lastLobby = '';
let lastBattles: Record<string, BattleRecord> = {};
let lastHidden: Record<string, string> = {};
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function startHosting() {
  lastGame = null; lastBattles = {}; lastHidden = {}; lastLobby = ''; lastArtist = ''; shared.clear();
  const unsubGame = store.subscribe(() => {
    const s = store.getState();
    if (s.game !== lastGame || s.battles !== lastBattles) scheduleSync();
    void pushArtist(false);
  });
  const unsubDrawer = drawer.subscribe(() => { void pushArtist(false); });
  unsubStore = () => { unsubGame(); unsubDrawer(); };
  unsubArt = drawer.onDrawn((key, blob) => { void sharePanel(key, blob); });
  if (store.getState().settings.aiDrawings) void drawer.check();
}

// ------------------------------------------------- shared comic panels

let unsubArt: (() => void) | null = null;
let lastArtist = '';
/** Panels already uploaded for this room: drawing key -> public link. */
const shared = new Map<string, string>();
let artBatch: Array<{ key: string; url: string }> = [];
let artTimer: ReturnType<typeof setTimeout> | null = null;
let uploads: Promise<void> = Promise.resolve();

function artistInfo(): ArtistInfo {
  const s = store.getState().settings;
  return { active: s.aiDrawings && drawer.status === 'ready', length: s.comicLength, style: s.comicStyle };
}

async function pushArtist(force: boolean, onlyTo?: string) {
  if (!room || room.role !== 'host') return;
  const info = artistInfo();
  const key = JSON.stringify(info);
  if (!force && key === lastArtist) return;
  if (!onlyTo) lastArtist = key;
  await send({ k: 'artist', artist: info }, onlyTo);
}

const panelPath = (code: string, key: string) => `${code}/${key.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;

/** Host: uploads a finished panel (one at a time) and tells the room where it is. */
function sharePanel(key: string, blob: Blob): Promise<void> {
  uploads = uploads.then(async () => {
    if (!room || room.role !== 'host' || !room.started || shared.has(key)) return;
    try {
      const sb = await supabase();
      const path = panelPath(room.code, key);
      const { error } = await sb.storage.from('comics').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) throw error;
      const url = sb.storage.from('comics').getPublicUrl(path).data.publicUrl;
      shared.set(key, url);
      artBatch.push({ key, url });
      artTimer ??= setTimeout(() => { artTimer = null; const items = artBatch; artBatch = []; void send({ k: 'art', items }); }, 800);
    } catch (e) {
      console.warn('[room] could not share a comic panel', e);
    }
  });
  return uploads;
}

/** Host: deletes the room's shared panels when the room closes, to keep storage free. */
async function removeSharedPanels(sb: Awaited<ReturnType<typeof supabase>>, code: string) {
  try {
    const { data } = await sb.storage.from('comics').list(code, { limit: 1000 });
    if (data?.length) await sb.storage.from('comics').remove(data.map((f) => `${code}/${f.name}`));
  } catch { /* storage cleanup can wait */ }
}

/** Changes within a quarter of a second go out together. */
function scheduleSync(delay = 250) {
  if (syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = null; void pushState(false); }, delay);
}

/** Sends what changed: the game, new or changed battles, and each player's hidden stats. */
async function pushState(full: boolean, onlyTo?: string) {
  if (!room || room.role !== 'host') return;
  const s = store.getState();
  const lobby = JSON.stringify([room.settings, room.seats, room.started]);
  if (full || lobby !== lastLobby) {
    if (!onlyTo) lastLobby = lobby;
    await send({ k: 'lobby', settings: room.settings, seats: room.seats, started: room.started }, onlyTo);
  }
  if (!room.started || !s.game) return;
  if (full || s.game !== lastGame) {
    if (!onlyTo) lastGame = s.game;
    await send({ k: 'sync', game: { ...s.game, secret: 0 }, sentAt: Date.now() }, onlyTo);
  }
  for (const [id, rec] of Object.entries(s.battles)) {
    if (full || lastBattles[id] !== rec) await send({ k: 'battle', record: rec }, onlyTo);
  }
  if (!onlyTo) lastBattles = s.battles;
  for (const [playerId, userId] of Object.entries(room.seats)) {
    if (userId === room.userId || (onlyTo && userId !== onlyTo)) continue;
    const profiles = store.hiddenVisibleTo(playerId);
    const key = Object.keys(profiles).sort().join(',');
    if (!full && lastHidden[userId] === key) continue;
    if (!onlyTo) lastHidden[userId] = key;
    await send({ k: 'hidden', profiles }, userId);
  }
  void saveToCloud();
}

function hostReceive(from: string, msg: Msg) {
  if (!room) return;
  const playerId = Object.entries(room.seats).find(([, u]) => u === from)?.[0];
  switch (msg.k) {
    case 'hello':
      void refreshMembers().then(async () => {
        await pushState(true, from);
        await pushArtist(true, from);
        if (shared.size) await send({ k: 'art', items: [...shared].map(([key, url]) => ({ key, url })) }, from);
      });
      return;
    case 'move': {
      if (!playerId || !isPlayerMove(msg.move)) return;
      const r = store.applyMove(playerId, msg.move, { silent: true });
      if (!r.ok) void send({ k: 'error', text: r.error }, from);
      return;
    }
    case 'call': {
      if (!playerId || !msg.call || typeof msg.battleId !== 'string') return;
      const r = store.applyRemoteCall(playerId, msg.battleId, msg.call);
      if (!r.ok) void send({ k: 'error', text: r.error }, from);
      return;
    }
  }
}

/** Host: change the lobby's game settings. */
export function updateLobby(settings: Partial<LobbySettings>) {
  if (!room || room.role !== 'host' || room.started) return;
  patch({ settings: { ...room.settings, ...settings } });
  scheduleSync();
}

/** Host: start the game with everyone in the lobby (plus computer players). */
export async function startOnlineGame(): Promise<void> {
  if (!room || room.role !== 'host') return;
  await refreshMembers();
  const humans = room.members;
  const npcs = Math.min(room.settings.npcs, MAX_PLAYERS - humans.length);
  if (humans.length + npcs < 2) throw new Error('You need at least 2 players. Wait for a friend or add a computer player.');
  const s = room.settings;
  const setup: GameSetup = {
    name: s.name.trim() || 'Online Showdown',
    rosterSize: s.rosterSize,
    privacyScreens: false,
    auction: { ...DEFAULT_AUCTION, mode: 'live', timerSeconds: s.timerSeconds },
    tournament: { ...DEFAULT_TOURNAMENT, soloRounds: s.soloRounds, tagRound: s.tagRound },
    players: [
      ...humans.map((m, i) => ({ name: m.name, kind: 'human' as const, color: COLORS[i % COLORS.length], emblem: EMBLEMS[i % EMBLEMS.length] })),
      ...Array.from({ length: npcs }, (_, i) => ({ name: NPC_NAMES[i % NPC_NAMES.length], kind: 'npc' as const, color: COLORS[(humans.length + i) % COLORS.length], emblem: EMBLEMS[(humans.length + i) % EMBLEMS.length] })),
    ],
  };
  // Players are numbered p1, p2, ... in the order given.
  const seats = Object.fromEntries(humans.map((m, i) => [`p${i + 1}`, m.userId]));
  const myPlayerId = Object.entries(seats).find(([, u]) => u === room!.userId)![0];
  patch({ seats, myPlayerId, started: true });
  if (!store.createGame(setup, { myPlayerId })) { patch({ started: false, seats: {}, myPlayerId: null }); throw new Error('Could not start the game.'); }
  const sb = await supabase();
  await sb.from('rooms').update({ status: 'playing', updated_at: new Date().toISOString() }).eq('code', room.code);
  await pushState(true);
}

let cloudTimer: ReturnType<typeof setTimeout> | null = null;
/** Host: keeps a copy of the full game in their account so it can be resumed on another device. */
function saveToCloud() {
  if (cloudTimer) return;
  cloudTimer = setTimeout(async () => {
    cloudTimer = null;
    const s = store.getState();
    if (!room || room.role !== 'host' || !s.game) return;
    try {
      const sb = await supabase();
      const data = await pack({ game: s.game, vault: store.encodeVault(), battles: s.battles, seats: room.seats, settings: room.settings });
      // Shows the room as active in the Host Portal.
      await sb.rpc('touch_room', { p_code: room.code });
      await sb.from('game_saves').upsert({ id: s.game.id, owner: room.userId, room_code: room.code, name: s.game.config.name, data, updated_at: new Date().toISOString() });
    } catch { /* the local save still has it */ }
  }, 8000);
}

export interface CloudSave { id: string; name: string; room_code: string | null; updated_at: string }

export async function listCloudSaves(): Promise<CloudSave[]> {
  const sb = await supabase();
  const { data } = await sb.from('game_saves').select('id, name, room_code, updated_at').order('updated_at', { ascending: false }).limit(20);
  return (data ?? []) as CloudSave[];
}

/** Host: reopens an online game from the cloud (on any device) and reconnects its room. */
export async function resumeCloudSave(id: string): Promise<void> {
  const sb = await supabase();
  const { data, error } = await sb.from('game_saves').select('data, room_code').eq('id', id).single();
  if (error || !data) throw new Error('Could not load that game.');
  const saved = await unpack<{ game: GameState; vault: string; battles: Record<string, BattleRecord>; seats: Record<string, string>; settings: LobbySettings }>(data.data as string);
  if (!data.room_code) throw new Error('That game has no room.');
  await connect(data.room_code as string);
  if (!room || room.role !== 'host') throw new Error('Only the host can resume this game.');
  const myPlayerId = Object.entries(saved.seats).find(([, u]) => u === room!.userId)?.[0] ?? null;
  patch({ seats: saved.seats, settings: saved.settings, started: true, myPlayerId });
  store.resumeOnlineGame(saved.game, saved.battles, saved.vault, myPlayerId);
  await pushState(true);
}

// --------------------------------------------------------------- guest

function guestReceive(msg: Msg) {
  if (!room) return;
  switch (msg.k) {
    case 'lobby': {
      const myPlayerId = Object.entries(msg.seats).find(([, u]) => u === room!.userId)?.[0] ?? null;
      patch({ settings: msg.settings, seats: msg.seats, started: msg.started, myPlayerId });
      return;
    }
    case 'sync':
      if (room.myPlayerId) store.receiveGame(msg.game, msg.sentAt, room.myPlayerId);
      return;
    case 'battle': store.receiveBattle(msg.record); return;
    case 'artist': patch({ artist: msg.artist }); drawer.expectRemote(msg.artist.active); return;
    case 'art': drawer.setRemote(msg.items); return;
    case 'hidden': store.receiveHidden(msg.profiles); return;
    case 'error': store.toast(msg.text, 'error'); return;
    case 'closed':
      store.toast('The host closed the room.', 'info');
      void disconnect();
      return;
  }
}

/** Guest: sends a move to the host. */
export function sendMove(move: PlayerMove) { void send({ k: 'move', move }); }
/** Guest: sends a corner call to the host. */
export function sendCall(battleId: string, call: CoachCall) { void send({ k: 'call', battleId, call }); }

store.setNetwork({ sendMove, sendCall });
