import { describe, expect, it } from 'vitest';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { VILLAINS } from '../src/engine/data/villains';
import { kitFor } from '../src/engine/data/kits';
import { generateHidden } from '../src/engine/hidden';
import baseline from './fixtures/roster-baseline.json';

// Adding new characters must not change the game for the existing ones (owner, Nov 3 2026):
// every character in the snapshot (taken before the new-character batches) must still exist with
// identical public data, kit and hidden stats. Do not edit this test or the snapshot to make a
// change pass; regenerate the snapshot only when an existing character is changed on purpose.
const now = new Map([...LEGEND_CHARACTERS, ...VILLAINS].map((c) => [c.id, c]));
const strip = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('existing roster stays the same', () => {
  for (const [id, was] of Object.entries(baseline as Record<string, { c: unknown; kit: unknown; hidden: unknown }>)) {
    it(id, () => {
      const c = now.get(id);
      expect(c, `${id} was removed`).toBeDefined();
      expect(strip(c)).toEqual(was.c);
      expect(strip(kitFor(c!.id, c!.name))).toEqual(was.kit);
      expect(strip(generateHidden(c!, 12345))).toEqual(was.hidden);
    });
  }
});
