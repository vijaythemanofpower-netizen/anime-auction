import { describe, expect, it } from 'vitest';
import { KIT_MOVES, KITS, VILLAIN_KITS } from '../src/engine/data/kits';
import { LEGEND_MOVES } from '../src/engine/data/legendMoves';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { VILLAINS } from '../src/engine/data/villains';

describe('fighting kits', () => {
  it('have unique move ids that never clash with signature moves', () => {
    const ids = KIT_MOVES.map((m) => m.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    const clash = ids.filter((id) => LEGEND_MOVES.some((m) => m.id === id));
    expect(dupes).toEqual([]);
    expect(clash).toEqual([]);
  });
  it('cover every built-in character and every raid villain, each with a form and a secret', () => {
    expect(LEGEND_CHARACTERS.filter((c) => !KITS[c.id.slice(7)]).map((c) => c.name)).toEqual([]);
    expect(VILLAINS.filter((v) => !VILLAIN_KITS[v.name]).map((v) => v.name)).toEqual([]);
    for (const k of [...Object.values(KITS), ...Object.values(VILLAIN_KITS)]) {
      expect(k.forms.length).toBeGreaterThan(0);
      expect(k.secret.secret).toBeTruthy();
      for (const m of k.moves) if (m.form) expect(m.form).toBeLessThanOrEqual(k.forms.length);
    }
  });
});
