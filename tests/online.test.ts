import { describe, expect, it } from 'vitest';
import { applyMove, isPlayerMove } from '../src/engine/actions';
import { Reassembler, pack, split, unpack, PART_SIZE } from '../src/online/wire';
import * as G from '../src/engine/game';
import { makeGame, runAuction } from './helpers';

describe('player moves sent over the network', () => {
  it('accepts only well-formed moves', () => {
    expect(isPlayerMove({ t: 'bid', amount: 300 })).toBe(true);
    expect(isPlayerMove({ t: 'pass' })).toBe(true);
    expect(isPlayerMove({ t: 'bid', amount: 'lots' })).toBe(false);
    expect(isPlayerMove({ t: 'bid' })).toBe(false);
    expect(isPlayerMove({ t: 'startTournament' })).toBe(false); // host-only steps can't be sent
    expect(isPlayerMove({ t: 'prepAction', act: {} })).toBe(false);
    expect(isPlayerMove(null)).toBe(false);
    expect(isPlayerMove('bid')).toBe(false);
  });

  it('applies a move only for the player who sent it', () => {
    const { g, vault } = makeGame(2, 3, 'live', 3);
    runAuction(g);
    G.startTournament(g);
    G.startMatch(g, vault);
    const [a, b] = G.currentMatch(g)!.players;
    expect(applyMove(g, vault, a, { t: 'lock' }, Date.now()).ok).toBe(true);
    expect(g.prep[a].locked).toBe(true);
    expect(g.prep[b].locked).toBeFalsy();
    // A stranger can't move for anyone.
    expect(applyMove(g, vault, 'p99', { t: 'lock' }, Date.now()).ok).toBe(false);
    // A player can't field someone else's fighters.
    const other = g.players.find((p) => p.id === a)!.roster[0];
    expect(applyMove(g, vault, b, { t: 'prep', patch: { fighters: [other] } }, Date.now()).ok).toBe(false);
  });
});

describe('room messages', () => {
  it('compress and decompress losslessly', async () => {
    const value = { game: { name: 'Friday', players: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, bio: 'A loud ninja who never gives up. '.repeat(20) })) } };
    const packed = await pack(value);
    expect(packed.length).toBeLessThan(JSON.stringify(value).length / 5);
    expect(await unpack(packed)).toEqual(value);
  });

  it('split large messages and put them back together in any order', async () => {
    const big = 'x'.repeat(PART_SIZE * 2 + 17);
    const parts = split(big);
    expect(parts.length).toBe(3);
    const r = new Reassembler();
    expect(r.add('m1', 2, 3, parts[2])).toBeNull();
    expect(r.add('m1', 0, 3, parts[0])).toBeNull();
    expect(r.add('m1', 0, 3, parts[0])).toBeNull(); // a duplicate part is ignored
    expect(r.add('m1', 1, 3, parts[1])).toBe(big);
    expect(r.add('solo', 0, 1, 'abc')).toBe('abc');
  });
});
