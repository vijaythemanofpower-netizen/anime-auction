// Online rooms over Supabase Realtime broadcast (no database tables needed).
// The host's browser runs the game and broadcasts the whole state; guests send
// their moves ("acts") to the host, which checks them and applies them.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';

/** A guest's move. `key` is a random per-device secret: the host locks each seat to the first key it sees. */
export interface Act { name: string; args: unknown[]; me: string; key: string }

let ch: RealtimeChannel | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let latest: unknown = null;

export function roomCode(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => a[b % a.length]).join('');
}

/** Join (or create) the room channel. Resolves once subscribed. */
export async function openRoom(code: string, on: { state?: (g: unknown) => void; act?: (a: Act) => void; hello?: () => void; closed?: () => void }): Promise<void> {
  const sb = await supabase();
  if (ch) void sb.removeChannel(ch);
  ch = sb.channel(`cricket-auction-${code}`, { config: { broadcast: { self: false } } });
  if (on.state) ch.on('broadcast', { event: 'state' }, ({ payload }) => on.state!(payload.g));
  if (on.act) ch.on('broadcast', { event: 'act' }, ({ payload }) => on.act!(payload as Act));
  if (on.hello) ch.on('broadcast', { event: 'hello' }, () => on.hello!());
  if (on.closed) ch.on('broadcast', { event: 'closed' }, () => on.closed!());
  await new Promise<void>((resolve, reject) => {
    ch!.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Could not reach the room (${status}).`));
    });
  });
}

/** Host: send the state, at most every 150 ms (the last one always goes out). */
export function sendState(g: unknown) {
  latest = g;
  if (timer) return;
  timer = setTimeout(() => { timer = null; void ch?.send({ type: 'broadcast', event: 'state', payload: { g: latest } }); }, 150);
}

export function sendAct(a: Act) { void ch?.send({ type: 'broadcast', event: 'act', payload: a }); }
export function sayHello() { void ch?.send({ type: 'broadcast', event: 'hello', payload: {} }); }

/** Host: tell guests the room is closed, then leave the channel. */
export async function closeRoom() {
  if (ch) await ch.send({ type: 'broadcast', event: 'closed', payload: {} });
  await leaveRoom();
}
/** Leave the channel (guests leaving, or after closing). */
export async function leaveRoom() {
  if (timer) { clearTimeout(timer); timer = null; }
  const c = ch; ch = null;
  if (c) { const sb = await supabase(); await sb.removeChannel(c); }
}
