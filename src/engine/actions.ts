// Player moves as plain data, so they can travel over the network. In an
// online room every move is sent to the host, whose browser runs the game; the
// host applies it here for the player who sent it, never for anyone else.
import type { GameState, PrepChoice } from './types';
import type { Vault } from './hidden';
import * as A from './auction';
import * as G from './game';

export type PlayerMove =
  | { t: 'bid'; amount: number }
  | { t: 'pass' }
  | { t: 'scout' }
  | { t: 'revealed' }
  | { t: 'prep'; patch: Partial<Pick<PrepChoice, 'fighters' | 'front' | 'strategy' | 'mental' | 'jumpIn'>> }
  | { t: 'prepAction'; act: G.PrepAction }
  | { t: 'lock' };

const KINDS = new Set(['bid', 'pass', 'scout', 'revealed', 'prep', 'prepAction', 'lock']);

/** Rejects anything that is not a well-formed move (messages from the network are untrusted). */
export function isPlayerMove(x: unknown): x is PlayerMove {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  if (typeof m.t !== 'string' || !KINDS.has(m.t)) return false;
  if (m.t === 'bid') return typeof m.amount === 'number' && Number.isFinite(m.amount);
  if (m.t === 'prep') return !!m.patch && typeof m.patch === 'object';
  if (m.t === 'prepAction') return !!m.act && typeof m.act === 'object' && typeof (m.act as { charId?: unknown }).charId === 'string';
  return true;
}

/** Applies one player's move to the game. `playerId` is who sent it, as the host knows them. */
export function applyMove(g: GameState, vault: Vault, playerId: string, move: PlayerMove, now: number): G.R {
  if (!g.players.some((p) => p.id === playerId)) return { ok: false, error: 'You are not a player in this game.' };
  switch (move.t) {
    case 'bid': return A.placeBid(g, playerId, move.amount, now);
    case 'pass': return A.passLot(g, playerId, now);
    case 'scout': return G.useScoutToken(g, vault, playerId);
    case 'revealed': return G.markRevealed(g, playerId);
    case 'prep': return G.setPrep(g, playerId, move.patch);
    case 'prepAction': return G.prepAction(g, playerId, move.act);
    case 'lock': return G.lockPrep(g, playerId);
  }
}
