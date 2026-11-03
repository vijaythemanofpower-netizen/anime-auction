import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// These local-service requests are optional features and their refusal is harmless in CI.
// Keep this list narrow so application and Supabase errors still fail the test.
const HARMLESS_CONSOLE_NOISE = [
  /favicon\.ico.*(?:404|failed)/i,
  /127\.0\.0\.1:8188|localhost:8188|\/comfy\/.*(?:failed|refused|ERR_CONNECTION)/i,
  /ERR_CONNECTION_REFUSED.*(?:8188|comfy)/i,
];

type MonitoredPage = { page: Page; errors: string[] };

function monitor(page: Page): MonitoredPage {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (!HARMLESS_CONSOLE_NOISE.some((allow) => allow.test(value))) errors.push(`console.error: ${value}`);
  });
  return { page, errors };
}

async function healthy(player: MonitoredPage, battle = false) {
  const { page, errors } = player;
  const main = page.getByTestId('app-main');
  await expect(main).toBeVisible();
  await expect(main).not.toBeEmpty();
  await expect(page.getByTestId('error-boundary-fallback')).toHaveCount(0);
  if (battle) {
    const stage = page.getByTestId('arena-stage');
    await expect(stage).toBeVisible();
    const box = await stage.boundingBox();
    expect(box?.width, 'arena width').toBeGreaterThan(0);
    expect(box?.height, 'arena height').toBeGreaterThan(0);
  }
  expect(errors, `uncaught browser errors on ${page.url()}`).toEqual([]);
}

async function clickOnline(page: Page, tabSession = false) {
  await page.goto(tabSession ? '/?tab-session' : '/');
  await expect(page.getByTestId('app-main')).toBeVisible();
  await page.getByRole('button', { name: /play online/i }).first().click();
}

async function signInGuest(page: Page, name: string) {
  await expect(page.getByRole('heading', { name: /sign in to play online/i })).toBeVisible();
  await page.getByRole('button', { name: /play as guest/i }).click();
  const nameField = page.getByRole('textbox', { name: /player name/i });
  const friendsHeading = page.getByRole('heading', { name: /play with friends/i });
  // Anonymous sign-in completes asynchronously; don't mistake the transition from
  // the sign-in screen for a settled Rooms screen before the name prompt mounts.
  await expect.poll(async () =>
    (await nameField.isVisible().catch(() => false)) ||
    (await friendsHeading.isVisible().catch(() => false)),
  { timeout: 60_000 }).toBe(true);
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill(name);
    await page.getByRole('button', { name: /^save$/i }).click();
  }
  await expect(friendsHeading).toBeVisible({ timeout: 60_000 });
}

async function setSegment(page: Page, group: string, option: RegExp) {
  const row = page.getByRole('group', { name: group });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: option }).click();
}

async function enterOnlineRoom(browser: Browser, view: 'cards' | '2d') {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = monitor(await hostContext.newPage());
  const guest = monitor(await guestContext.newPage());
  await clickOnline(host.page);
  await signInGuest(host.page, `Host ${Date.now() % 100000}`);
  await host.page.getByRole('button', { name: /create a room/i }).click();
  await expect(host.page.getByRole('heading', { name: /room [A-HJ-NP-Z2-9]{6}/i })).toBeVisible({ timeout: 60_000 });
  const heading = await host.page.getByRole('heading', { name: /room/i }).innerText();
  const code = heading.match(/[A-HJ-NP-Z2-9]{6}/i)?.[0];
  expect(code, 'created room code').toBeTruthy();

  await clickOnline(guest.page, true);
  await signInGuest(guest.page, `Guest ${Date.now() % 100000}`);
  await guest.page.getByRole('textbox', { name: /room code/i }).fill(code!);
  await guest.page.getByRole('button', { name: /^join room$/i }).click();
  await expect(host.page.getByText(/Players \(2\//)).toBeVisible({ timeout: 90_000 });
  await expect(guest.page.getByRole('heading', { name: new RegExp(`Room ${code}`, 'i') })).toBeVisible({ timeout: 90_000 });
  await healthy(host);
  await healthy(guest);

  // Verify that this build exposes the view selector before attempting the 2D pass.
  const viewGroup = host.page.getByRole('group', { name: /default fight view/i });
  if (!(await viewGroup.isVisible().catch(() => false)) || !(await viewGroup.getByRole('button', { name: /^2d fighters$/i }).count())) {
    test.skip(view === '2d', 'The lobby does not expose the 2D fight view setting in this build.');
  }
  if (view === '2d') await setSegment(host.page, 'Default fight view', /^2d fighters$/i);
  else await setSegment(host.page, 'Default fight view', /^cards$/i);
  await setSegment(host.page, 'Roster size', /^3$/);
  await setSegment(host.page, 'Bid timer', /^10s$/);
  await host.page.getByRole('button', { name: /^start game \(2 players\)$/i }).click();
  await expect(host.page.getByText(/Build this game's auction pool/i)).toBeVisible({ timeout: 90_000 });
  await healthy(host);
  await healthy(guest);
  return { hostContext, guestContext, host, guest };
}

async function runOnlineAuction(host: Page, guest: Page, h: MonitoredPage, g: MonitoredPage) {
  await host.getByRole('button', { name: /^Auto-fill$/i }).click();
  await expect(host.getByRole('button', { name: /^Start auction$/i })).toBeEnabled();
  await host.getByRole('button', { name: /^Start auction$/i }).click();
  await expect(host.getByRole('heading', { name: /the auction floor/i })).toBeVisible({ timeout: 90_000 });
  await healthy(h);
  await healthy(g);

  // Each local player buys the minimum bid until their three roster slots are full.
  // The other player passes to close the lot quickly; after both rosters are full the
  // engine completes any remaining lots automatically.
  for (let guard = 0; guard < 90; guard++) {
    if (await host.getByRole('heading', { name: /all rosters revealed/i }).isVisible().catch(() => false)) break;
    const bidderHost = host.getByTestId('local-bidder');
    const bidderGuest = guest.getByTestId('local-bidder');
    const open = await host.getByRole('heading', { name: /the auction floor/i }).isVisible().catch(() => false);
    if (!open) {
      await host.waitForTimeout(350);
      continue;
    }
    const hText = await bidderHost.innerText().catch(() => '');
    const gText = await bidderGuest.innerText().catch(() => '');
    const hCount = Number(hText.match(/Roster\s+(\d+)\/3/)?.[1] ?? 3);
    const gCount = Number(gText.match(/Roster\s+(\d+)\/3/)?.[1] ?? 3);
    const hBid = bidderHost.getByRole('button', { name: /^100$/ });
    const gBid = bidderGuest.getByRole('button', { name: /^100$/ });
    const hPass = bidderHost.getByRole('button', { name: /^Pass$/i });
    const gPass = bidderGuest.getByRole('button', { name: /^Pass$/i });
    if (hCount < 3 && await hBid.isEnabled().catch(() => false)) await hBid.click();
    else if (gCount < 3 && await gBid.isEnabled().catch(() => false)) await gBid.click();
    if (await hPass.isEnabled().catch(() => false)) await hPass.click();
    if (await gPass.isEnabled().catch(() => false)) await gPass.click();
    await host.waitForTimeout(250);
  }

  await expect(host.getByRole('heading', { name: /all rosters revealed/i })).toBeVisible({ timeout: 180_000 });
  await healthy(h);
  await healthy(g);
  await expect(guest.getByText(/Character reveal/i).first()).toBeVisible({ timeout: 90_000 });
  for (const player of [host, guest]) {
    while (await player.getByRole('button', { name: /reveal next fighter/i }).isVisible().catch(() => false)) {
      await player.getByRole('button', { name: /reveal next fighter/i }).click();
    }
    const done = player.getByRole('button', { name: /done .*hide my roster/i });
    if (await done.isVisible().catch(() => false)) await done.click();
  }
  await expect(host.getByRole('button', { name: /begin tournament/i })).toBeVisible({ timeout: 120_000 });
  await healthy(h);
  await healthy(g);
  await host.getByRole('button', { name: /begin tournament/i }).click();
}

async function playNextMatch(host: Page, guest: Page, h: MonitoredPage, g: MonitoredPage, expected: RegExp) {
  await expect(host.getByText(expected).first()).toBeVisible({ timeout: 120_000 });
  await expect(guest.getByText(expected).first()).toBeVisible({ timeout: 120_000 });
  await healthy(h);
  await healthy(g);
  for (const player of [host, guest]) {
    const lock = player.getByRole('button', { name: /lock in preparation/i });
    if (await lock.isVisible().catch(() => false)) await lock.click();
  }
  await expect(host.getByRole('button', { name: /enter the arena/i })).toBeVisible({ timeout: 120_000 });
  await host.getByRole('button', { name: /enter the arena/i }).click();
  await expect(host.getByTestId('arena-stage')).toBeVisible({ timeout: 120_000 });
  await expect(guest.getByTestId('arena-stage')).toBeVisible({ timeout: 120_000 });
  await healthy(h, true);
  await healthy(g, true);
  const skip = host.getByRole('button', { name: /skip for all/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  else await host.getByRole('button', { name: /skip to results/i }).click();
  await expect(host.getByText(/final verdict/i)).toBeVisible({ timeout: 120_000 });
  await expect(guest.getByText(/final verdict/i)).toBeVisible({ timeout: 120_000 });
  await healthy(h);
  await healthy(g);
  const next = host.getByRole('button', { name: /^continue/i });
  if (await next.isVisible().catch(() => false)) {
    await next.click();
    const back = guest.getByRole('button', { name: /back to the tournament/i });
    if (await back.isVisible({ timeout: 10_000 }).catch(() => false)) await back.click();
  }
}

for (const view of ['cards', '2d'] as const) {
  test(`two online guests complete 1v1 and 2v2 battles (${view})`, async ({ browser }) => {
    test.setTimeout(12 * 60 * 1000);
    const room = await enterOnlineRoom(browser, view);
    try {
      await runOnlineAuction(room.host.page, room.guest.page, room.host, room.guest);
      await playNextMatch(room.host.page, room.guest.page, room.host, room.guest, /1v1 Solo Duel/i);
      await playNextMatch(room.host.page, room.guest.page, room.host, room.guest, /2v2 Tag Team/i);
    } finally {
      await Promise.all([room.hostContext.close(), room.guestContext.close()]);
    }
  });
}

test('single player vs NPC reaches a 2v2 battle without a blank arena', async ({ browser }) => {
  test.setTimeout(12 * 60 * 1000);
  const context: BrowserContext = await browser.newContext();
  const watched = monitor(await context.newPage());
  const page = watched.page;
  try {
    await page.goto('/');
    // The home page starts with a cinematic opening layer that intercepts
    // clicks while it plays. Dismiss it explicitly so this test can start the
    // game deterministically instead of retrying the covered button forever.
    const opening = page.getByRole('dialog', { name: 'Opening' });
    if (await opening.isVisible().catch(() => false)) {
      const skipOpening = opening.getByRole('button', { name: /skip/i });
      if (await skipOpening.isVisible().catch(() => false)) await skipOpening.click();
      await expect(opening).toHaveCount(0, { timeout: 15_000 });
    }
    await page.locator('.hpanel').first().getByRole('button', { name: /create new game/i }).click();
    await expect(page.getByRole('heading', { name: /create new game/i })).toBeVisible();
    await setSegment(page, 'Number of players', /^2$/);
    await page.getByRole('group', { name: 'Human or NPC' }).nth(1).getByRole('button', { name: 'NPC' }).click();
    await setSegment(page, 'Fighters in the auction', /built-in/i);
    await page.getByRole('button', { name: /^Create game$/i }).click();
    await expect(page.getByRole('heading', { name: /build this game's auction pool/i })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: /^Start auction$/i }).click();
    await expect(page.getByRole('heading', { name: /the auction floor/i })).toBeVisible({ timeout: 90_000 });
    await healthy(watched);
    const bidsByLot = new Map<string, number>();
    for (let guard = 0; guard < 120; guard++) {
      if (await page.getByRole('heading', { name: /all rosters revealed/i }).isVisible().catch(() => false)) break;
      const bidder = page.getByTestId('local-bidder');
      const summary = await bidder.innerText().catch(() => '');
      const count = Number(summary.match(/Roster\s+(\d+)\/3/)?.[1] ?? 3);
      const lotLine = await page.locator('.section-head .eyebrow').first().innerText().catch(() => '');
      const lot = lotLine.match(/Lot\s+#\s*(\d+)/i)?.[1] ?? lotLine;
      const attempts = bidsByLot.get(lot) ?? 0;
      const numericBid = bidder.locator('button').filter({ hasText: /^\d[\d,]*$/ }).first();
      // Bid once when idle and once more only if the NPC takes the lead. The pause
      // gives the NPC bidder time to respond instead of driving the price up by polling.
      const canBid = !/LEADING/.test(summary) && attempts < 2;
      if (count < 3 && canBid && await numericBid.isEnabled().catch(() => false)) {
        await numericBid.click();
        bidsByLot.set(lot, attempts + 1);
        await page.waitForTimeout(1_100);
      }
      await page.waitForTimeout(350);
    }
    await expect(page.getByRole('heading', { name: /all rosters revealed/i })).toBeVisible({ timeout: 240_000 });
    await page.getByRole('button', { name: /reveal next fighter/i }).click();
    while (await page.getByRole('button', { name: /reveal next fighter/i }).isVisible().catch(() => false)) await page.getByRole('button', { name: /reveal next fighter/i }).click();
    const finishReveal = page.getByRole('button', { name: /done .*hide my roster/i });
    if (await finishReveal.isVisible().catch(() => false)) await finishReveal.click();
    const begin = page.getByRole('button', { name: /begin tournament/i });
    if (await begin.isVisible().catch(() => false)) await begin.click();
    await expect(page.getByText(/1v1 Solo Duel/i).first()).toBeVisible({ timeout: 180_000 });
    await playSingleMatch(page, watched, /1v1 Solo Duel/i);
    await expect(page.getByText(/2v2 Tag Team/i).first()).toBeVisible({ timeout: 180_000 });
    await playSingleMatch(page, watched, /2v2 Tag Team/i);
    await healthy(watched);
  } finally {
    await context.close();
  }
});

async function playSingleMatch(page: Page, watched: MonitoredPage, mode: RegExp) {
  await expect(page.getByText(mode).first()).toBeVisible({ timeout: 120_000 });
    const lock = page.getByRole('button', { name: /lock in preparation/i });
    if (await lock.isVisible().catch(() => false)) await lock.click();
    await expect(page.getByRole('button', { name: /enter the arena/i })).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: /enter the arena/i }).click();
    await expect(page.getByTestId('arena-stage')).toBeVisible({ timeout: 120_000 });
    await healthy(watched, true);
    const skip = page.getByRole('button', { name: /skip to results/i });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await expect(page.getByText(/final verdict/i)).toBeVisible({ timeout: 120_000 });
    await healthy(watched);
    const next = page.getByRole('button', { name: /^continue/i });
    if (await next.isVisible().catch(() => false)) await next.click();
}
