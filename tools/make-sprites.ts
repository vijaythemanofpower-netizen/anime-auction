// Draws dedicated battle poses for fighters with the local drawing app (ComfyUI,
// the same models the comic uses) and registers them in public/sprites/manifest.json.
// Runs offline, before any battle; the game never draws during a fight.
//
//   npx vite-node tools/make-sprites.ts goku luffy gojo     (built-in keys)
//   npx vite-node tools/make-sprites.ts --all               (every built-in, ~8 s a pose)
//
// Each fighter gets one pose per key clip (stance, strike, cast, hit, knocked down,
// victory). The arena plays the pose that fits each moment and keeps moving the card
// (dash, recoil, fall) around it; clips without a pose use the closest one.
import fs from 'node:fs';
import path from 'node:path';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { NEGATIVE, characterTags } from '../src/engine/comic';
import { SIGNATURES } from '../src/ui/battlefield/signatures';

const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const OUT = path.resolve('public/sprites');
const W = 768, H = 1024, OW = 384, OH = 512;

const args = process.argv.slice(2);
const keys = args.includes('--all') ? LEGEND_CHARACTERS.map((c) => c.id.replace('legend:', '')) : args.filter((a) => !a.startsWith('--'));
if (!keys.length) { console.log('Usage: npx vite-node tools/make-sprites.ts <key...> | --all'); process.exit(1); }

function poses(key: string, archetype: string): Record<string, string> {
  const style = SIGNATURES[key]?.style;
  const strike = style === 'blade' ? 'swinging a sword in a wide slash, mid attack' : style === 'caster' || style === 'shooter' || archetype === 'Mage' || archetype === 'Ranger'
    ? 'unleashing an energy attack from an outstretched hand' : SIGNATURES[key]?.traits?.includes('kicks') ? 'high kick, mid attack' : 'throwing a powerful punch, mid attack, motion lines';
  return {
    idle: 'fighting stance, ready to fight, confident, facing right',
    strike: `${strike}, facing right`,
    cast: 'charging power, glowing aura, hands raised, intense expression, facing right',
    hit: 'getting punched, flinching backwards in pain, one eye closed, gritted teeth, bruised, facing right',
    knockdown: 'knocked down, lying on the ground, defeated, exhausted',
    victory: 'victory pose, triumphant, fist raised, smiling',
  };
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json() as Promise<T>;
}

async function upload(url: string): Promise<string | null> {
  try {
    const img = await fetch(url).then((r) => (r.ok ? r.blob() : null));
    if (!img) return null;
    const form = new FormData();
    form.append('image', img, `aa-sprite-ref-${Math.abs([...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)}.png`);
    form.append('overwrite', 'true');
    return (await json<{ name: string }>(`${COMFY}/upload/image`, { method: 'POST', body: form })).name;
  } catch { return null; }
}

/** Look-alikes the model mixes up, kept out per fighter. */
/** Look details the model forgets for some fighters. */
const HINT: Record<string, string> = {
  sukuna: 'pink hair, black facial markings, extra eyes under eyes, white kimono, black sash', levi: 'short black hair, undercut, survey corps uniform, 3d maneuver gear, holding two blades',
  sasuke: 'black hair, white high-collar shirt, purple rope belt', eren: 'short brown hair, green eyes, male, survey corps uniform, 3d maneuver gear', pain: 'orange spiky hair, many facial piercings, purple ripple pattern eyes, black cloak with red clouds', minato: 'spiky blond hair, white haori with red flame pattern on hem, green flak vest', madara: 'long spiky black hair, red samurai armor', escanor: 'very muscular tall man, short blond hair, thin mustache, white shirt open', kaneki: 'white hair, black mask covering mouth with zipper teeth, black bodysuit', akaza: 'short pink hair, dark blue line tattoos all over body, yellow eyes, shirtless, white pants', inosuke: 'wearing a boar head mask, shirtless, fur pants, two jagged swords', shigaraki: 'messy pale blue hair, severed hands attached to face and arms, black clothes, red eyes', kenpachi: 'spiky black hair with small bells, eyepatch, scar across face, tall muscular man, torn white haori', deku: 'green curly hair, green hero costume', zoro: 'green hair, three swords, green haramaki',
};
const AVOID: Record<string, string> = { sasuke: 'akatsuki, akatsuki outfit, red clouds, uchiha itachi', itachi: 'uchiha sasuke', gohan: 'son goku', minato: 'uzumaki naruto', yuta: 'gojou satoru', pain: 'uzumaki naruto, blond hair, whisker markings', minato: 'akatsuki, red clouds', madara: 'mask, orange mask, uchiha obito', akaza: 'kamado tanjirou, checkered haori', inosuke: 'human face' };

function graph(prompt: string, seed: number, ref: string | null, prefix: string, avoid = '') {
  const g: Record<string, unknown> = {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'NoobAI-XL-v1.1.safetensors' } },
    lora: { class_type: 'LoraLoader', inputs: { lora_name: 'dmd2_sdxl_4step_lora_fp16.safetensors', strength_model: 1, strength_clip: 1, model: ['ckpt', 0], clip: ['ckpt', 1] } },
    pos: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['lora', 1] } },
    neg: { class_type: 'CLIPTextEncode', inputs: { text: `${NEGATIVE}, multiple people, duplicate, frame, border, scanlines, horizontal lines, stripes, striped background, grey background, white background, sketch, (text, logo, title, watermark, letters, signature, japanese text:1.5), (white border, frame, picture frame:1.4)${avoid ? `, (${avoid}:1.3)` : ''}`, clip: ['lora', 1] } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    sample: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'sgm_uniform', denoise: 1, model: [ref ? 'ipa' : 'lora', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } },
    scale: { class_type: 'ImageScale', inputs: { image: ['decode', 0], upscale_method: 'lanczos', width: OW, height: OH, crop: 'disabled' } },
    save: { class_type: 'SaveAnimatedWEBP', inputs: { images: ['scale', 0], filename_prefix: prefix, fps: 1, lossless: false, quality: 82, method: 'default' } },
  };
  if (ref) {
    g.refimg = { class_type: 'LoadImage', inputs: { image: ref } };
    g.ipl = { class_type: 'IPAdapterUnifiedLoader', inputs: { model: ['lora', 0], preset: 'PLUS (high strength)' } };
    g.ipa = { class_type: 'IPAdapterAdvanced', inputs: { model: ['ipl', 0], ipadapter: ['ipl', 1], image: ['refimg', 0], weight: 0.45, weight_type: 'linear', combine_embeds: 'concat', start_at: 0, end_at: 0.6, embeds_scaling: 'V only' } };
  }
  return g;
}

async function run(g: Record<string, unknown>): Promise<{ filename: string; subfolder: string; type: string }> {
  const { prompt_id } = await json<{ prompt_id: string }>(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g }) });
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await json<Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>; status?: { status_str?: string } }>>(`${COMFY}/history/${prompt_id}`);
    const entry = h[prompt_id];
    if (entry?.status?.status_str === 'error') throw new Error('ComfyUI reported an error');
    const img = entry?.outputs && Object.values(entry.outputs).flatMap((o) => o.images ?? [])[0];
    if (img) return img;
  }
  throw new Error('timed out');
}

const manifestPath = path.join(OUT, 'manifest.json');
const manifest: Record<string, unknown> = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

for (const key of keys) {
  const c = LEGEND_CHARACTERS.find((x) => x.id === `legend:${key}`);
  if (!c) { console.log(`skip ${key}: not a built-in`); continue; }
  // The model knows the built-ins by name; the portrait reference (--ref) helps lesser-known ones but can add scan lines.
  const ref = args.includes('--ref') && c.imageUrl ? await upload(c.imageUrl) : null;
  const dir = path.join(OUT, key);
  fs.mkdirSync(dir, { recursive: true });
  const clips: Record<string, unknown> = {};
  let n = 0;
  for (const [clip, pose] of Object.entries(poses(key, c.archetype))) {
    const file = path.join(dir, `${clip}.webp`);
    if (!fs.existsSync(file)) {
      // The model's own tag for the character keeps the outfit the same in every pose.
      const who = characterTags(c, c.name).replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      const prompt = `${who}, ${HINT[key] ? `${HINT[key]}, ` : ''}solo, full body, ${pose}, official outfit, anime screencap, cel shading, dramatic rim lighting, dark background, black background, best quality, newest, very aesthetic`;
      // --seed=N tries a different drawing for poses that came out wrong.
      const bump = Number(args.find((a) => a.startsWith('--seed='))?.slice(7) ?? 0);
      const seed = Math.abs([...`${key}:${clip}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 11)) + bump * 7919;
      const img = await run(graph(prompt, seed, ref, `aa_sprites/${key}_${clip}`, AVOID[key]));
      const bytes = Buffer.from(await (await fetch(`${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`)).arrayBuffer());
      fs.writeFileSync(file, bytes);
      n++;
    }
    clips[clip] = { url: `sprites/${key}/${clip}.webp`, row: 0, frames: 1, fps: 1, loop: clip === 'idle' };
  }
  manifest[c.id] = { url: `sprites/${key}/idle.webp`, frameW: OW, frameH: OH, clips };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${c.name}: ${n} new pose(s), ${Object.keys(clips).length} registered`);
}
