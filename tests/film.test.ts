import { describe, expect, it } from 'vitest';
import { clipStarts, ease, frameAt, gradeAt, presence, uAt, wordsFor } from '../src/ui/film/timeline';
import { loadOrder } from '../src/ui/film/FilmPlayer';

const CLIPS = [41, 41, 41, 41, 41, 41, 41];

describe('home page film script', () => {
  it('joins clips so each last frame is the next first frame', () => {
    const { starts, total } = clipStarts(CLIPS);
    expect(starts).toEqual([0, 40, 80, 120, 160, 200, 240]);
    expect(total).toBe(281);
  });

  it('always moves forward as you scroll, and lands exactly on the key poses', () => {
    let prev = -1;
    for (let u = 0; u <= 7; u += 0.01) {
      const f = frameAt(u, CLIPS);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
    for (let k = 0; k < 7; k++) expect(frameAt(k, CLIPS)).toBeCloseTo(k * 40, 6);
    expect(frameAt(7, CLIPS)).toBe(280);
    expect(frameAt(99, CLIPS)).toBe(280);
    expect(frameAt(-1, CLIPS)).toBe(0);
  });

  it('slows near key poses and is fastest between them', () => {
    const speed = (x: number) => (ease(x + 0.001) - ease(x)) / 0.001;
    expect(speed(0.5)).toBeGreaterThan(speed(0.02) * 3);
  });

  it('never leaves a colour undefined', () => {
    for (let u = -1; u <= 9; u += 0.13) {
      const g = gradeAt(u);
      for (const c of g.accent) expect(Number.isFinite(c)).toBe(true);
      expect(g.smoke).toBeGreaterThanOrEqual(0);
    }
  });

  it('only shows words near their own key pose', () => {
    expect(presence(3, 3)).toBe(1);
    expect(presence(3.5, 3)).toBeLessThanOrEqual(0.2);
    expect(presence(1, 3)).toBe(0);
  });

  it('has words for wide and tall screens at every scene that needs them', () => {
    for (const a of [1.8, 0.46]) {
      const at = new Set(wordsFor(a).map((w) => w.at));
      for (const k of [0, 1, 2, 3, 4, 5, 7]) expect(at.has(k)).toBe(true);
    }
  });

  it('maps scroll to position through a flat stretch', () => {
    const stops = [{ y: 0, u: 0 }, { y: 100, u: 5 }, { y: 200, u: 5 }, { y: 300, u: 7 }];
    expect(uAt(-5, stops)).toBe(0);
    expect(uAt(50, stops)).toBeCloseTo(2.5);
    expect(uAt(150, stops)).toBe(5);
    expect(uAt(250, stops)).toBe(6);
    expect(uAt(999, stops)).toBe(7);
  });

  it('loads every frame exactly once, coarse ones first', () => {
    const o = loadOrder(281);
    expect(new Set(o).size).toBe(281);
    expect(o.length).toBe(281);
    expect(o.slice(0, 3)).toEqual([0, 16, 32]);
  });
});
