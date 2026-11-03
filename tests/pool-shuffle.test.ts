import { describe, expect, it } from 'vitest';
import * as G from '../src/engine/game';
import { Vault } from '../src/engine/hidden';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { roleOf } from '../src/engine/data/roles';
import { setup } from './helpers';

const fresh = () => {
  const g = G.newGame(setup(4), 99);
  return { g, vault: new Vault(g.secret) };
};
const byId = new Map(LEGEND_CHARACTERS.map((c) => [c.id, c]));

describe('pool shuffle', () => {
  it('fills the pool to the recommended size, spread over every auction set when balanced', () => {
    const { g, vault } = fresh();
    const r = G.shufflePool(g, vault, LEGEND_CHARACTERS, { balanced: true, replace: [] });
    expect(r.ok).toBe(true);
    expect(g.pool.length).toBe(G.poolRecommended(g));
    const roles = new Set(g.pool.map((id) => roleOf(byId.get(id)!)));
    const available = new Set(LEGEND_CHARACTERS.map(roleOf));
    expect(roles.size).toBe(Math.min(available.size, g.pool.length));
  });

  it('keeps hand-picked fighters and swaps the previous shuffle for a new mix', () => {
    const { g, vault } = fresh();
    const hand = LEGEND_CHARACTERS[0];
    G.addToPool(g, vault, hand);
    const first = G.shufflePool(g, vault, LEGEND_CHARACTERS, { balanced: true, replace: [] }).added!;
    const second = G.shufflePool(g, vault, LEGEND_CHARACTERS, { balanced: true, replace: first }).added!;
    expect(g.pool).toContain(hand.id);
    expect(g.pool.length).toBe(G.poolRecommended(g));
    expect(second).not.toEqual(first);
    expect(new Set(g.pool).size).toBe(g.pool.length);
  });

  it('refuses once the auction has started', () => {
    const { g, vault } = fresh();
    G.shufflePool(g, vault, LEGEND_CHARACTERS, { balanced: false, replace: [] });
    G.startAuction(g, 1000, vault);
    expect(G.shufflePool(g, vault, LEGEND_CHARACTERS, { balanced: true, replace: [] }).ok).toBe(false);
  });
});
