// Animated, cut-out fighters for the battle stage. Offline, on the owner's machine (ComfyUI):
//   1. the anime model draws the fighter full body in a fighting stance, once per form
//      (base form and every transformation, so a transformed fighter stays transformed);
//   2. LTX-Video animates that stance into short clips (stance, run, strike, special, hit,
//      knockdown): real moving arms, legs and faces instead of a card sliding around;
//   3. BiRefNet cuts every frame out of its background;
//   4. the frames are aligned on the feet and packed into one transparent strip per clip,
//      registered in public/fighters/manifest.json for the stage to play frame by frame.
//
//   npx vite-node tools/make-fighters.ts naruto sasuke        (built-in keys)
//   npx vite-node tools/make-fighters.ts --all                (everyone; many hours on a laptop GPU)
//   options: --only=base | --only=1 (one state), --clips=idle,strike, --seed=N (redraw), --force (redo clips), --restance (redraw the stance too)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { LEGEND_MOVESETS } from '../src/engine/data/legendMoves';
import { kitFor, GENERIC_KIT } from '../src/engine/data/kits';
import { VILLAINS } from '../src/engine/data/villains';
import { ABILITIES } from '../src/engine/data/abilities';
import type { PublicCharacter } from '../src/engine/types';
import { NEGATIVE, characterTags } from '../src/engine/comic';
import { SIGNATURES } from '../src/ui/battlefield/signatures';
import { LOOK, LOOK_AVOID } from '../src/engine/data/looks';

const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const OUT = path.resolve('public/fighters');
const KEY_W = 512, KEY_H = 768;          // stance drawing
const VID_W = 768, VID_H = 768, LEN = 33; // video (LTX: multiples of 32, 8n+1 frames)
const PAD_L = 96, PAD_R = 160;            // room around the stance to punch forward and recoil back
const FRAME_H = 300;                      // in-game frame height
const KEEP_EVERY = 2;                     // 24 fps -> 12 fps
const LTX = 'ltxv-2b-0.9.8-distilled-fp8.safetensors';
const T5 = 't5xxl_fp8_e4m3fn.safetensors';
const BG = 'birefnet.safetensors';

const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
// Everyone who can be animated: the built-ins (by key) and the raid villains (by a key made from their name).
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const ROSTER: Array<{ key: string; c: PublicCharacter }> = [
  ...LEGEND_CHARACTERS.map((c) => ({ key: c.id.slice(7), c })),
  ...VILLAINS.map((c) => ({ key: slug(c.name), c })),
];
const keys = args.includes('--all') ? ROSTER.map((r) => r.key)
  : args.includes('--villains') ? VILLAINS.map((c) => slug(c.name))
    : args.filter((a) => !a.startsWith('--'));
if (!keys.length) { console.log('Usage: npx vite-node tools/make-fighters.ts <key...> | --all | --villains [--only=base|1|2|3] [--clips=idle,strike] [--seed=N] [--force] [--repack] [--restance]'); process.exit(1); }
const onlyState = opt('only');
const onlyClips = opt('clips')?.split(',');
const bump = Number(opt('seed') ?? 0);
const force = args.includes('--force');

// ------------------------------------------------------------------ ComfyUI

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json() as Promise<T>;
}
type Img = { filename: string; subfolder: string; type: string };
async function run(g: Record<string, unknown>, minutes = 20): Promise<Img[]> {
  const { prompt_id } = await json<{ prompt_id: string }>(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g }) });
  for (let i = 0; i < minutes * 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await json<Record<string, { outputs?: Record<string, { images?: Img[] }>; status?: { status_str?: string; messages?: unknown } }>>(`${COMFY}/history/${prompt_id}`);
    const e = h[prompt_id];
    if (e?.status?.status_str === 'error') throw new Error(`ComfyUI error: ${JSON.stringify(e.status.messages).slice(0, 600)}`);
    const imgs = e?.outputs ? Object.values(e.outputs).flatMap((o) => o.images ?? []) : [];
    if (imgs.length) return imgs;
  }
  throw new Error('timed out');
}
const fetchImg = async (i: Img) => Buffer.from(await (await fetch(`${COMFY}/view?filename=${encodeURIComponent(i.filename)}&subfolder=${encodeURIComponent(i.subfolder)}&type=${i.type}`)).arrayBuffer());
async function upload(buf: Buffer, name: string): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([buf]), name);
  form.append('overwrite', 'true');
  return (await json<{ name: string }>(`${COMFY}/upload/image`, { method: 'POST', body: form })).name;
}

/** The stance drawing: the fighter (in this form), full body, side on, plain background. */
function stanceGraph(prompt: string, avoid: string, seed: number, prefix: string) {
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'NoobAI-XL-v1.1.safetensors' } },
    lora: { class_type: 'LoraLoader', inputs: { lora_name: 'dmd2_sdxl_4step_lora_fp16.safetensors', strength_model: 1, strength_clip: 1, model: ['ckpt', 0], clip: ['ckpt', 1] } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['lora', 1] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: `${NEGATIVE}, multiple people, duplicate, cropped, out of frame, cut off feet, frame, border, (text, logo, watermark, letters:1.5), busy background, scenery, speed lines, effects, leaves, petals, particles, floating objects${avoid ? `, (${avoid}:1.3)` : ''}`, clip: ['lora', 1] } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: KEY_W * 1.5, height: KEY_H * 1.5, batch_size: 1 } },
    sample: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: 1, model: ['lora', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
    scale: { class_type: 'ImageScale', inputs: { image: ['decode', 0], upscale_method: 'lanczos', width: KEY_W, height: KEY_H, crop: 'disabled' } },
    save: { class_type: 'SaveImage', inputs: { images: ['scale', 0], filename_prefix: prefix } },
  };
}

/** Animate the stance into a clip with LTX-Video, then cut every frame out of its background. */
function clipGraph(image: string, prompt: string, seed: number, prefix: string) {
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: LTX } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: T5, type: 'ltxv' } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['clip', 0] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: 'worst quality, blurry, morphing, distorted body, extra limbs, deformed hands, camera movement, zoom, scene change, text, watermark, background change, second person', clip: ['clip', 0] } },
    img: { class_type: 'LoadImage', inputs: { image } },
    pre: { class_type: 'LTXVPreprocess', inputs: { image: ['img', 0], img_compression: 30 } },
    i2v: { class_type: 'LTXVImgToVideo', inputs: { positive: ['pos', 0], negative: ['neg', 0], vae: ['ckpt', 2], image: ['pre', 0], width: VID_W, height: VID_H, length: LEN, batch_size: 1, strength: 1 } },
    cond: { class_type: 'LTXVConditioning', inputs: { positive: ['i2v', 0], negative: ['i2v', 1], frame_rate: 24 } },
    sched: { class_type: 'LTXVScheduler', inputs: { steps: 8, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ['i2v', 2] } },
    samplerSel: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    sample: { class_type: 'SamplerCustom', inputs: { model: ['ckpt', 0], add_noise: true, noise_seed: seed, cfg: 1, positive: ['cond', 0], negative: ['cond', 1], sampler: ['samplerSel', 0], sigmas: ['sched', 0], latent_image: ['i2v', 2] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
    bgm: { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: BG } },
    mask: { class_type: 'RemoveBackground', inputs: { bg_removal_model: ['bgm', 0], image: ['decode', 0] } },
    // JoinImageWithAlpha treats the mask as "what to hide", so the fighter's mask is flipped first.
    inv: { class_type: 'InvertMask', inputs: { mask: ['mask', 0] } },
    rgba: { class_type: 'JoinImageWithAlpha', inputs: { image: ['decode', 0], alpha: ['inv', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['rgba', 0], filename_prefix: prefix } },
  };
}

// ------------------------------------------------------------------ what to draw

type ClipName = 'idle' | 'run' | 'strike' | 'special' | 'hit' | 'knockdown';
const CLIPS: ClipName[] = ['idle', 'run', 'strike', 'special', 'hit', 'knockdown'];

function actions(key: string, c: PublicCharacter): Record<ClipName, { text: string; loop: boolean; center: boolean }> {
  const style = SIGNATURES[key]?.style ?? (c.archetype === 'Mage' || c.archetype === 'Summoner' || c.archetype === 'Controller' ? 'caster' : c.archetype === 'Ranger' ? 'shooter' : /sword|blade|katana|scythe/i.test(c.weapon) ? 'blade' : undefined);
  const kicks = SIGNATURES[key]?.traits?.includes('kicks');
  const moves = LEGEND_MOVESETS[key] ?? [...c.knownAbilities.map((id) => ABILITIES[id]).filter(Boolean), ...kitFor(c.id, c.name).moves];
  const special = moves.find((m) => m.kind === 'ultimate') ?? moves.find((m) => m.kind === 'attack');
  const strike = style === 'blade' ? 'swings the sword in a fast, powerful slash toward the right, then recovers into stance'
    : style === 'caster' || style === 'shooter' ? 'thrusts one hand forward toward the right and fires a burst of energy, then recovers'
      : kicks ? 'spins and throws a fast high kick toward the right, leg fully extended, then lands back in stance'
        : 'steps forward and throws a fast straight punch, the right arm fully extending toward the right, fist forward, then pulls it back and throws a second punch with the left arm, then returns to stance';
  return {
    idle: { text: 'stays in a fighting stance, breathing, shifting weight slightly, small bounce, eyes locked on an opponent to the right', loop: true, center: false },
    run: { text: 'runs fast toward the right, legs striding and arms pumping, running in place, side view, body leaning forward', loop: true, center: true },
    strike: { text: `${strike}. Big, clear, fast movement of the arms and legs`, loop: false, center: false },
    special: { text: `performs the signature technique ${special?.name ?? 'special attack'}: ${special?.look ?? 'gathers energy in both hands and unleashes it toward the right'}, intense determined face`, loop: false, center: false },
    hit: { text: 'is hit hard in the chest, recoils backward in pain, face grimacing, eyes squeezed shut, then staggers', loop: false, center: false },
    knockdown: { text: 'is knocked off their feet, falls backward and crashes to the ground, lying down', loop: false, center: false },
  };
}

// ------------------------------------------------------------------ packing

/**
 * Packs a clip into one transparent strip. Every clip of a fighter uses the same scale (the
 * whole video height maps to FRAME_H), so the fighter is the same size in every move; only
 * the width is trimmed. The anchor is where the feet stand in the first frame, which the
 * stage puts on the ground line. A run cycle is centred frame by frame (it plays in place
 * while the stage moves the fighter).
 */
async function pack(frames: Buffer[], center: boolean, file: string): Promise<{ frames: number; w: number; h: number; ax: number; ay: number }> {
  const raws = await Promise.all(frames.map((f) => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  const { width: W, height: H } = raws[0].info;
  const solid = (d: Buffer, x: number, y: number) => d[(y * W + x) * 4 + 3] > 24;
  const boxes = raws.map(({ data }) => {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid(data, x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  });
  const ok = boxes.filter(Boolean) as Array<{ x0: number; y0: number; x1: number; y1: number }>;
  if (!ok.length) throw new Error('every frame came out empty');
  // Feet: the centre of the lowest band of the first good frame.
  const first = raws[boxes.findIndex(Boolean)].data, fb = ok[0];
  let fx = 0, fn = 0;
  for (let y = Math.max(fb.y0, fb.y1 - Math.round((fb.y1 - fb.y0) * 0.08)); y <= fb.y1; y++) for (let x = fb.x0; x <= fb.x1; x++) if (solid(first, x, y)) { fx += x; fn++; }
  const footX = fn ? fx / fn : (fb.x0 + fb.x1) / 2, footY = fb.y1;
  const halfW = Math.ceil(Math.max(...ok.map((b) => (b.x1 - b.x0) / 2))) + 8;
  const left = center ? 0 : Math.max(0, Math.min(...ok.map((b) => b.x0)) - 8), right = center ? 0 : Math.min(W - 1, Math.max(...ok.map((b) => b.x1)) + 8);
  const cw = Math.min(W, center ? halfW * 2 : right - left + 1);
  const scale = FRAME_H / H;
  const fw = Math.max(2, Math.round(cw * scale)), fh = FRAME_H;
  const tiles: sharp.OverlayOptions[] = [];
  for (let i = 0; i < frames.length; i++) {
    const b = boxes[i];
    const lx = center ? Math.max(0, Math.min(W - cw, Math.round(b ? (b.x0 + b.x1) / 2 : W / 2) - halfW)) : left;
    const tile = await sharp(frames[i]).ensureAlpha().extract({ left: lx, top: 0, width: cw, height: H }).resize(fw, fh, { fit: 'fill' }).png().toBuffer();
    tiles.push({ input: tile, left: i * fw, top: 0 });
  }
  await sharp({ create: { width: fw * frames.length, height: fh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles).webp({ quality: 80, alphaQuality: 90, effort: 5 }).toFile(file);
  return { frames: frames.length, w: fw, h: fh, ax: center ? 0.5 : (footX - left) / cw, ay: footY / H };
}

// ------------------------------------------------------------------ main

const manifestPath = path.join(OUT, 'manifest.json');
fs.mkdirSync(OUT, { recursive: true });
type ClipEntry = { id?: string; url: string; frames: number; fps: number; loop: boolean; frameW: number; frameH: number; ax: number; ay: number };
// Each clip has a sidecar (<clip>.json) next to its strip; the manifest is rebuilt from all of them on
// every save, so several runs at once never overwrite each other's entries.
function save() {
  const manifest: Record<string, { states: Record<string, Record<string, ClipEntry>> }> = {};
  for (const key of fs.readdirSync(OUT).filter((k) => fs.statSync(path.join(OUT, k)).isDirectory())) {
    for (const state of fs.readdirSync(path.join(OUT, key)).filter((s) => fs.statSync(path.join(OUT, key, s)).isDirectory())) {
      const sd = path.join(OUT, key, state);
      for (const f of fs.readdirSync(sd).filter((x) => x.endsWith('.json'))) {
        const clip = f.slice(0, -5);
        if (!fs.existsSync(path.join(sd, `${clip}.webp`))) continue;
        const entry = JSON.parse(fs.readFileSync(path.join(sd, f), 'utf8')) as ClipEntry;
        ((manifest[entry.id ?? `legend:${key}`] ??= { states: {} }).states[state] ??= {})[clip] = entry;
      }
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
}
const entryFor = (id: string, key: string, state: string, clip: string, r: { frames: number; w: number; h: number; ax: number; ay: number }, loop: boolean): ClipEntry =>
  ({ id, url: `fighters/${key}/${state}/${clip}.webp`, frames: r.frames, fps: Math.round(24 / KEEP_EVERY), loop, frameW: r.w, frameH: r.h, ax: +r.ax.toFixed(3), ay: +r.ay.toFixed(3) });
const hash = (s: string) => Math.abs([...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 17));

for (const key of keys) {
  const c = ROSTER.find((r) => r.key === key)?.c;
  if (!c) { console.log(`skip ${key}: not a built-in or raid villain`); continue; }
  const kit = kitFor(c.id, c.name);
  const forms = kit === GENERIC_KIT ? [] : kit.forms;
  const states = ['base', ...forms.map((_, i) => String(i + 1))].filter((s) => !onlyState || s === onlyState);
  const who = characterTags(c, c.name).replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const acts = actions(key, c);
  for (const state of states) {
    const form = state === 'base' ? null : forms[Number(state) - 1];
    const dir = path.join(OUT, key, state);
    fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    // 1. The stance drawing (kept, so every clip of this form starts from the same fighter).
    const stanceFile = path.join(dir, 'stance.png');
    if (!fs.existsSync(stanceFile) || args.includes('--restance')) {
      const look = [LOOK[key], form?.look].filter(Boolean).join(', ');
      const prompt = `${who}, ${look ? `${look}, ` : ''}solo, full body, standing, fighting stance, side view, facing right, whole body visible from head to feet, official outfit, full color, anime screencap, cel shading, simple background, plain light grey background, best quality, newest, very aesthetic`;
      const [img] = await run(stanceGraph(prompt, LOOK_AVOID[key] ?? '', hash(`${key}:${state}:stance`) + bump * 7919, `aa_fighters/${key}_${state}_stance`), 5);
      fs.writeFileSync(stanceFile, await fetchImg(img));
    }
    // The clip needs room: the stance is placed on a wider canvas of its own background colour.
    const raw = fs.readFileSync(stanceFile);
    const { data: px } = await sharp(raw).raw().toBuffer({ resolveWithObject: true });
    const bg = { r: px[0], g: px[1], b: px[2] };
    const padded = await sharp(raw).extend({ left: PAD_L, right: PAD_R, top: 0, bottom: 0, background: bg }).png().toBuffer();
    const repack = args.includes('--repack');
    const stanceName = repack ? '' : await upload(padded, `aa-fighter-${key}-${state}.png`);
    // 2-4. Each clip.
    for (const clip of CLIPS.filter((x) => !onlyClips || onlyClips.includes(x))) {
      const file = path.join(dir, `${clip}.webp`);
      const side = path.join(dir, `${clip}.json`);
      const a = acts[clip];
      const cache = path.resolve('.fighter-cache', key, state, clip);
      // --repack: rebuild the strip from the cached raw frames, without drawing again.
      if (repack) {
        if (!fs.existsSync(cache)) continue;
        const frames = fs.readdirSync(cache).filter((f) => f.endsWith('.png')).sort().map((f) => fs.readFileSync(path.join(cache, f)));
        fs.writeFileSync(side, JSON.stringify(entryFor(c.id, key, state, clip, await pack(frames, a.center, file), a.loop)));
        save();
        console.log(`  ${c.name} ${state}/${clip}: re-packed`);
        continue;
      }
      if (fs.existsSync(file) && fs.existsSync(side) && !force) continue;
      const formText = form ? ` in ${form.name} form (${form.look})` : '';
      const prompt = `Anime fighting game animation. ${c.name}${formText} ${a.text}. Full body visible, side view, static camera, plain background, smooth fluid motion, expressive face, high quality 2D anime animation.`;
      const t1 = Date.now();
      const imgs = await run(clipGraph(stanceName, prompt, hash(`${key}:${state}:${clip}`) + bump * 7919, `aa_fighters/${key}_${state}_${clip}`));
      const frames = await Promise.all(imgs.filter((_, i) => i % KEEP_EVERY === 0).map(fetchImg));
      // The raw frames are kept outside the site (not committed) so a clip can be re-packed without redrawing.
      fs.mkdirSync(cache, { recursive: true });
      frames.forEach((f, i) => fs.writeFileSync(path.join(cache, `${String(i).padStart(2, '0')}.png`), f));
      const r = await pack(frames, a.center, file);
      fs.writeFileSync(side, JSON.stringify(entryFor(c.id, key, state, clip, r, a.loop)));
      save();
      console.log(`  ${c.name} ${state}/${clip}: ${r.frames} frames, ${Math.round((Date.now() - t1) / 1000)} s`);
    }
    console.log(`${c.name} ${state === 'base' ? 'base form' : form?.name}: done in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}
