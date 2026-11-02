// Draws the home page's cinematic scenes with the local drawing app (ComfyUI, the same
// models the comics use): three widescreen scenes per character world in
// src/ui/home/worlds.ts, saved to public/hero/<key>/<1-3>.webp. Runs offline.
//
//   npx vite-node tools/make-hero.ts naruto goku     (some worlds)
//   npx vite-node tools/make-hero.ts --all           (every world, ~15 s a scene)
//   --redo=naruto:2 --seed=3                         (redraw one scene that came out wrong)
import fs from 'node:fs';
import path from 'node:path';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { NEGATIVE, characterTags } from '../src/engine/comic';
import { WORLDS } from '../src/ui/home/worlds';

const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const OUT = path.resolve('public/hero');
const W = 1344, H = 768;

const args = process.argv.slice(2);
const redo = args.find((a) => a.startsWith('--redo='))?.slice(7);
const bump = Number(args.find((a) => a.startsWith('--seed='))?.slice(7) ?? 0);
const keys = redo ? [redo.split(':')[0]] : args.includes('--all') ? WORLDS.map((w) => w.key) : args.filter((a) => !a.startsWith('--'));
if (!keys.length) { console.log('Usage: npx vite-node tools/make-hero.ts <key...> | --all | --redo=key:n [--seed=N]'); process.exit(1); }

/** Look details the model forgets (same idea as the sprite tool). */
const HINT: Record<string, string> = {
  sukuna: 'pink hair, black facial markings, extra eyes under eyes', levi: 'short black hair, undercut', eren: 'brown hair, green eyes, male',
  jinwoo: 'short black hair, male, korean man', gojo: 'white spiky hair, tall man', tanjiro: 'burgundy hair, scar on forehead, hanafuda earrings',
};

function graph(prompt: string, seed: number, prefix: string) {
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'NoobAI-XL-v1.1.safetensors' } },
    lora: { class_type: 'LoraLoader', inputs: { lora_name: 'dmd2_sdxl_4step_lora_fp16.safetensors', strength_model: 1, strength_clip: 1, model: ['ckpt', 0], clip: ['ckpt', 1] } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['lora', 1] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: `${NEGATIVE}, multiple people, duplicate, clone, frame, border, scanlines, (text, logo, title, watermark, letters, signature, japanese text:1.5), (white border, frame:1.4), extra arms, deformed hands`, clip: ['lora', 1] } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    sample: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: 1, model: ['lora', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
    save: { class_type: 'SaveAnimatedWEBP', inputs: { images: ['decode', 0], filename_prefix: prefix, fps: 1, lossless: false, quality: 84, method: 'default' } },
  };
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json() as Promise<T>;
}

async function run(g: Record<string, unknown>): Promise<{ filename: string; subfolder: string; type: string }> {
  const { prompt_id } = await json<{ prompt_id: string }>(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g }) });
  for (let i = 0; i < 900; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await json<Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>; status?: { status_str?: string } }>>(`${COMFY}/history/${prompt_id}`);
    const entry = h[prompt_id];
    if (entry?.status?.status_str === 'error') throw new Error('ComfyUI reported an error');
    const img = entry?.outputs && Object.values(entry.outputs).flatMap((o) => o.images ?? [])[0];
    if (img) return img;
  }
  throw new Error('timed out');
}

for (const key of keys) {
  const world = WORLDS.find((w) => w.key === key);
  const c = LEGEND_CHARACTERS.find((x) => x.id === `legend:${key}`);
  if (!world || !c) { console.log(`skip ${key}: no world or built-in`); continue; }
  const dir = path.join(OUT, key);
  fs.mkdirSync(dir, { recursive: true });
  const who = characterTags(c, c.name).replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  for (let i = 0; i < world.scenes.length; i++) {
    const n = i + 1;
    const file = path.join(dir, `${n}.webp`);
    const forced = redo === `${key}:${n}`;
    if (fs.existsSync(file) && !forced) continue;
    const prompt = `${who}, ${HINT[key] ? `${HINT[key]}, ` : ''}solo, ${world.scenes[i].prompt}, best quality, newest, very aesthetic`;
    const seed = Math.abs([...`${key}:hero:${n}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 17)) + bump * 7919;
    const img = await run(graph(prompt, seed, `aa_hero/${key}_${n}`));
    const bytes = Buffer.from(await (await fetch(`${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`)).arrayBuffer());
    fs.writeFileSync(file, bytes);
    console.log(`${world.name} scene ${n}: ${(bytes.length / 1024).toFixed(0)} KB`);
  }
}
