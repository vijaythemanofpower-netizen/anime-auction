import { describe, expect, it } from 'vitest';
import * as G from '../src/engine/game';
import { arenaUses2D } from '../src/ui/battlefield/view';

const setup: G.GameSetup = {
  name: 'View test',
  players: [
    { name: 'One', color: '#fff', emblem: 'A', kind: 'human' },
    { name: 'Two', color: '#000', emblem: 'B', kind: 'human' },
  ],
  rosterSize: 3,
  auction: G.DEFAULT_AUCTION,
  tournament: G.DEFAULT_TOURNAMENT,
  privacyScreens: false,
};

describe('game fight view', () => {
  it('defaults new games to cards and treats a missing old-save value as cards', () => {
    const game = G.newGame(setup, 123);
    expect(game.config.fightView).toBe('cards');
    const { fightView: _missingOnOldSaves, ...oldConfig } = game.config;
    const oldSave = oldConfig as typeof game.config;
    expect(oldSave.fightView ?? 'cards').toBe('cards');
    expect(arenaUses2D(oldSave.fightView, true)).toBe(false);
  });

  it('uses cards for everyone while 2D is switched off, even when 2D was chosen', () => {
    expect(arenaUses2D('2d', true)).toBe(false);
    expect(arenaUses2D('cards', true)).toBe(false);
  });

  it('once switched on, uses 2D only when selected and every fighter is drawable', () => {
    expect(arenaUses2D('2d', true, true)).toBe(true);
    expect(arenaUses2D('2d', false, true)).toBe(false);
    expect(arenaUses2D('cards', true, true)).toBe(false);
  });
});
