// Draws the home page film (src/ui/film/) with the local drawing app (ComfyUI + NoobAI-XL + DMD2).
// One character, Gojo, through one continuous shot list. Runs offline; raw drawings stay in
// .film-raw/ (not published) and tools/pack-film.ts turns the chosen ones into public/film/.
//
//   npx vite-node tools/make-film.ts --draft s1 s3 --seed=1,2    fast drafts, no detail pass
//   npx vite-node tools/make-film.ts s1 --seed=3                 final drawing of one shot
//   npx vite-node tools/make-film.ts --list                      the shot names
import fs from 'node:fs';
import path from 'node:path';
import { NEGATIVE } from '../src/engine/comic';

const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const RAW = path.resolve('.film-raw');

const STYLE = '(photorealistic:1.4), (realistic:1.3), hyperrealistic, cinematic photo, 35mm lens, detailed skin texture, skin pores, individual hair strands, detailed fabric texture, sharp focus, ray tracing, hdr, depth of field, movie still, masterpiece, best quality, newest, absurdres';
export const GOJO = 'gojou satoru, jujutsu kaisen, 1boy, solo, male focus, (adult man, 28 years old:1.2), mature male, white hair, spiky hair, pale skin, dark navy high collar jacket';
export const NEG = 'anime screencap, flat, smooth skin, plastic, airbrushed, 2d, flat color, cel shading, thick outlines, neon outlines, outline, lineart, vector, lowres, worst quality, bad quality, bad anatomy, bad hands, extra digits, missing fingers, jpeg artifacts, text, logo, watermark, signature, username, multiple people, duplicate, clone, female, chibi, sketch, border, frame, nsfw, nude, blood, scar';
export const SCENE_NEG = 'anime screencap, flat, 2d, flat color, thick outlines, lineart, vector, lowres, worst quality, bad quality, jpeg artifacts, text, logo, watermark, signature, border, frame, 1boy, 1girl, person, people, character, human, silhouette, cars';

export interface Shot { w: number; h: number; prompt: string; neg?: string }
const DARK = 'white background, bright background, grey background, simple background';
export const SHOTS: Record<string, Shot> = {
  // Close-up: blindfolded, right of frame, smoke behind him.
  s1: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, hand, fingers, mask, domino mask`, prompt: `${GOJO}, black blindfold covering eyes, (close-up:1.2), face focus, head and shoulders, (face on the right side of frame:1.3), three-quarter view, slight smirk, white hair falling over the blindfold, (pitch black background:1.4), dark smoke, low key lighting, thin cold rim light from behind, ${STYLE}` },
  // Crimson ruined city, wide and empty: the plate the camera pulls back to.
  p2: { w: 1536, h: 640, neg: SCENE_NEG, prompt: `scenery, no humans, (extreme wide shot:1.3), ruined tokyo city street at dusk, collapsed skyscrapers, crimson red sky, red fog, huge rubble, floating debris, cracked road running to the horizon, dark silhouettes of buildings, volumetric red light, ${STYLE}` },
  // Full body, out of the red fog, Reversal Red in his hand.
  f2: { w: 832, h: 1216, neg: `${NEG}, ${DARK}`, prompt: `${GOJO}, black blindfold, (full body:1.4), standing, facing viewer, one arm raised forward, (glowing red energy orb in hand:1.3), red rim light, crimson light from behind, dark red fog background, jacket and hair blowing in wind, feet, black pants, ${STYLE}` },
  // Electric blue, waist up, eyes open.
  m3: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, blindfold`, prompt: `${GOJO}, (bright blue glowing eyes:1.4), upper body, right hand raised, (crackling electric blue energy orb in hand:1.3), blue lightning, hair lifted by wind, confident smirk, looking at viewer, dark stormy night background, blue light on face, floating rubble, ${STYLE}` },
  // Hollow Purple: hand forward, a violet sphere between us and him.
  m4: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, blindfold`, prompt: `${GOJO}, (bright blue glowing eyes:1.4), upper body, arm extended toward viewer, foreshortening, (huge glowing purple energy sphere in front of hand:1.5), violet lightning, purple light on face, hair blown back, grin, dark void background, debris, ${STYLE}` },
  // Silver aftermath: the crater under a huge moon.
  p5: { w: 1536, h: 640, neg: SCENE_NEG, prompt: `scenery, no humans, (extreme wide shot:1.3), vast circular crater, erased city, (huge full moon:1.3), silver moonlight, dark night sky, thin silver mist, broken ground, dust settling, monochrome silver and black, ${STYLE}` },
  // From behind, looking back over his shoulder under the moon.
  b5: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, blindfold, chains, keys, weapon, hand`, prompt: `${GOJO}, (from behind:1.3), (looking back over shoulder:1.4), upper body, (bright blue eyes:1.3), small smile, silver moonlight, dark night sky, huge moon behind him, white hair blowing, cold silver rim light, ${STYLE}` },
  // The continuous take: k1 (s1) -> k2 -> k3 (m3) -> k4 -> k5 -> k6 -> k7 -> k8.
  k2: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, hand, fingers, sunglasses`, prompt: `${GOJO}, black cloth blindfold pulled down around his neck, (bright glowing blue eyes:1.4), (close-up:1.2), face focus, head and shoulders, (face on the right side of frame:1.3), looking at viewer, slight smirk, white hair, (pitch black background:1.4), dark smoke, faint blue light on face, ${STYLE}` },
  k4: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, blindfold`, prompt: `${GOJO}, (wide shot:1.3), (full body:1.3), (small figure in the distance:1.2), man standing on rubble in a ruined tokyo street, one arm raised, (glowing red energy orb in hand:1.3), collapsed skyscrapers, crimson red sky, red fog, floating debris, volumetric red light, ${STYLE}` },
  k5: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, blindfold, sphere on face`, prompt: `${GOJO}, (bright glowing blue eyes:1.3), upper body, three-quarter view, (face and body on the right third of frame:1.4), one arm extended to the left, (huge glowing purple energy sphere on the left side of frame:1.5), violet lightning, purple light on face, hair blown back, confident grin, ruined city at night, floating debris, ${STYLE}` },
  k6: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, blindfold, face`, prompt: `${GOJO}, (from behind:1.4), (full body:1.2), (extremely small figure:1.3), standing on the edge of a vast circular crater, erased city, (huge full moon:1.3), silver moonlight, dark night sky, thin silver mist, dust settling, monochrome silver and black, wide shot, ${STYLE}` },
  k7: { w: 1344, h: 768, neg: `${NEG}, ${DARK}, blindfold, chains, weapon, hand`, prompt: `${GOJO}, (from behind:1.3), (looking back over shoulder:1.4), upper body, (bright blue eyes:1.3), small smile, night, huge full moon behind him, silver moonlight, white hair blowing, cold silver rim light, ${STYLE}` },
  k8: { w: 1344, h: 768, neg: `${NEG}, ${DARK}`, prompt: `${GOJO}, (close-up:1.2), face focus, (face on the right side of frame:1.2), one hand pulling a black cloth blindfold up over his eyes, one bright blue eye still visible, smirk, looking at viewer, dark night, cold silver moonlight on hair, black background, ${STYLE}` },
  // The vertical take for phones: the same story, composed upright, face in the upper middle.
  v0: { w: 768, h: 1344, neg: `${NEG}, ${DARK}, hand, fingers, mask, domino mask`, prompt: `${GOJO}, black blindfold covering eyes, (close-up:1.2), portrait, head and shoulders, head bowed, face centered in frame, slight smirk, white hair falling over the blindfold, (pitch black background:1.4), dark smoke, low key lighting, thin cold rim light, ${STYLE}` },
  v1: { w: 768, h: 1344, neg: `${NEG}, ${DARK}, hand, fingers, sunglasses, blindfold`, prompt: `${GOJO}, (bright glowing blue eyes:1.4), (close-up:1.2), portrait, head and shoulders, face centered in frame, looking at viewer, slight smirk, white hair, (pitch black background:1.4), dark smoke, blue light on face, ${STYLE}` },
  v2: { w: 768, h: 1344, neg: `${NEG}, ${DARK}, blindfold`, prompt: `${GOJO}, (bright blue glowing eyes:1.4), cowboy shot, facing viewer, one hand raised in front of his chest, (crackling electric blue energy orb in hand:1.3), blue lightning, hair lifted by wind, confident smirk, looking at viewer, dark stormy night sky, blue light on face, floating rubble, ${STYLE}` },
  v3: { w: 768, h: 1344, neg: `${NEG}, ${DARK}, blindfold`, prompt: `${GOJO}, (full body:1.3), (from below:1.1), man standing on rubble in a destroyed tokyo street, one arm raised, (glowing red energy orb in hand:1.3), collapsed skyscrapers, ruined buildings, crimson red sky, red fog, floating debris, volumetric red light, ${STYLE}` },
  v4: { w: 768, h: 1344, neg: `${NEG}, ${DARK}, blindfold, sphere on face`, prompt: `${GOJO}, (bright glowing blue eyes:1.3), cowboy shot, one arm raised high, (huge glowing purple energy sphere above his hand:1.5), violet lightning, purple light on face, hair blown back, confident grin, ruined city at night, floating debris, ${STYLE}` },
  v5: { w: 768, h: 1344, neg: `${NEG}, ${DARK}, blindfold, face`, prompt: `${GOJO}, (from behind:1.4), (full body:1.2), standing on a ruined cliff, (huge full moon above him:1.3), silver moonlight, dark night sky, silver clouds, dust settling, mountains in the distance, ${STYLE}` },
  v6: { w: 768, h: 1344, neg: `${NEG}, ${DARK}, blindfold, chains, weapon, hand`, prompt: `${GOJO}, (from behind:1.3), (looking back over shoulder:1.4), upper body, (bright blue eyes:1.3), small smile, night, full moon above him, silver moonlight, white hair blowing, cold silver rim light, ${STYLE}` },
  v7: { w: 768, h: 1344, neg: `${NEG}, ${DARK}`, prompt: `${GOJO}, (close-up:1.2), portrait, face centered in frame, one hand pulling a black cloth blindfold up over his forehead, bright blue eyes visible, smirk, looking at viewer, dark night, cold silver moonlight on hair, black background, ${STYLE}` },
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json() as Promise<T>;
}
export async function run(g: Record<string, unknown>): Promise<Buffer> {
  const { prompt_id } = await json<{ prompt_id: string }>(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g }) });
  for (let i = 0; i < 900; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await json<Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>; status?: { status_str?: string; messages?: unknown } }>>(`${COMFY}/history/${prompt_id}`);
    const e = h[prompt_id];
    if (e?.status?.status_str === 'error') throw new Error(`ComfyUI error: ${JSON.stringify(e.status.messages).slice(0, 600)}`);
    const img = e?.outputs && Object.values(e.outputs).flatMap((o) => o.images ?? [])[0];
    if (img) return Buffer.from(await (await fetch(`${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`)).arrayBuffer());
  }
  throw new Error('timed out');
}
/** Runs a graph that saves many frames; returns them in order. */
export async function runFrames(g: Record<string, unknown>): Promise<Buffer[]> {
  const { prompt_id } = await json<{ prompt_id: string }>(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g }) });
  for (let i = 0; i < 1800; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await json<Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>; status?: { status_str?: string; messages?: unknown } }>>(`${COMFY}/history/${prompt_id}`);
    const e = h[prompt_id];
    if (e?.status?.status_str === 'error') throw new Error(`ComfyUI error: ${JSON.stringify(e.status.messages).slice(0, 800)}`);
    const imgs = e?.outputs && Object.values(e.outputs).flatMap((o) => o.images ?? []);
    if (imgs?.length) return Promise.all(imgs.map(async (img) => Buffer.from(await (await fetch(`${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`)).arrayBuffer())));
  }
  throw new Error('timed out');
}
/**
 * One moving shot with LTX-Video: starts exactly on picture `a`, ends exactly on picture `b`, and the
 * model paints the motion between them. A clip's last picture is the next clip's first, so all of
 * them join into one unbroken take. Sizes: multiples of 32; length: 8n + 1 frames.
 */
export function ltxClip(a: string, b: string, prompt: string, w: number, h: number, len: number, seed: number, prefix: string, extraNeg = '') {
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'ltxv-2b-0.9.8-distilled-fp8.safetensors' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp8_e4m3fn.safetensors', type: 'ltxv' } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['clip', 0] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: 'worst quality, blurry, morphing, melting, distorted face, deformed hands, extra limbs, flicker, scene cut, text, watermark, second person' + extraNeg, clip: ['clip', 0] } },
    imgA: { class_type: 'LoadImage', inputs: { image: a } },
    imgB: { class_type: 'LoadImage', inputs: { image: b } },
    preA: { class_type: 'LTXVPreprocess', inputs: { image: ['imgA', 0], img_compression: 20 } },
    preB: { class_type: 'LTXVPreprocess', inputs: { image: ['imgB', 0], img_compression: 20 } },
    empty: { class_type: 'EmptyLTXVLatentVideo', inputs: { width: w, height: h, length: len, batch_size: 1 } },
    g1: { class_type: 'LTXVAddGuide', inputs: { positive: ['pos', 0], negative: ['neg', 0], vae: ['ckpt', 2], latent: ['empty', 0], image: ['preA', 0], frame_idx: 0, strength: 1 } },
    g2: { class_type: 'LTXVAddGuide', inputs: { positive: ['g1', 0], negative: ['g1', 1], vae: ['ckpt', 2], latent: ['g1', 2], image: ['preB', 0], frame_idx: len - 1, strength: 1 } },
    cond: { class_type: 'LTXVConditioning', inputs: { positive: ['g2', 0], negative: ['g2', 1], frame_rate: 24 } },
    sched: { class_type: 'LTXVScheduler', inputs: { steps: 8, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ['g2', 2] } },
    sel: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    sample: { class_type: 'SamplerCustom', inputs: { model: ['ckpt', 0], add_noise: true, noise_seed: seed, cfg: 1, positive: ['cond', 0], negative: ['cond', 1], sampler: ['sel', 0], sigmas: ['sched', 0], latent_image: ['g2', 2] } },
    crop: { class_type: 'LTXVCropGuides', inputs: { positive: ['cond', 0], negative: ['cond', 1], latent: ['sample', 0] } },
    dec: { class_type: 'VAEDecodeTiled', inputs: { samples: ['crop', 2], vae: ['ckpt', 2], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 } },
    save: { class_type: 'SaveImage', inputs: { images: ['dec', 0], filename_prefix: prefix } },
  };
}
export async function upload(file: string): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(file)]), path.basename(file));
  form.append('overwrite', 'true');
  return (await json<{ name: string }>(`${COMFY}/upload/image`, { method: 'POST', body: form })).name;
}
const base = (pos: string, neg: string) => ({
  ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'NoobAI-XL-v1.1.safetensors' } },
  pos: { class_type: 'CLIPTextEncode', inputs: { text: pos, clip: ['ckpt', 1] } },
  neg: { class_type: 'CLIPTextEncode', inputs: { text: neg, clip: ['ckpt', 1] } },
});
// No speed LoRA here: the full sampler (about 25 s a picture) is what gives the painted look,
// and at cfg 5 the negative prompt really works.
const ks = (seed: number, denoise: number, latent: [string, number]) => ({ class_type: 'KSampler', inputs: { seed, steps: denoise >= 1 ? 26 : Math.ceil(26 * Math.max(denoise, 0.5)) + 6, cfg: 5, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise, model: ['ckpt', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: latent } });
const tiled = { tile_size: 768, overlap: 64, temporal_size: 64, temporal_overlap: 8 };

/** A first drawing, then (unless draft) a detail pass at 1.75x. */
export function txt(s: Shot, seed: number, prefix: string, draft: boolean) {
  const neg = s.neg ?? NEG;
  const hw = Math.round((s.w * 1.75) / 8) * 8, hh = Math.round((s.h * 1.75) / 8) * 8;
  const g: Record<string, unknown> = { ...base(s.prompt, neg),
    latent: { class_type: 'EmptyLatentImage', inputs: { width: s.w, height: s.h, batch_size: 1 } },
    sample: ks(seed, 1, ['latent', 0]),
    dec: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
  };
  if (draft) g.save = { class_type: 'SaveImage', inputs: { images: ['dec', 0], filename_prefix: prefix } };
  else Object.assign(g, {
    up: { class_type: 'ImageScale', inputs: { image: ['dec', 0], upscale_method: 'lanczos', width: hw, height: hh, crop: 'disabled' } },
    enc: { class_type: 'VAEEncodeTiled', inputs: { pixels: ['up', 0], vae: ['ckpt', 2], ...tiled } },
    refine: ks(seed, 0.45, ['enc', 0]),
    dec2: { class_type: 'VAEDecodeTiled', inputs: { samples: ['refine', 0], vae: ['ckpt', 2], ...tiled } },
    save: { class_type: 'SaveImage', inputs: { images: ['dec2', 0], filename_prefix: prefix } },
  });
  return g;
}
/** Redraw part of a picture (white in the mask), keeping everything else exactly in place. */
export function inpaint(image: string, mask: string, prompt: string, neg: string, seed: number, denoise: number, prefix: string) {
  return { ...base(prompt, neg),
    img: { class_type: 'LoadImage', inputs: { image } },
    msk: { class_type: 'LoadImage', inputs: { image: mask } },
    m2: { class_type: 'ImageToMask', inputs: { image: ['msk', 0], channel: 'red' } },
    enc: { class_type: 'VAEEncodeTiled', inputs: { pixels: ['img', 0], vae: ['ckpt', 2], ...tiled } },
    noise: { class_type: 'SetLatentNoiseMask', inputs: { samples: ['enc', 0], mask: ['m2', 0] } },
    sample: ks(seed, denoise, ['noise', 0]),
    dec: { class_type: 'VAEDecodeTiled', inputs: { samples: ['sample', 0], vae: ['ckpt', 2], ...tiled } },
    comp: { class_type: 'ImageCompositeMasked', inputs: { destination: ['img', 0], source: ['dec', 0], x: 0, y: 0, resize_source: false, mask: ['m2', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['comp', 0], filename_prefix: prefix } },
  };
}
/** The whole picture redrawn at a given strength (same pose, new light or palette). */
export function img2img(image: string, prompt: string, neg: string, seed: number, denoise: number, prefix: string) {
  return { ...base(prompt, neg),
    img: { class_type: 'LoadImage', inputs: { image } },
    enc: { class_type: 'VAEEncodeTiled', inputs: { pixels: ['img', 0], vae: ['ckpt', 2], ...tiled } },
    sample: ks(seed, denoise, ['enc', 0]),
    dec: { class_type: 'VAEDecodeTiled', inputs: { samples: ['sample', 0], vae: ['ckpt', 2], ...tiled } },
    save: { class_type: 'SaveImage', inputs: { images: ['dec', 0], filename_prefix: prefix } },
  };
}
/** Cuts the character out (BiRefNet); saves the picture with an alpha channel. */
export function cut(image: string, prefix: string) {
  return {
    img: { class_type: 'LoadImage', inputs: { image } },
    bgm: { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: 'birefnet.safetensors' } },
    mask: { class_type: 'RemoveBackground', inputs: { bg_removal_model: ['bgm', 0], image: ['img', 0] } },
    inv: { class_type: 'InvertMask', inputs: { mask: ['mask', 0] } },
    rgba: { class_type: 'JoinImageWithAlpha', inputs: { image: ['img', 0], alpha: ['inv', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['rgba', 0], filename_prefix: prefix } },
  };
}

if (!process.env.FILM_LIB) {
  const args = process.argv.slice(2);
  const draft = args.includes('--draft');
  const seeds = (args.find((a) => a.startsWith('--seed='))?.slice(7) ?? '1').split(',').map(Number);
  const names = args.filter((a) => !a.startsWith('--'));
  if (args.includes('--list')) { console.log(Object.keys(SHOTS).join(' ')); process.exit(0); }
  fs.mkdirSync(RAW, { recursive: true });
  for (const name of names.length ? names : Object.keys(SHOTS)) {
    const s = SHOTS[name];
    if (!s) { console.log(`no shot ${name}`); continue; }
    for (const seed of seeds) {
      const file = path.join(RAW, `${name}${draft ? '-draft' : ''}-${seed}.png`);
      const t = Date.now();
      fs.writeFileSync(file, await run(txt(s, 7000 + seed * 104729, `aa_film/${name}`, draft)));
      console.log(`${path.basename(file)} ${((Date.now() - t) / 1000).toFixed(0)} s`);
    }
  }
}
