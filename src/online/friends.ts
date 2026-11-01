// Friends and direct room invites (supabase/friends.sql). Add someone you played with
// or find them by name; once they accept, you can invite them straight into your room
// instead of sending the code around. Invites arrive instantly through Realtime.
import { useSyncExternalStore } from 'react';
import { supabase } from './client';
import { auth } from './auth';

export interface Friend { id: string; name: string; status: 'accepted' | 'incoming' | 'outgoing' }
export interface Invite { id: number; fromId: string; fromName: string; room: string; at: number }

interface State { friends: Friend[]; invites: Invite[]; ready: boolean; error: string | null }
let state: State = { friends: [], invites: [], ready: false, error: null };
const listeners = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const friendsStore = { get: () => state, subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; } };
export function useFriends(): State { return useSyncExternalStore(friendsStore.subscribe, friendsStore.get); }

const me = () => auth.get().userId;
const missingTables = (msg: string) => /friendships|invites|schema cache|does not exist/i.test(msg)
  ? 'Friends need a one-time database update (supabase/friends.sql).' : msg;

async function names(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const sb = await supabase();
  const { data } = await sb.from('profiles').select('id, display_name').in('id', ids);
  return Object.fromEntries(((data ?? []) as Array<{ id: string; display_name: string }>).map((p) => [p.id, p.display_name]));
}

/** Loads your friends and requests. */
export async function refreshFriends(): Promise<void> {
  const uid = me();
  if (!uid) { set({ friends: [], ready: true }); return; }
  const sb = await supabase();
  const { data, error } = await sb.from('friendships').select('user_id, friend_id, status');
  if (error) { set({ error: missingTables(error.message), ready: true }); return; }
  const rows = (data ?? []) as Array<{ user_id: string; friend_id: string; status: string }>;
  const other = (r: { user_id: string; friend_id: string }) => (r.user_id === uid ? r.friend_id : r.user_id);
  const nm = await names(rows.map(other));
  const friends: Friend[] = rows.map((r) => ({
    id: other(r), name: nm[other(r)] ?? 'Player',
    status: r.status === 'accepted' ? 'accepted' : r.user_id === uid ? 'outgoing' : 'incoming',
  }));
  friends.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'incoming' ? -1 : b.status === 'incoming' ? 1 : a.status === 'accepted' ? -1 : 1));
  set({ friends, ready: true, error: null });
}

/** Players whose name matches, to send a friend request. */
export async function searchPlayers(query: string): Promise<Array<{ id: string; name: string }>> {
  const q = query.trim();
  if (q.length < 2) return [];
  const sb = await supabase();
  const { data } = await sb.from('profiles').select('id, display_name').ilike('display_name', `%${q.replace(/[%_]/g, '')}%`).limit(8);
  return ((data ?? []) as Array<{ id: string; display_name: string }>).filter((p) => p.id !== me()).map((p) => ({ id: p.id, name: p.display_name }));
}

/** Sends a request, or accepts theirs if they already asked you. */
export async function addFriend(id: string): Promise<void> {
  const uid = me();
  if (!uid) throw new Error('Sign in first.');
  if (state.friends.some((f) => f.id === id && f.status === 'incoming')) return acceptFriend(id);
  const sb = await supabase();
  const { error } = await sb.from('friendships').insert({ user_id: uid, friend_id: id });
  if (error && !/duplicate/i.test(error.message)) throw new Error(missingTables(error.message));
  await refreshFriends();
}

export async function acceptFriend(id: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('user_id', id).eq('friend_id', me()!);
  if (error) throw new Error(missingTables(error.message));
  await refreshFriends();
}

export async function removeFriend(id: string): Promise<void> {
  const uid = me();
  const sb = await supabase();
  await sb.from('friendships').delete().or(`and(user_id.eq.${uid},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${uid})`);
  await refreshFriends();
}

/** Invites a friend into your room. */
export async function inviteFriend(id: string, room: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.from('invites').insert({ to_id: id, room_code: room });
  if (error) throw new Error(missingTables(error.message));
}

export async function dismissInvite(inv: Invite): Promise<void> {
  set({ invites: state.invites.filter((x) => x.id !== inv.id) });
  const sb = await supabase();
  await sb.from('invites').delete().eq('id', inv.id);
}

async function addInvites(rows: Array<{ id: number; from_id: string; to_id: string; room_code: string; created_at: string }>) {
  const uid = me();
  const fresh = rows.filter((r) => r.to_id === uid && Date.now() - Date.parse(r.created_at) < 30 * 60_000 && !state.invites.some((x) => x.id === r.id));
  if (!fresh.length) return;
  const nm = await names(fresh.map((r) => r.from_id));
  set({ invites: [...state.invites, ...fresh.map((r) => ({ id: r.id, fromId: r.from_id, fromName: nm[r.from_id] ?? 'A friend', room: r.room_code, at: Date.parse(r.created_at) }))] });
}

// Listen for invites while signed in (instant through Realtime, with a slow check as backup).
let watching: string | null = null;
let stop: (() => void) | null = null;
async function watch(uid: string | null) {
  if (uid === watching) return;
  stop?.(); stop = null; watching = uid;
  set({ invites: [], friends: [], ready: false });
  if (!uid) return;
  const sb = await supabase();
  const load = async () => {
    const { data } = await sb.from('invites').select('id, from_id, to_id, room_code, created_at').eq('to_id', uid).order('created_at', { ascending: false }).limit(10);
    await addInvites((data ?? []) as never);
  };
  void refreshFriends();
  void load();
  const ch = sb.channel(`invites:${uid}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invites', filter: `to_id=eq.${uid}` }, (p) => { void addInvites([p.new as never]); void refreshFriends(); }).subscribe();
  const poll = setInterval(() => { void load(); }, 45_000);
  stop = () => { clearInterval(poll); void sb.removeChannel(ch); };
}
if (typeof window !== 'undefined') {
  auth.subscribe(() => { const a = auth.get(); void watch(a.ready ? a.userId : null); });
  const a = auth.get();
  if (a.ready) void watch(a.userId);
}
