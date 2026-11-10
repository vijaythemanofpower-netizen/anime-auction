// Validation for saved games and imports. Rejects structurally invalid data
// and economic inconsistencies (e.g. edited balances) before they load.
import type { GameState } from './types';
import { SCHEMA_VERSION, STARTING_COINS } from './types';

const PHASES = ['setup', 'pool', 'auction', 'reveal', 'hub', 'prep', 'battle', 'results', 'champion'];

export function validateGameState(x: unknown): string[] {
  const e: string[] = [];
  const g = x as GameState;
  if (!g || typeof g !== 'object') return ['Save is not an object.'];
  if (g.schemaVersion !== SCHEMA_VERSION) e.push(`Unsupported save version ${String(g.schemaVersion)} (expected ${SCHEMA_VERSION}).`);
  if (typeof g.id !== 'string' || !g.id) e.push('Missing game id.');
  if (!PHASES.includes(g.phase)) e.push('Invalid phase.');
  if (!g.config || (g.config.rosterSize !== 3 && g.config.rosterSize !== 4)) e.push('Invalid roster size.');
  if (!Array.isArray(g.players) || g.players.length < 2 || g.players.length > 6) { e.push('Invalid player list.'); return e; }
  if (!Array.isArray(g.pool) || typeof g.characters !== 'object' || !g.characters) e.push('Invalid character pool.');
  if (typeof g.secret !== 'number') e.push('Missing game secret.');
  const owned = new Set<string>();
  for (const p of g.players) {
    if (typeof p.id !== 'string' || typeof p.name !== 'string') { e.push('Invalid player.'); continue; }
    if (!Number.isInteger(p.coins) || p.coins < 0 || p.coins > STARTING_COINS) e.push(`${p.name} has an invalid balance.`);
    if (!Array.isArray(p.roster) || p.roster.length > (g.config?.rosterSize ?? 4)) e.push(`${p.name} has an invalid roster.`);
    for (const id of p.roster ?? []) {
      if (owned.has(id)) e.push(`Character ${id} is owned twice.`);
      owned.add(id);
      if (g.owners?.[id] !== p.id) e.push(`Ownership record mismatch for ${id}.`);
      if (!g.characters?.[id]) e.push(`Missing character data for ${id}.`);
    }
    if (g.auction) {
      const spent = g.auction.transactions.filter((t) => t.playerId === p.id).reduce((s, t) => s + t.price, 0);
      if (spent + p.coins !== STARTING_COINS) e.push(`${p.name}'s balance does not match the transaction record.`);
      const bought = g.auction.transactions.filter((t) => t.playerId === p.id).map((t) => t.charId).sort().join(',');
      if (bought !== [...p.roster].sort().join(',')) e.push(`${p.name}'s roster does not match the transaction record.`);
    }
  }
  if (['hub', 'prep', 'battle', 'results', 'champion'].includes(g.phase) && !g.tournament) e.push('Tournament data is missing.');
  return e;
}
