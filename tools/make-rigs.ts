// Rigged 2D fighters for the 2D Arena. Offline, on the owner's machine (ComfyUI):
//   1. the character (or one of their transformations) is drawn in exactly the shared
//      reference pose of src/ui/rig/skeleton.ts, guided by an OpenPose ControlNet drawn
//      from that skeleton, so their joints sit where the animation library expects;
//   2. BiRefNet cuts the drawing out of its background;
//   3. a triangle mesh is laid over the character and every vertex is weighted to the
//      nearest bones (two at most), triangles sorted back limbs -> body -> front limbs;
//   4. public/rigs/<key>/<form>/art.webp + rig.json (RigData) are written.
//
//   npx vite-node tools/make-rigs.ts naruto sasuke goku vegeta
//   npx vite-node tools/make-rigs.ts --all          (built-ins + raid villains)
//   options: --only=base|1|2|3, --seed=N (redraw), --force, --pose (just write the pose guide image)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { VILLAINS } from '../src/engine/data/villains';
import { kitFor, GENERIC_KIT } from '../src/engine/data/kits';
import { NEGATIVE, characterTags } from '../src/engine/comic';
import { LOOK, LOOK_AVOID } from '../src/engine/data/looks';
import { BONES, REF_H, REF_W, REST, point, type JointName, type RigData } from '../src/ui/rig/skeleton';
import type { PublicCharacter } from '../src/engine/types';

const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const OUT = path.resolve('public/rigs');
const CN = 'openpose-sdxl-xinsir.safetensors';
const BG = 'birefnet.safetensors';

const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const ROSTER: Array<{ key: string; c: PublicCharacter }> = [
  ...LEGEND_CHARACTERS.map((c) => ({ key: c.id.slice(7), c })),
  ...VILLAINS.map((c) => ({ key: slug(c.name), c })),
];
const keys = args.includes('--all') ? ROSTER.map((r) => r.key) : args.filter((a) => !a.startsWith('--'));

// ------------------------------------------------------------------ the pose guide

/** OpenPose (COCO-18) order; the character faces right, so their left side (L) is the front (F). */
const COCO: JointName[] = ['nose', 'neck', 'shoulderB', 'elbowB', 'wristB', 'shoulderF', 'elbowF', 'wristF', 'hipB', 'kneeB', 'ankleB', 'hipF', 'kneeF', 'ankleF', 'eyeB', 'eyeF', 'earB', 'earF'];
const LIMBS = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]];
const COLORS = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255], [255, 0, 170], [255, 0, 85]];

async function poseImage(): Promise<Buffer> {
  const stick = 9, r = 8;
  const parts: string[] = [];
  LIMBS.forEach(([a, b], i) => {
    const [x1, y1] = REST[COCO[a]], [x2, y2] = REST[COCO[b]];
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) / 2, ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${len}" ry="${stick}" transform="rotate(${ang} ${cx} ${cy})" fill="rgb(${COLORS[i].join(',')})" fill-opacity="0.6"/>`);
  });
  COCO.forEach((j, i) => { const [x, y] = REST[j]; parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="rgb(${COLORS[i].join(',')})"/>`); });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${REF_W}" height="${REF_H}"><rect width="100%" height="100%" fill="black"/>${parts.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ------------------------------------------------------------------ ComfyUI

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json() as Promise<T>;
}
type Img = { filename: string; subfolder: string; type: string };
async function run(g: Record<string, unknown>): Promise<Img[]> {
  const { prompt_id } = await json<{ prompt_id: string }>(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g }) });
  for (let i = 0; i < 600; i++) {
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

/** Draw the character in the reference pose (pose-guided), then cut them out. */
function drawGraph(prompt: string, avoid: string, poseName: string, seed: number, prefix: string) {
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'NoobAI-XL-v1.1.safetensors' } },
    lora: { class_type: 'LoraLoader', inputs: { lora_name: 'dmd2_sdxl_4step_lora_fp16.safetensors', strength_model: 1, strength_clip: 1, model: ['ckpt', 0], clip: ['ckpt', 1] } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['lora', 1] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: `${NEGATIVE}, multiple people, duplicate, cropped, out of frame, cut off feet, (text, logo, watermark:1.5), busy background, scenery, effects, speed lines, aura, motion blur, holding object across body${avoid ? `, (${avoid}:1.3)` : ''}`, clip: ['lora', 1] } },
    pose: { class_type: 'LoadImage', inputs: { image: poseName } },
    cn: { class_type: 'ControlNetLoader', inputs: { control_net_name: CN } },
    apply: { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['pos', 0], negative: ['neg', 0], control_net: ['cn', 0], image: ['pose', 0], strength: 0.95, start_percent: 0, end_percent: 0.85 } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: REF_W, height: REF_H, batch_size: 1 } },
    sample: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: 1, model: ['lora', 0], positive: ['apply', 0], negative: ['apply', 1], latent_image: ['latent', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
    bgm: { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: BG } },
    mask: { class_type: 'RemoveBackground', inputs: { bg_removal_model: ['bgm', 0], image: ['decode', 0] } },
    inv: { class_type: 'InvertMask', inputs: { mask: ['mask', 0] } },
    rgba: { class_type: 'JoinImageWithAlpha', inputs: { image: ['decode', 0], alpha: ['inv', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['rgba', 0], filename_prefix: prefix } },
  };
}

// ------------------------------------------------------------------ mesh + weights

/** Distance from p to segment ab. */
function segDist(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** The segment each bone covers for weighting (the pelvis is the hip line, the chest the spine). */
function boneSegment(i: number): [[number, number], [number, number]] {
  const b = BONES[i];
  if (b.name === 'pelvis') return [REST.hipB, REST.hipF];
  return [point(b.from), point(b.to)];
}

async function buildRig(png: Buffer): Promise<Omit<RigData, 'art'>> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] > 16;
  const step = 14;
  const cols = Math.ceil(W / step) + 1, rows = Math.ceil(H / step) + 1;
  // A cell is kept if any of its pixels (sampled) is solid, so the mesh covers the whole drawing.
  const keep: boolean[] = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    let any = false;
    for (let sy = 0; sy <= step && !any; sy += 4) for (let sx = 0; sx <= step && !any; sx += 4) any = inside(c * step + sx, r * step + sy);
    keep[r * cols + c] = any;
  }
  const vIndex = new Map<number, number>();
  const vertices: number[] = [];
  const vid = (c: number, r: number) => {
    const k = r * cols + c;
    let i = vIndex.get(k);
    if (i === undefined) { i = vertices.length / 2; vIndex.set(k, i); vertices.push(Math.min(W, c * step), Math.min(H, r * step)); }
    return i;
  };
  const tris: Array<[number, number, number]> = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) if (keep[r * cols + c]) {
    const a = vid(c, r), b = vid(c + 1, r), d = vid(c, r + 1), e = vid(c + 1, r + 1);
    tris.push([a, b, e], [a, e, d]);
  }
  // Weights: the nearest bone, blended with the second nearest close to a joint.
  const segs = BONES.map((_, i) => boneSegment(i));
  const weights: number[] = [];
  const primary: number[] = [];
  for (let i = 0; i < vertices.length / 2; i++) {
    const p: [number, number] = [vertices[i * 2], vertices[i * 2 + 1]];
    const ds = segs.map(([a, b], k) => ({ k, d: segDist(p, a, b) * (BONES[k].name === 'chest' || BONES[k].name === 'pelvis' ? 1.15 : 1) }));
    ds.sort((x, y) => x.d - y.d);
    const [n1, n2] = ds;
    const blend = Math.max(0, 1 - (n2.d - n1.d) / 26) * 0.5; // within ~26 px of the boundary, share the vertex
    weights.push(n1.k, 1 - blend, n2.k, blend);
    primary.push(n1.k);
  }
  // Back limbs first, then legs, body, head, front arm on top.
  const layerOf = (t: [number, number, number]) => Math.max(...t.map((v) => BONES[primary[v]].layer));
  tris.sort((x, y) => layerOf(x) - layerOf(y));
  // Feet and height from the drawing itself.
  let top = H, bottom = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x += 2) if (inside(x, y)) { if (y < top) top = y; if (y > bottom) bottom = y; }
  return { vertices, triangles: tris.flat(), weights, ground: bottom, height: Math.max(1, bottom - top) };
}

// ------------------------------------------------------------------ main

async function main() {
  // The owner can pause all drawing: while this file exists the tool draws nothing.
  if (fs.existsSync(path.resolve('handoff-logs/PAUSE-DRAWING'))) { console.log('Drawing is paused (handoff-logs/PAUSE-DRAWING exists); nothing drawn.'); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const pose = await poseImage();
  fs.writeFileSync(path.join(OUT, 'pose-guide.png'), pose);
  if (args.includes('--pose')) { console.log('pose guide written to public/rigs/pose-guide.png'); return; }
  if (!keys.length) { console.log('Usage: npx vite-node tools/make-rigs.ts <key...> | --all [--only=base|1|2|3] [--seed=N] [--force]'); return; }
  const poseName = await upload(pose, 'aa-rig-pose.png');
  const bump = Number(opt('seed') ?? 0);
  const hash = (s: string) => Math.abs([...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 23));
  const indexPath = path.join(OUT, 'index.json');
  const index: Record<string, { key: string; forms: Record<string, string> }> = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {};
  for (const key of keys) {
    const c = ROSTER.find((r) => r.key === key)?.c;
    if (!c) { console.log(`skip ${key}`); continue; }
    const kit = kitFor(c.id, c.name);
    const forms = kit === GENERIC_KIT ? [] : kit.forms;
    const states = ['base', ...forms.map((_, i) => String(i + 1))].filter((s) => !opt('only') || s === opt('only'));
    const who = characterTags(c, c.name).replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    for (const state of states) {
      const form = state === 'base' ? null : forms[Number(state) - 1];
      const dir = path.join(OUT, key, state);
      if (fs.existsSync(path.join(dir, 'rig.json')) && !args.includes('--force')) continue;
      fs.mkdirSync(dir, { recursive: true });
      const t0 = Date.now();
      const look = [LOOK[key], form?.look].filter(Boolean).join(', ');
      const prompt = `${who}, ${look ? `${look}, ` : ''}solo, full body, standing, ready to fight, arms away from the body, legs apart, three-quarter view, facing right, whole body from head to feet, detailed face, official outfit, full color, anime screencap, cel shading, sharp lineart, simple background, white background, best quality, newest, very aesthetic, absurdres`;
      const [img] = await run(drawGraph(prompt, LOOK_AVOID[key] ?? '', poseName, hash(`${key}:${state}:rig`) + bump * 7919, `aa_rigs/${key}_${state}`));
      const png = await fetchImg(img);
      const rig = await buildRig(png);
      await sharp(png).webp({ quality: 88, alphaQuality: 90, effort: 5 }).toFile(path.join(dir, 'art.webp'));
      const data: RigData = { art: 'art.webp', ...rig };
      fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(data));
      index[c.id] = { key, forms: { ...(index[c.id]?.forms ?? {}), [state]: `rigs/${key}/${state}/` } };
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n');
      console.log(`${c.name} ${state === 'base' ? 'base' : form?.name}: ${rig.vertices.length / 2} vertices, ${rig.triangles.length / 3} triangles, ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }
}
void main();
