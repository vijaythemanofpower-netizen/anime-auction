// Supabase connection for sign-in and online rooms. The URL and anon key are
// public by design (they identify the project; the database rules in
// supabase/schema.sql decide what each signed-in player may do). Never put the
// service_role key here.
import type { SupabaseClient } from '@supabase/supabase-js';

// The game's own project; a fork can point at another one with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://pzshrqbbovlqjerhdrzc.supabase.co';
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'sb_publishable_rusVrnk8EbhxwFB8KWxZBA_ROT1wNQA';

/** The public website. Invite links point here even when the host plays from their own computer. */
export const PUBLIC_SITE = (import.meta.env.VITE_PUBLIC_SITE as string | undefined) ?? 'https://vijaythemanofpower-netizen.github.io/anime-auction/';

/** Online play is available only when the game was built with a Supabase project. */
export const ONLINE_AVAILABLE = !!(URL && ANON_KEY);

let client: Promise<SupabaseClient> | null = null;

/** Loaded on first use, so offline players never download the Supabase library. */
export function supabase(): Promise<SupabaseClient> {
  if (!ONLINE_AVAILABLE) return Promise.reject(new Error('Online play is not set up for this copy of the game.'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL, ANON_KEY, {
    // Game updates come in bursts (a bid, a sold lot, the next lot); the default allows only 10 per second.
    realtime: { params: { eventsPerSecond: 30 } },
    auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      // Development only: ?tab-session gives a tab its own sign-in, to test two players in one browser.
      ...(import.meta.env.DEV && new URLSearchParams(location.search).has('tab-session') ? { storage: sessionStorage, storageKey: 'aa-tab-session' } : {}),
    },
  }));
  return client;
}
