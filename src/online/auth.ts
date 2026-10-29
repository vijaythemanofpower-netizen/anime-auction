// Accounts: sign in with a one-time email link, and a small public profile
// (display name and career record).
import { useSyncExternalStore } from 'react';
import { ONLINE_AVAILABLE, supabase } from './client';

export interface Profile { id: string; display_name: string; games_played: number; wins: number; best_iq: number | null }
export interface AuthState { ready: boolean; userId: string | null; email: string | null; profile: Profile | null; guest: boolean }

let state: AuthState = { ready: !ONLINE_AVAILABLE, userId: null, email: null, profile: null, guest: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<AuthState>) => { state = { ...state, ...patch }; for (const l of listeners) l(); };

export const auth = {
  get: () => state,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useAuth(): AuthState {
  return useSyncExternalStore(auth.subscribe, auth.get);
}

/** Restores a saved sign-in (or finishes one when arriving from the email link). */
export async function initAuth(): Promise<void> {
  if (!ONLINE_AVAILABLE) return;
  try {
    const sb = await supabase();
    const apply = async (user: { id: string; email?: string; is_anonymous?: boolean } | null) => {
      if (!user) { set({ ready: true, userId: null, email: null, profile: null, guest: false }); return; }
      set({ ready: true, userId: user.id, email: user.email ?? null, guest: !!user.is_anonymous, profile: await loadProfile(user.id) });
    };
    const { data } = await sb.auth.getSession();
    await apply(data.session?.user ?? null);
    sb.auth.onAuthStateChange((_event, session) => {
      if ((session?.user?.id ?? null) !== state.userId) void apply(session?.user ?? null);
    });
    // Drop the login token from the address bar after the email link signs you in.
    if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname + location.search);
  } catch {
    set({ ready: true });
  }
}

/** Emails a one-time sign-in link that brings the player back to this page. */
export async function sendSignInLink(email: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new Error(error.message);
}

/** Plays without an email: a guest account that lives in this browser only. */
export async function signInAsGuest(): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.signInAnonymously();
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const sb = await supabase();
  await sb.auth.signOut();
  set({ userId: null, email: null, profile: null, guest: false });
}

async function loadProfile(id: string): Promise<Profile | null> {
  const sb = await supabase();
  const { data } = await sb.from('profiles').select('id, display_name, games_played, wins, best_iq').eq('id', id).maybeSingle();
  return (data as Profile | null) ?? null;
}

/** Creates or renames the signed-in player's profile. */
export async function saveDisplayName(name: string): Promise<void> {
  const clean = name.trim().slice(0, 24);
  if (!clean) throw new Error('Pick a name.');
  if (!state.userId) throw new Error('Sign in first.');
  const sb = await supabase();
  const { error } = await sb.from('profiles').upsert({ id: state.userId, display_name: clean, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  set({ profile: await loadProfile(state.userId) });
}

/** Adds a finished online tournament to the player's career record. */
export async function recordResult(won: boolean, iq: number | null): Promise<void> {
  const p = state.profile;
  if (!p) return;
  const sb = await supabase();
  const next = { games_played: p.games_played + 1, wins: p.wins + (won ? 1 : 0), best_iq: iq !== null ? Math.max(p.best_iq ?? 0, iq) : p.best_iq };
  const { error } = await sb.from('profiles').update(next).eq('id', p.id);
  if (!error) set({ profile: { ...p, ...next } });
}
