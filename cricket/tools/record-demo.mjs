// Records a ~2 minute gameplay demo by playing the game in Edge (Playwright) against the dev server:
// home film, setup, retentions, live bidding, squads, a match where you play every ball (timing
// meter), then a captain-only match (big calls, the match plays itself).
//   npm run dev   (in another terminal)   then   node tools/record-demo.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const URL = 'http://localhost:5174/';
const OUT = path.resolve('media');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
// Clicks give up quickly (a modal may be covering the button) instead of waiting 30 s.
const click = async (text, opts = {}) => { const b = page.getByRole('button', { name: text, ...opts }).first(); if (!(await b.count())) return false; try { await b.click({ timeout: 2500 }); return true; } catch { return false; } };
const answerCall = async () => { const o = page.locator('.modal:not(.play) .option'); if (await o.count()) { await o.nth(Math.floor(Math.random() * (await o.count()))).click(); return true; } return false; };

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(2000);

// 1. Home film (~12 s).
for (let i = 0; i < 70; i++) { await page.mouse.wheel(0, 75); await wait(120); }
await wait(1500);

// 2. Setup: IPL rules, three computer teams, play every ball (~5 s).
await page.evaluate(() => window.__store.go('setup'));
await wait(1200);
await click('3', { exact: true });
await wait(500);
await page.mouse.wheel(0, 500); await wait(800);
await click('Start the auction');
await wait(1800);

// 3. Retentions (~6 s).
const items = page.locator('.squad-item');
for (let i = 0; i < 3; i++) { await items.nth(i).click(); await wait(450); }
await wait(1000);
await click(/^Retain 3/);
await wait(2000);

// 4. Live bidding: bid on a few lots against the computer teams (~25 s), then finish.
for (let lot = 0; lot < 4; lot++) {
  for (let b = 0; b < 3; b++) {
    const bid = page.locator('.bid-btn:not([disabled])').first();
    if (await bid.count()) await bid.click();
    await wait(1100);
  }
  await wait(3200);
}
await click('Finish auction automatically'); await wait(700);
await click('Finish it'); await wait(2500);

// 5. Squads and the season hub (~7 s).
await page.mouse.wheel(0, 500); await wait(1200); await page.mouse.wheel(0, -500);
await click('Pick your playing XI'); await wait(2000);
await page.mouse.wheel(0, 450); await wait(1300); await page.mouse.wheel(0, -450); await wait(600);
await click('To the ground'); await wait(1500);

// 6. Match 1 — you play every ball (~30 s): pick a shot or delivery, stop the timing meter.
await page.evaluate(() => window.__store.settings({ speed: 2 }));
const t0 = Date.now();
while (Date.now() - t0 < 30000 && !(await page.locator('.result-hero').count())) {
  const play = page.locator('.modal.play');
  if (await play.count()) {
    const opts = play.locator('.option');
    if (await opts.count()) { await opts.nth(Math.floor(Math.random() * (await opts.count()))).click(); await wait(500 + Math.random() * 600); }
    const hit = play.locator('.btn.primary');
    if (await hit.count()) await hit.first().click();
    await wait(1300);
  } else { await answerCall(); await wait(700); }
}
// Fast-forward the rest of match 1 and show the result.
for (let n = 0; n < 150 && !(await page.locator('.result-hero').count()); n++) {
  if (await page.locator('.modal.play').count()) await click('Auto innings');
  else if (!(await answerCall())) await click('Skip to next call');
  await wait(250);
}
await page.locator('.result-hero').scrollIntoViewIfNeeded().catch(() => {});
await wait(3500);

// 7. Match 2 — captain only (~25 s): the match plays itself, you make the big calls.
await page.evaluate(() => {
  const s = window.__store;
  s.newGame({ humans: [{ id: 'h0', name: 'You', color: '#38bdf8' }], teamMode: 'teams', teams: [0], npcs: 3, mode: 'ipl', timer: 12, mystery: false, realNames: false, overs: 5, play: false });
  s.retain(s.get().game.franchises.find((f) => !f.npc).id, []);
  s.simulateRest(); s.toPrep(); s.playNext();
});
await wait(1200);
await page.evaluate(() => window.__store.settings({ speed: 4 }));
const t1 = Date.now();
while (Date.now() - t1 < 24000 && !(await page.locator('.result-hero').count())) {
  if (await answerCall()) await wait(1200); else await wait(500);
}
for (let n = 0; n < 150 && !(await page.locator('.result-hero').count()); n++) { if (!(await answerCall())) await click('Skip to next call'); await wait(250); }
await page.locator('.result-hero').scrollIntoViewIfNeeded().catch(() => {});
await wait(4000);

const video = page.video();
await ctx.close();
await browser.close();
const file = path.join(OUT, 'gameplay-sample.webm');
fs.renameSync(await video.path(), file);
console.log('saved', file);
