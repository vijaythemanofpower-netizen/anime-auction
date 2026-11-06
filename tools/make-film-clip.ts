// One moving shot between two key pictures of the home page film, saved as numbered frames in
// .film-raw/clips/<name>/. Run after tools/make-film.ts has drawn the key pictures.
//   npx vite-node tools/make-film-clip.ts <name> <a.png> <b.png> "<motion prompt>" [--len=65] [--w=768] [--h=448] [--seed=1] [--nohands]
process.env.FILM_LIB = '1';
import fs from 'node:fs';
import path from 'node:path';

const { ltxClip, runFrames, upload } = await import('./make-film');
const args = process.argv.slice(2);
const opt = (k: string, d: number) => Number(args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);
const [name, a, b, prompt] = args.filter((x) => !x.startsWith('--'));
const dir = path.resolve('.film-raw/clips', name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const t = Date.now();
const frames = await runFrames(ltxClip(await upload(a), await upload(b), prompt, opt('w', 768), opt('h', 448), opt('len', 65), 900 + opt('seed', 1) * 7, `aa_film/clip_${name}`, args.includes('--nohands') ? ', hands, fingers, arms, reaching, touching face' : ''));
frames.forEach((f, i) => fs.writeFileSync(path.join(dir, `${String(i).padStart(3, '0')}.png`), f));
console.log(`${name}: ${frames.length} frames, ${((Date.now() - t) / 1000) | 0} s`);
