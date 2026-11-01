import { describe, expect, it } from 'vitest';
import { NO_DAMAGE, REGIONS, damagePercents, injuryRegion } from '../src/ui/bodyDamage';

describe('body damage', () => {
  it('turns hits per area into percentages that match the health lost', () => {
    const raw = NO_DAMAGE();
    raw.torso = 300; raw.head = 100;
    const p = damagePercents(raw, 600, 1000); // 40% of health gone
    expect(p.larm).toBe(0);
    expect(p.torso).toBeGreaterThan(0);
    // Weighted back by each area's share of the body, the areas add up to the overall loss.
    const share = { head: 0.14, torso: 0.38, larm: 0.1, rarm: 0.1, lleg: 0.14, rleg: 0.14 } as const;
    const total = REGIONS.reduce((n, r) => n + p[r] * share[r], 0);
    expect(Math.round(total)).toBe(40);
    expect(damagePercents(raw, 1000, 1000).torso).toBe(0); // fully healed
  });
  it('keeps an injured arm or leg on the same side', () => {
    expect(injuryRegion('legend:naruto', 'arm')).toBe(injuryRegion('legend:naruto', 'arm'));
    expect(['larm', 'rarm']).toContain(injuryRegion('x', 'arm'));
    expect(injuryRegion('x', 'head')).toBe('head');
  });
});
