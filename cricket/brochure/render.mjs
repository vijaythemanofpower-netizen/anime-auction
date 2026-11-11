// Prints brochure.html to an A4 PDF with the Edge already on this PC (no browser download).
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(dir, 'brochure.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: path.join(dir, 'Cricket-Auction-Brochure.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
// Preview images of each A4 page, to check the layout without a PDF viewer.
await page.setViewportSize({ width: 794, height: 1123 });
const pages = await page.$$('.page');
for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(dir, `preview-${i + 1}.png`) });
await browser.close();
console.log('ok');
