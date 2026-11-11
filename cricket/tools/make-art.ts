// Draws the home film's scenes with the local drawing app (ComfyUI, the recipe of the anime
// game's tools/make-hero.ts) using RealVisXL V5.0, a general model that knows cricket. Invented players only, no real people. Saved to
// public/art/<n>.webp. Runs offline, ~15 s a scene on an RTX 3060.
//
//   npx vite-node tools/make-art.ts            (draw missing scenes)
//   npx vite-node tools/make-art.ts --redo=4 --seed=2   (redraw one scene)
import fs from 'node:fs';
import path from 'node:path';

const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const OUT = path.resolve('public/art');
const W = 1344, H = 768, HW = 2560, HH = 1464;
const STYLE = 'cinematic sports poster art, dramatic digital painting, rich colors, volumetric floodlight beams, high detail, sharp focus';
const NEG = '(text, letters, words, numbers, writing on clothes, logo:1.4), baseball, baseball bat, baseball cap, baseball uniform, american football, soccer, robot, armor, text, logo, watermark, letters, blurry, deformed, extra limbs, bad hands';

/** The film's beats, in order (index = file name). Invented players only. */
export const SCENES = [
  'Aerial view of a huge oval cricket stadium at night, bright green outfield with a light brown cricket pitch in the centre, tall floodlight towers blazing, packed stands, city skyline behind, dramatic clouds, no people in close-up',
  'View from the top of the stands across a floodlit cricket ground at night, dark night sky, rows of fans seen from behind as dark silhouettes in the foreground, glowing phone lights, the bright green oval field and light brown pitch far below, floodlight towers with lens flare, no goal posts',
  'Backlit silhouettes of a cricket team in a tight huddle on the field at night, the blazing floodlights directly behind them so the players are dark shapes with orange rim light, heads bowed together, no visible faces, no visible writing, haze and light rays',
  'A grand auction stage in a dark hall seen from the back of the room: silhouettes of many people seated at round tables in the foreground, a bright stage far away with a podium and a giant glowing screen, dramatic spotlights and haze',
  'Silhouette of one cricket batsman in bright orange cricket jerseys with black sleeves and black trousers and a helmet after hitting a six, seen from behind at the crease, bat held high in follow-through, stumps beside him, the ball a tiny speck flying towards blazing floodlights, huge stadium crowd, rim light, haze',
  'Backlit silhouettes of a cricket team celebrating on the field at night, players jumping with arms raised, one single golden trophy held high in the centre glowing against the light, the blazing floodlights and fireworks behind them so the players are dark shapes with orange rim light, gold confetti, haze, no visible faces, no visible writing',
];

const args = process.argv.slice(2);
const redo = args.find((a) => a.startsWith('--redo='))?.slice(7);
const bump = Number(args.find((a) => a.startsWith('--seed='))?.slice(7) ?? 0);
/** --hq: no speed LoRA and real guidance, so the negative prompt (no lettering) is obeyed; ~4x slower. */
const hq = args.includes('--hq');

function graph(prompt: string, seed: number, prefix: string) {
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'RealVisXL_V5.0_fp16.safetensors' } },
    lora: { class_type: 'LoraLoader', inputs: { lora_name: 'dmd2_sdxl_4step_lora_fp16.safetensors', strength_model: hq ? 0 : 1, strength_clip: hq ? 0 : 1, model: ['ckpt', 0], clip: ['ckpt', 1] } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['lora', 1] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['lora', 1] } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    sample: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: 1, model: ['lora', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0], ...(hq ? { steps: 30, cfg: 5, sampler_name: 'dpmpp_2m', scheduler: 'karras' } : {}) } },
    base: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
    up: { class_type: 'ImageScale', inputs: { image: ['base', 0], upscale_method: 'lanczos', width: HW, height: HH, crop: 'disabled' } },
    enc: { class_type: 'VAEEncodeTiled', inputs: { pixels: ['up', 0], vae: ['ckpt', 2], tile_size: 768, overlap: 64, temporal_size: 64, temporal_overlap: 8 } },
    refine: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: 0.5, model: ['lora', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['enc', 0], ...(hq ? { steps: 20, cfg: 5, sampler_name: 'dpmpp_2m', scheduler: 'karras' } : {}) } },
    decode: { class_type: 'VAEDecodeTiled', inputs: { samples: ['refine', 0], vae: ['ckpt', 2], tile_size: 768, overlap: 64, temporal_size: 64, temporal_overlap: 8 } },
    save: { class_type: 'SaveAnimatedWEBP', inputs: { images: ['decode', 0], filename_prefix: prefix, fps: 1, lossless: false, quality: 86, method: 'default' } },
  };
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json() as Promise<T>;
}

async function run(g: Record<string, unknown>) {
  const { prompt_id } = await json<{ prompt_id: string }>(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g }) });
  for (let i = 0; i < 900; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await json<Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>; status?: { status_str?: string } }>>(`${COMFY}/history/${prompt_id}`);
    const e = h[prompt_id];
    if (e?.status?.status_str === 'error') throw new Error('ComfyUI reported an error');
    const img = e?.outputs && Object.values(e.outputs).flatMap((o) => o.images ?? [])[0];
    if (img) return img;
  }
  throw new Error('timed out');
}

fs.mkdirSync(OUT, { recursive: true });
for (let i = 0; i < SCENES.length; i++) {
  const file = path.join(OUT, `${i}.webp`);
  if (fs.existsSync(file) && redo !== String(i)) continue;
  const seed = 1009 + i * 7919 + bump * 104729;
  const img = await run(graph(`${SCENES[i]}, ${STYLE}`, seed, `ca_art/${i}`));
  const bytes = Buffer.from(await (await fetch(`${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`)).arrayBuffer());
  fs.writeFileSync(file, bytes);
  console.log(`scene ${i}: ${(bytes.length / 1024).toFixed(0)} KB`);
}
