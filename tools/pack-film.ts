// Joins the film's clips (.film-raw/clips/c0, c1, ...) into one numbered take for the home page:
// public/film/<width>/f/NNNN.webp, cut-out masks in public/film/m/, stills of the key poses in
// public/film/key/ (used for the first paint and with reduced motion), and manifest.json.
//   npx vite-node tools/pack-film.ts [--keep=2] [--masks]     --masks also cuts him out of every frame
process.env.FILM_LIB = '1';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const { cut, run, upload } = await import('./make-film');
const args = process.argv.slice(2);
const KEEP = Number(args.find((a) => a.startsWith('--keep='))?.slice(7) ?? 2);
// --tall packs the vertical take for phones (clips v0, v1, ...) into public/film/tall.
const TALL = args.includes('--tall');
const SIZES = TALL ? [880, 600] : [1600, 1000, 640];
const QUALITY: Record<number, number> = { 1600: 78, 1000: 74, 880: 76, 640: 68, 600: 70 };
const W = TALL ? 880 : 1600, H = TALL ? 1600 : 880;
const HD = TALL ? 'hd-tall' : 'hd', MASKS = TALL ? 'masks-tall' : 'masks', TAKE = TALL ? 'take-tall.json' : 'take.json';
const RAW = path.resolve('.film-raw/clips');
const OUT = path.resolve(TALL ? 'public/film/tall' : 'public/film');
const KEYS = TALL ? ['v0-draft-1', 'v1-draft-1', 'v2-draft-1', 'v3-draft-1', 'v4-draft-1', 'v5-draft-2', 'v6-draft-2', 'v7-draft-2'] : ['s1-2', 'k2-3', 'm3-1', 'k4-1', 'k5-1', 'k6-2', 'k7-1', 'k8-3'];

/** How much the picture changes from each frame to the next (small greyscale copies compared). */
async function changes(files: string[]): Promise<number[]> {
  const small = await Promise.all(files.map((f) => sharp(f).resize(64, 36, { fit: 'fill' }).greyscale().raw().toBuffer()));
  return small.slice(1).map((b, i) => { let d = 0; for (let k = 0; k < b.length; k++) d += Math.abs(b[k] - small[i][k]); return d / b.length; });
}
/** Picks frames evenly spaced by change, not by time: a clip that does all its moving in the first
 *  half would otherwise sit still for half its scroll. Always keeps the first and last frame. */
function evenByMotion(files: string[], diffs: number[], count: number): string[] {
  const floor = Math.max(...diffs) * 0.06; // A little weight everywhere, so nothing is skipped outright.
  const cum = [0];
  for (const d of diffs) cum.push(cum[cum.length - 1] + d + floor);
  const out: string[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const want = (cum[cum.length - 1] * i) / (count - 1);
    while (j < cum.length - 1 && cum[j] < want) j++;
    if (out[out.length - 1] !== files[j]) out.push(files[j]);
  }
  return out;
}

const CUT: Record<string, [number, number]> = { v0: [14, 33] };

const clipDirs = fs.readdirSync(RAW).filter((d) => (TALL ? /^v\d+$/ : /^c\d+$/).test(d)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const clips: number[] = [];
const take: string[] = [];
for (let n = 0; n < clipDirs.length; n++) {
  const d = clipDirs[n];
  // Stretches the video model got wrong (hands reaching in): cut, the smoke covers the jump.
  const cut = CUT[d];
  const files = fs.readdirSync(path.join(RAW, d)).filter((f) => f.endsWith('.png') && !(cut && Number(f.slice(0, 3)) >= cut[0] && Number(f.slice(0, 3)) <= cut[1])).sort().map((f) => path.join(RAW, d, f));
  const kept = evenByMotion(files, await changes(files), Math.ceil(files.length / KEEP));
  clips.push(kept.length);
  take.push(...kept.slice(n === 0 ? 0 : 1));
}

fs.writeFileSync(path.resolve('.film-raw', TAKE), JSON.stringify(take.map((f) => path.relative(RAW, f).split(path.sep).join('/'))));
if (args.includes('--list')) { console.log(`${take.length} frames listed`); process.exit(0); }

/** The original's light and colour, with the fine detail (and some of the eye glow) of its redraw. */
async function merged(rawFile: string, hdFile: string, sigma = 5, lowMix = 0.4) {
  const load = (f: string, blur: number) => { let p = sharp(f).removeAlpha().resize(W, H, { fit: 'fill', kernel: 'lanczos3' }); if (blur) p = p.blur(blur); return p.raw().toBuffer(); };
  const [r, rb, e, eb] = await Promise.all([load(rawFile, 0), load(rawFile, sigma), load(hdFile, 0), load(hdFile, sigma)]);
  const out = Buffer.alloc(r.length);
  for (let i = 0; i < r.length; i++) {
    const v = rb[i] + (eb[i] - rb[i]) * lowMix + (e[i] - eb[i]);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

// The wide film's folder holds the tall one: keep it when re-packing the wide film.
for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (f !== 'tall') fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
for (const s of SIZES) fs.mkdirSync(path.join(OUT, String(s), 'f'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'm'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'key'), { recursive: true });

const name = (i: number) => `${String(i).padStart(4, '0')}.webp`;
let bytes = 0, maskBytes = 0;
for (let i = 0; i < take.length; i++) {
  const hd = take[i].replace(RAW, path.resolve('.film-raw', HD));
  const source = fs.existsSync(hd) ? await merged(take[i], hd) : take[i];
  for (const s of SIZES) {
    const file = path.join(OUT, String(s), 'f', name(i));
    await sharp(source).resize({ width: s, kernel: 'lanczos3' }).webp({ quality: QUALITY[s], effort: 5 }).toFile(file);
    if (s === SIZES[0]) bytes += fs.statSync(file).size;
  }
  const maskPng = path.resolve('.film-raw', MASKS, `${String(i).padStart(4, '0')}.png`);
  if (args.includes('--masks') && !fs.existsSync(maskPng)) {
    fs.mkdirSync(path.dirname(maskPng), { recursive: true });
    fs.writeFileSync(maskPng, await run(cut(await upload(take[i]), `aa_film/mask${i}`)));
  }
  if (fs.existsSync(maskPng)) {
    const file = path.join(OUT, 'm', name(i));
    await sharp(maskPng).ensureAlpha().extractChannel('alpha').resize({ width: 320 }).webp({ quality: 55, effort: 5 }).toFile(file);
    maskBytes += fs.statSync(file).size;
  } else {
    await sharp({ create: { width: 16, height: 9, channels: 3, background: '#000' } }).webp().toFile(path.join(OUT, 'm', name(i)));
  }
  if (i % 40 === 0) console.log(`frame ${i} of ${take.length}`);
}
for (let i = 0; i < KEYS.length; i++) await sharp(path.resolve('.film-raw', `${KEYS[i]}.png`)).resize({ width: TALL ? 880 : 1920 }).webp({ quality: 80, effort: 5 }).toFile(path.join(OUT, 'key', `${i}.webp`));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ sizes: SIZES, w: W, h: H, clips }));
console.log(`${take.length} frames, largest set ${(bytes / 1e6).toFixed(1)} MB, masks ${(maskBytes / 1e6).toFixed(1)} MB; clips ${clips.join(' ')}`);
