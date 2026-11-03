import { describe, expect, it } from 'vitest';
import { ANIMS } from '../src/ui/rig/animations';

describe('rig animation library', () => {
  it('has ordered keys spanning the full animation', () => {
    for (const [name, animation] of Object.entries(ANIMS)) {
      expect(animation.keys.length, name).toBeGreaterThanOrEqual(2);
      expect(animation.keys[0].t, name).toBe(0);
      expect(animation.keys.at(-1)?.t, name).toBe(1);
      for (let i = 1; i < animation.keys.length; i++) expect(animation.keys[i].t, name).toBeGreaterThanOrEqual(animation.keys[i - 1].t);
    }
  });

  it('keeps rotations and impact markers within their valid ranges', () => {
    for (const [name, animation] of Object.entries(ANIMS)) {
      if (animation.impact !== undefined) expect(animation.impact, name).toBeGreaterThanOrEqual(0);
      if (animation.impact !== undefined) expect(animation.impact, name).toBeLessThanOrEqual(1);
      for (const key of animation.keys) {
        for (const rotation of Object.values(key.pose.rot)) {
          expect(Number.isFinite(rotation), name).toBe(true);
          expect(rotation, name).toBeGreaterThanOrEqual(-180);
          expect(rotation, name).toBeLessThanOrEqual(180);
        }
      }
    }
  });

  it('ends knockdown and defeated lying on the ground', () => {
    for (const name of ['knockdown', 'defeated'] as const) {
      expect(Math.abs(ANIMS[name].keys.at(-1)!.pose.rot.pelvis ?? 0), name).toBeGreaterThanOrEqual(70);
      expect(ANIMS[name].keys.at(-1)!.pose.y, name).toBeGreaterThan(0);
    }
  });

  it('seamlessly loops every looped animation', () => {
    for (const [name, animation] of Object.entries(ANIMS)) {
      if (!animation.loop) continue;
      expect(animation.keys.at(-1)!.pose, name).toEqual(animation.keys[0].pose);
    }
  });
});
