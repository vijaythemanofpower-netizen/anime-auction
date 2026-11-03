import { expect, test, type Page } from '@playwright/test';

// Raid smoke test (offline, vs NPC): play an auction, open the Raid Boss tab, raid two villains and
// watch the fight at 4x, checking the arena stays on screen and nothing throws. Players reported
// black screens in online raids (Nov 3 2026).
const NOISE = [/favicon/i, /8188|\/comfy\//i, /ERR_CONNECTION_REFUSED/i];

test('offline raid plays without a black screen', async ({ browser }, info) => {
  test.setTimeout(20 * 60 * 1000);
  const page: Page = await (await browser.newContext()).newPage();
  await page.addInitScript(() => {
    const w = window as never as { __glMade: number; __glLost: number };
    w.__glMade = 0; w.__glLost = 0;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement & { __gl?: boolean }, type: string, ...rest: unknown[]) {
      const ctx = (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      if (ctx && /webgl/.test(type) && !this.__gl) { this.__gl = true; w.__glMade++; this.addEventListener('webglcontextlost', () => { w.__glLost++; }); }
      return ctx;
    } as typeof orig;
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.some((n) => n.test(m.text()))) errors.push(`console: ${m.text()}`); });

  await page.goto('/');
  const opening = page.getByRole('dialog', { name: 'Opening' });
  if (await opening.isVisible().catch(() => false)) await opening.getByRole('button', { name: /skip/i }).click().catch(() => {});
  await page.locator('.hpanel').first().getByRole('button', { name: /create new game/i }).click();
  await page.getByRole('group', { name: 'Number of players' }).getByRole('button', { name: /^2$/ }).click();
  await page.getByRole('group', { name: 'Human or NPC' }).nth(1).getByRole('button', { name: 'NPC' }).click();
  await page.getByRole('button', { name: /^Create game$/i }).click();
  await expect(page.getByRole('heading', { name: /build this game's auction pool/i })).toBeVisible({ timeout: 90_000 });
  const start = page.getByRole('button', { name: /^Start auction$/i });
  if (!(await start.isEnabled())) await page.getByRole('button', { name: /shuffle pool/i }).click();
  await start.click();
  for (let guard = 0; guard < 200; guard++) {
    if (await page.getByRole('heading', { name: /all rosters revealed/i }).isVisible().catch(() => false)) break;
    const bidder = page.getByTestId('local-bidder');
    const summary = await bidder.innerText().catch(() => '');
    const count = Number(summary.match(/Roster\s+(\d+)\/3/)?.[1] ?? 3);
    const bid = bidder.locator('button').filter({ hasText: /^\d[\d,]*$/ }).first();
    if (count < 3 && !/LEADING/.test(summary) && await bid.isEnabled().catch(() => false)) { await bid.click(); await page.waitForTimeout(1_200); }
    await page.waitForTimeout(400);
  }
  await expect(page.getByRole('heading', { name: /all rosters revealed/i })).toBeVisible({ timeout: 300_000 });
  while (await page.getByRole('button', { name: /reveal next fighter/i }).isVisible().catch(() => false)) await page.getByRole('button', { name: /reveal next fighter/i }).click();
  const done = page.getByRole('button', { name: /done .*hide my roster/i });
  if (await done.isVisible().catch(() => false)) await done.click();
  const begin = page.getByRole('button', { name: /begin tournament/i });
  if (await begin.isVisible().catch(() => false)) await begin.click();

  await page.getByRole('group', { name: 'Hub view' }).getByRole('button', { name: /raid boss/i }).click();
  // Players saw black screens from the third raid on: count live WebGL canvases and lost contexts per raid.
  const gl = () => page.evaluate(() => ({ live: [...document.querySelectorAll('canvas')].filter((c) => (c as HTMLCanvasElement & { __gl?: boolean }).__gl).length, made: (window as never as { __glMade: number }).__glMade, lost: (window as never as { __glLost: number }).__glLost }));
  const report: string[] = [];
  for (let raid = 1; raid <= 4; raid++) {
    const go = page.getByRole('button', { name: /^⚔ (Fight Level \d|New run from Level 1)/i });
    await go.click();
    const speed = page.getByRole('group', { name: 'Narration speed' }).getByRole('button', { name: '4×' });
    if (await speed.isVisible({ timeout: 15_000 }).catch(() => false)) await speed.click();
    for (let i = 0; i < 12; i++) {
      const main = await page.getByTestId('app-main').innerText().catch(() => '');
      if (!main.trim() || errors.length) {
        await page.screenshot({ path: `handoff-logs/e2e-raid/black-raid${raid}.png`, fullPage: true });
        throw new Error(`Black screen or error in raid ${raid} (step ${i}):\n${errors.join('\n')}\n${report.join('\n')}`);
      }
      await page.waitForTimeout(2_000);
    }
    await page.screenshot({ path: `handoff-logs/e2e-raid/raid${raid}.png` });
    const s = await gl();
    report.push(`raid ${raid}: live WebGL canvases ${s.live}, created so far ${s.made}, lost ${s.lost}`);
    expect(s.lost, report.join('\n')).toBe(0);
    await page.getByRole('button', { name: /^Close$/ }).first().click();
    await expect(page.getByRole('group', { name: 'Hub view' })).toBeVisible({ timeout: 15_000 });
  }
  const after = await gl();
  report.push(`back on the hub: live ${after.live}`);
  console.log(report.join('\n'));
  info.annotations.push({ type: 'webgl', description: report.join(' | ') });
  expect(errors, errors.join('\n')).toEqual([]);
});
