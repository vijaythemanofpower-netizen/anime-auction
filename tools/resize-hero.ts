// Makes the 1280 and 1920 px copies of the home page scenes (public/hero/<key>/<n>-1280.webp, -1920.webp) that
// phones and small screens load instead of the 2560 px originals. Run after make-hero.ts:
//   npx vite-node tools/resize-hero.ts
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve('public/hero');
let n = 0;
for (const key of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, key);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!/^\d\.webp$/.test(f)) continue;
    const src = path.join(dir, f);
    for (const width of [1280, 1920]) {
      const out = path.join(dir, f.replace('.webp', `-${width}.webp`));
      if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(src).mtimeMs) continue;
      await sharp(src).resize({ width, kernel: 'lanczos3' }).webp({ quality: 88, effort: 5 }).toFile(out);
      n++;
    }
  }
}
console.log(`${n} small copies written`);
