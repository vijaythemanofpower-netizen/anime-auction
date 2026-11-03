// Contact sheets of every rig drawing (public/rigs/<key>/<form>/art.webp) for review by eye:
// handoff-logs/rig-sheet-<n>.jpg, 40 drawings per sheet, labelled key/form.
//   npx vite-node tools/rig-sheet.ts
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve('public/rigs');
const items = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())
  .flatMap((d) => fs.readdirSync(path.join(ROOT, d.name)).filter((f) => fs.existsSync(path.join(ROOT, d.name, f, 'art.webp'))).map((f) => `${d.name}/${f}`));
const W = 160, H = 234, COLS = 10, PER = 40;
async function main() {
  for (let s = 0; s * PER < items.length; s++) {
    const page = items.slice(s * PER, (s + 1) * PER);
    const rows = Math.ceil(page.length / COLS);
    const tiles = await Promise.all(page.map(async (it, i) => {
      const img = await sharp(path.join(ROOT, it, 'art.webp')).resize(W, H - 20, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).toBuffer();
      const label = Buffer.from(`<svg width="${W}" height="20"><text x="4" y="15" font-size="13" font-family="sans-serif">${it}</text></svg>`);
      return [{ input: img, left: (i % COLS) * W, top: Math.floor(i / COLS) * H }, { input: label, left: (i % COLS) * W, top: Math.floor(i / COLS) * H + H - 20 }];
    }));
    const out = path.resolve(`handoff-logs/rig-sheet-${s + 1}.jpg`);
    await sharp({ create: { width: COLS * W, height: rows * H, channels: 3, background: '#ffffff' } }).composite(tiles.flat()).jpeg({ quality: 80 }).toFile(out);
    console.log(out);
  }
}
void main();
