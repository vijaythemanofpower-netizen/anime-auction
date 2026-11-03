// Pure maths for rigged 2D fighters (no DOM): sampling and blending poses, the per-bone
// 2D transforms of a pose, and linear blend skinning of a character's mesh (rig.json).
// Coordinates follow skeleton.ts: reference pixels, y down, rotations in degrees with
// positive = clockwise on screen.
import { BONES, point, type Anim, type BoneName, type JointName, type Pose, type RigData } from './skeleton';

/** A 2D affine transform: x' = a*x + c*y + tx, y' = b*x + d*y + ty (PixiJS Matrix layout). */
export interface Affine { a: number; b: number; c: number; d: number; tx: number; ty: number }

export type Ease = NonNullable<Anim['keys'][number]['ease']>;

const BONE_INDEX: Record<BoneName, number> = Object.fromEntries(BONES.map((b, i) => [b.name, i])) as Record<BoneName, number>;
export const boneIndex = (name: BoneName): number => BONE_INDEX[name];

/** Eased progress 0..1 for one key-to-key segment. */
export function ease(kind: Ease | undefined, u: number): number {
  const x = u <= 0 ? 0 : u >= 1 ? 1 : u;
  switch (kind) {
    case 'in': return x * x;
    case 'out': return 1 - (1 - x) * (1 - x);
    case 'inOut': return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    // Fast in, then hold: reaches the next key in the first third of the segment and stays.
    case 'snap': { const s = Math.min(1, x / 0.3); return 1 - (1 - s) * (1 - s) * (1 - s); }
    default: return x;
  }
}

/** Interpolates two poses (k = 0 gives a, 1 gives b). Missing bones count as rest. */
export function blendPose(a: Pose, b: Pose, k: number): Pose {
  const rot: Pose['rot'] = {};
  for (const name of Object.keys(a.rot) as BoneName[]) rot[name] = a.rot[name] ?? 0;
  for (const name of Object.keys(b.rot) as BoneName[]) if (!(name in rot)) rot[name] = 0;
  for (const name of Object.keys(rot) as BoneName[]) {
    const ra = a.rot[name] ?? 0, rb = b.rot[name] ?? 0;
    rot[name] = ra + (rb - ra) * k;
  }
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    rot,
    x: lerp(a.x ?? 0, b.x ?? 0),
    y: lerp(a.y ?? 0, b.y ?? 0),
    sx: lerp(a.sx ?? 1, b.sx ?? 1),
    sy: lerp(a.sy ?? 1, b.sy ?? 1),
  };
}

const REST_POSE: Pose = { rot: {} };

/**
 * The pose of an animation at progress t01 (0..1 of anim.ms). Looping anims wrap (and run
 * from the last key back to the first when the keys do not reach t = 1); others clamp.
 */
export function sampleAnim(anim: Anim, t01: number): Pose {
  const keys = anim.keys;
  if (!keys.length) return REST_POSE;
  if (keys.length === 1) return keys[0].pose;
  let t = Number.isFinite(t01) ? t01 : 0;
  if (anim.loop) { t = t % 1; if (t < 0) t += 1; } else t = Math.min(1, Math.max(0, t));
  const first = keys[0], last = keys[keys.length - 1];
  if (t >= last.t) {
    if (anim.loop && last.t < 1 + first.t) {
      const span = 1 - last.t + first.t;
      if (span <= 0) return last.pose;
      return blendPose(last.pose, first.pose, ease(last.ease, (t - last.t) / span));
    }
    return last.pose;
  }
  if (t <= first.t) {
    if (anim.loop && first.t > 0) {
      const span = 1 - last.t + first.t;
      return blendPose(last.pose, first.pose, ease(last.ease, (t + 1 - last.t) / span));
    }
    return first.pose;
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1];
    if (t >= k0.t && t < k1.t) {
      const span = k1.t - k0.t;
      return span <= 0 ? k1.pose : blendPose(k0.pose, k1.pose, ease(k0.ease, (t - k0.t) / span));
    }
  }
  return last.pose;
}

const mul = (p: Affine, q: Affine): Affine => ({
  a: p.a * q.a + p.c * q.b,
  b: p.b * q.a + p.d * q.b,
  c: p.a * q.c + p.c * q.d,
  d: p.b * q.c + p.d * q.d,
  tx: p.a * q.tx + p.c * q.ty + p.tx,
  ty: p.b * q.tx + p.d * q.ty + p.ty,
});

/** Rotation by deg (clockwise on screen) about (px, py). */
function rotAbout(deg: number, px: number, py: number): Affine {
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, tx: px - cos * px + sin * py, ty: py - sin * px - cos * py };
}

/** Where the feet are at rest: pelvis centre x, ground y. */
export function feetPoint(rig: { ground: number }): [number, number] {
  return [point('pelvisMid')[0], rig.ground];
}

/**
 * One transform per bone (BONES order) mapping rest-space points to posed points. Each bone
 * turns about its `from` point after its parent; the whole body is then squashed/stretched
 * about the feet (sx/sy) and shifted by the root offset (pose.x/y in body heights).
 */
export function boneWorld(pose: Pose, rig: { height: number; ground: number }): Affine[] {
  const [fx, fy] = feetPoint(rig);
  const sx = pose.sx ?? 1, sy = pose.sy ?? 1;
  const ox = (pose.x ?? 0) * rig.height, oy = (pose.y ?? 0) * rig.height;
  const global: Affine = { a: sx, b: 0, c: 0, d: sy, tx: fx - sx * fx + ox, ty: fy - sy * fy + oy };
  const local: Affine[] = [];
  for (let i = 0; i < BONES.length; i++) {
    const bone = BONES[i];
    const [px, py] = point(bone.from);
    const own = rotAbout(pose.rot[bone.name] ?? 0, px, py);
    local.push(bone.parent ? mul(local[BONE_INDEX[bone.parent]], own) : own);
  }
  return local.map((m) => mul(global, m));
}

/**
 * Linear blend skinning: writes the posed (x, y) of every rig vertex into out (length =
 * rig.vertices.length). Weights are normalised; a vertex with no weight follows the pelvis.
 */
export function skinVertices(rig: Pick<RigData, 'vertices' | 'weights'>, world: Affine[], out: Float32Array): Float32Array {
  const v = rig.vertices, w = rig.weights;
  const n = v.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = v[2 * i], y = v[2 * i + 1];
    let w0 = w[4 * i + 1] ?? 0, w1 = w[4 * i + 3] ?? 0;
    const m0 = world[w[4 * i] ?? 0] ?? world[0], m1 = world[w[4 * i + 2] ?? 0] ?? world[0];
    const sum = w0 + w1;
    if (sum > 0) { w0 /= sum; w1 /= sum; } else { w0 = 1; w1 = 0; }
    out[2 * i] = w0 * (m0.a * x + m0.c * y + m0.tx) + w1 * (m1.a * x + m1.c * y + m1.tx);
    out[2 * i + 1] = w0 * (m0.b * x + m0.d * y + m0.ty) + w1 * (m1.b * x + m1.d * y + m1.ty);
  }
  return out;
}

/** The bone that carries a joint (the bone ending there, else the one starting there; face points ride the head). */
const JOINT_BONE: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  BONES.forEach((b, i) => { if (!(b.from in map)) map[b.from] = i; });
  BONES.forEach((b, i) => { map[b.to] = i; });
  for (const j of ['nose', 'eyeF', 'eyeB', 'earF', 'earB', 'headTop']) map[j] = BONE_INDEX.head;
  map.pelvisMid = BONE_INDEX.pelvis;
  return map;
})();

/** Where a skeleton joint ends up under a pose's bone transforms (for effect placement, e.g. 'wristF'). */
export function jointPos(world: Affine[], joint: JointName | 'pelvisMid' | 'headTop'): [number, number] {
  const m = world[JOINT_BONE[joint] ?? 0];
  const [x, y] = point(joint);
  return [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
}
