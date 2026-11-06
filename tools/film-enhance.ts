// Restores detail in the film's frames. The video model's in-between frames come out soft and the
// eyes lose their glow, so every frame is enlarged and lightly redrawn by the still-image model.
// The same seed for every frame keeps the redraw steady from one frame to the next.
//   npx vite-node tools/film-enhance.ts c1 --frames=020,021 --denoise=0.3 [--out=test]
//   npx vite-node tools/film-enhance.ts --all --denoise=0.3 [--rest=25]     rests every 25 frames
process.env.FILM_LIB = '1';
import fs from 'node:fs';
import path from 'node:path';

const { run, upload, GOJO } = await import('./make-film');
const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const DENOISE = Number(opt('denoise') ?? 0.3);
const REST = Number(opt('rest') ?? 25);
// --tall: the vertical take for phones (clips v0, v1, ...).
const TALL = args.includes('--tall');
const W = TALL ? 880 : 1600, H = TALL ? 1600 : 880;
const OUT = opt('out') ?? (TALL ? 'hd-tall' : 'hd');

const LOOK = 'bright glowing blue eyes, detailed iris, sharp eyes, detailed skin texture, individual hair strands, detailed fabric, (photorealistic:1.3), (realistic:1.2), sharp focus, masterpiece, best quality, newest, absurdres';
const NEG = 'blurry, soft focus, smear, motion blur, dead eyes, empty eyes, blank eyes, deformed face, lowres, worst quality, bad quality, jpeg artifacts, text, watermark, multiple people';
/** What each clip shows, so the redraw knows what it is looking at. */
const CLIP: Record<string, string> = {
  c0: 'close-up, face, black blindfold, dark background, blue light on face',
  c1: 'upper body, blue lightning, glowing blue orb, storm clouds, floating rocks',
  c2: 'crimson red sky, red clouds, glowing orb, standing figure',
  c3: 'purple lightning, glowing purple sphere, violet light, grin',
  c4: 'silver moon, night, clouds, purple light',
  c5: 'huge full moon, night sky, silver moonlight, from behind, looking back over shoulder',
  c6: 'close-up, face, black blindfold, hand, black background',
};

function graph(image: string, prompt: string, prefix: string) {
  const tiled = { tile_size: 768, overlap: 64, temporal_size: 64, temporal_overlap: 8 };
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'NoobAI-XL-v1.1.safetensors' } },
    lora: { class_type: 'LoraLoader', inputs: { lora_name: 'dmd2_sdxl_4step_lora_fp16.safetensors', strength_model: 1, strength_clip: 1, model: ['ckpt', 0], clip: ['ckpt', 1] } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['lora', 1] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['lora', 1] } },
    img: { class_type: 'LoadImage', inputs: { image } },
    up: { class_type: 'ImageScale', inputs: { image: ['img', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'disabled' } },
    enc: { class_type: 'VAEEncodeTiled', inputs: { pixels: ['up', 0], vae: ['ckpt', 2], ...tiled } },
    sample: { class_type: 'KSampler', inputs: { seed: 4242, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: DENOISE, model: ['lora', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['enc', 0] } },
    dec: { class_type: 'VAEDecodeTiled', inputs: { samples: ['sample', 0], vae: ['ckpt', 2], ...tiled } },
    save: { class_type: 'SaveImage', inputs: { images: ['dec', 0], filename_prefix: prefix } },
  };
}

const clips = args.includes('--all') ? Object.keys(CLIP).map((c) => (TALL ? c.replace('c', 'v') : c)) : args.filter((a) => /^[cv]\d$/.test(a));
const only = opt('frames')?.split(',');
// Only the frames the film really uses (tools/pack-film.ts --list writes the list).
const take = new Set<string>(args.includes('--all') ? JSON.parse(fs.readFileSync(TALL ? '.film-raw/take-tall.json' : '.film-raw/take.json', 'utf8')) as string[] : []);
const total = take.size;
let done = 0;
for (const c of clips) {
  const dir = path.resolve('.film-raw/clips', c), out = path.resolve('.film-raw', OUT, c);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.png')).sort()) {
    if (only && !only.includes(f.slice(0, 3))) continue;
    if (total && !take.has(`${c}/${f}`)) continue;
    const dest = path.join(out, f);
    if (fs.existsSync(dest)) continue;
    const t = Date.now();
    const name = await upload(path.join(dir, f));
    fs.writeFileSync(dest, await run(graph(name, `${GOJO}, ${CLIP[c.replace('v', 'c')]}, ${LOOK}`, `aa_film/hd_${c}`)));
    done++;
    console.log(`${c}/${f} ${((Date.now() - t) / 1000).toFixed(1)} s (${done} done)`);
    if (done % REST === 0 && !only) await new Promise((r) => setTimeout(r, 30000));
  }
}
console.log(`done ${done}`);
