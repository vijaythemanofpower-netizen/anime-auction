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
const NEG = 'baseball, baseball bat, baseball cap, baseball uniform, american football, soccer, robot, armor, text, logo, watermark, letters, blurry, deformed, extra limbs, bad hands';

/** The film's beats, in order (index = file name). Invented players only. */
export const SCENES = [
  'Aerial view of a huge oval cricket stadium at night, bright green outfield with a light brown cricket pitch in the centre, tall floodlight towers blazing, packed stands, city skyline behind, dramatic clouds',
  'Cricket stadium stands at night seen from the boundary rope, blazing floodlights with lens flare, thousands of cheering fans waving flags and phone lights, confetti in the air',
  'A cricket team in navy blue jerseys standing in a huddle on a green cricket field at night, seen from behind, arms around shoulders, floodlights, stadium crowd blurred behind',
  'A cricket player auction on a stage: an auctioneer with a gavel at a podium, a giant screen behind him, team owners at tables raising numbered bidding paddles, dramatic spotlights, dark hall',
  'One single cricket batsman alone, hitting a huge six at night: white helmet with metal face grille, white batting pads on both legs, batting gloves, flat wide wooden cricket bat swung high, red cricket ball flying into the night sky, three plain wooden stumps behind him, floodlit stadium, low angle',
  'One single fast bowler alone in cricket whites at the moment of delivery, bowling arm straight up over his head releasing a red cricket ball, front foot landing on the pitch beside the wooden stumps and bails, dust flying, intense face, floodlit stadium at night',
  'A cricket team in navy blue jerseys celebrating on the field at night, the captain lifting a large golden trophy over his head, gold confetti and fireworks above the floodlit stadium',
];

const args = process.argv.slice(2);
const redo = args.find((a) => a.startsWith('--redo='))?.slice(7);
const bump = Number(args.find((a) => a.startsWith('--seed='))?.slice(7) ?? 0);

function graph(prompt: string, seed: number, prefix: string) {
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'RealVisXL_V5.0_fp16.safetensors' } },
    lora: { class_type: 'LoraLoader', inputs: { lora_name: 'dmd2_sdxl_4step_lora_fp16.safetensors', strength_model: 1, strength_clip: 1, model: ['ckpt', 0], clip: ['ckpt', 1] } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['lora', 1] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['lora', 1] } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    sample: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: 1, model: ['lora', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0] } },
    base: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
    up: { class_type: 'ImageScale', inputs: { image: ['base', 0], upscale_method: 'lanczos', width: HW, height: HH, crop: 'disabled' } },
    enc: { class_type: 'VAEEncodeTiled', inputs: { pixels: ['up', 0], vae: ['ckpt', 2], tile_size: 768, overlap: 64, temporal_size: 64, temporal_overlap: 8 } },
    refine: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: 0.5, model: ['lora', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['enc', 0] } },
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
