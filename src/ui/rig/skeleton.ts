// The one skeleton every rigged 2D fighter shares (the 2D Arena). Every character is drawn
// by the art tool (tools/make-rigs.ts) into exactly this reference pose, guided by an
// OpenPose ControlNet, so their joints sit where REST says. One animation library
// (animations.ts) then drives every character; the renderer (RigView) bends the drawing
// with a skinned mesh (rig.json from the tool).
//
// Coordinates: pixels on the REF_W x REF_H reference canvas, y down. Characters face RIGHT
// (3/4 view); the side nearer the viewer is "F" (front), the far side "B" (back).
// Front limbs draw over the body, back limbs under it.

export const REF_W = 832;
export const REF_H = 1216;

export type JointName =
  | 'nose' | 'neck' | 'eyeF' | 'eyeB' | 'earF' | 'earB'
  | 'shoulderF' | 'elbowF' | 'wristF' | 'shoulderB' | 'elbowB' | 'wristB'
  | 'hipF' | 'kneeF' | 'ankleF' | 'hipB' | 'kneeB' | 'ankleB';

/** The reference pose: a loose fighting-ready A-pose, limbs clear of the body so they can move freely. */
export const REST: Record<JointName, [number, number]> = {
  nose: [452, 252], neck: [404, 336], eyeF: [440, 236], eyeB: [412, 232], earF: [384, 240], earB: [372, 236],
  shoulderF: [446, 368], elbowF: [548, 470], wristF: [640, 420],
  shoulderB: [352, 358], elbowB: [290, 476], wristB: [236, 572],
  hipF: [436, 690], kneeF: [520, 902], ankleF: [566, 1118],
  hipB: [372, 682], kneeB: [338, 900], ankleB: [292, 1110],
};

export type BoneName =
  | 'pelvis' | 'chest' | 'head'
  | 'upperArmF' | 'forearmF' | 'upperArmB' | 'forearmB'
  | 'thighF' | 'shinF' | 'thighB' | 'shinB';

export interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  /** The bone runs from point `from` to point `to` at rest; it rotates about `from`. */
  from: JointName | 'pelvisMid';
  to: JointName | 'pelvisMid' | 'headTop';
  /** Draw order for the mesh: lower first (back limbs under the body, front limbs over it). */
  layer: number;
}

/** A joint's rest position; the pelvis centre and head top are derived points. */
export function point(j: JointName | 'pelvisMid' | 'headTop'): [number, number] {
  if (j === 'pelvisMid') return [(REST.hipF[0] + REST.hipB[0]) / 2, (REST.hipF[1] + REST.hipB[1]) / 2];
  if (j === 'headTop') return [REST.nose[0] - 20, REST.nose[1] - 150];
  return REST[j];
}

/** Parents always come before children. */
export const BONES: BoneDef[] = [
  { name: 'pelvis', parent: null, from: 'pelvisMid', to: 'neck', layer: 3 },
  { name: 'chest', parent: 'pelvis', from: 'pelvisMid', to: 'neck', layer: 3 },
  { name: 'head', parent: 'chest', from: 'neck', to: 'headTop', layer: 4 },
  { name: 'upperArmB', parent: 'chest', from: 'shoulderB', to: 'elbowB', layer: 0 },
  { name: 'forearmB', parent: 'upperArmB', from: 'elbowB', to: 'wristB', layer: 0 },
  { name: 'thighB', parent: 'pelvis', from: 'hipB', to: 'kneeB', layer: 1 },
  { name: 'shinB', parent: 'thighB', from: 'kneeB', to: 'ankleB', layer: 1 },
  { name: 'thighF', parent: 'pelvis', from: 'hipF', to: 'kneeF', layer: 2 },
  { name: 'shinF', parent: 'thighF', from: 'kneeF', to: 'ankleF', layer: 2 },
  { name: 'upperArmF', parent: 'chest', from: 'shoulderF', to: 'elbowF', layer: 5 },
  { name: 'forearmF', parent: 'upperArmF', from: 'elbowF', to: 'wristF', layer: 5 },
];

/**
 * A pose: each bone's extra rotation from rest in degrees (positive = clockwise on screen,
 * since y is down), plus the whole body's offset in body-heights (x forward, y down).
 * Missing bones stay at rest.
 */
export interface Pose {
  rot: Partial<Record<BoneName, number>>;
  /** Root offset in body heights (1 = the character's full height). Positive x = toward the opponent. */
  x?: number;
  y?: number;
  /** Squash/stretch of the whole body (1 = none), for anticipation and impact. */
  sx?: number;
  sy?: number;
}

export type Expression = 'calm' | 'fierce' | 'shout' | 'hurt' | 'smirk';

/** One move of the animation library. */
export interface Anim {
  /** Length at normal speed. */
  ms: number;
  loop?: boolean;
  /** Keyframes in time order; t from 0 to 1. The ease applies from this key to the next. */
  keys: Array<{ t: number; pose: Pose; ease?: 'linear' | 'in' | 'out' | 'inOut' | 'snap' }>;
  /** When the blow lands (0..1), for the hit reaction, hit-stop and the effect. */
  impact?: number;
  /** Which hand or foot leads, for where the effect starts. */
  lead?: JointName;
  /** The face to show during the move. */
  face?: Expression;
}

/** What the art tool writes per character and form: public/rigs/<key>/<form>/rig.json (+ art.webp, face-*.webp). */
export interface RigData {
  /** The drawing (transparent background), REF_W x REF_H, relative to the rig.json folder. */
  art: string;
  /** Face variants: images placed at faceBox, swapped in by expression. */
  faces?: Partial<Record<Expression, string>>;
  faceBox?: [number, number, number, number];
  /** Triangle mesh over the character: vertex positions (x,y pairs in reference pixels). */
  vertices: number[];
  /** Triangles (vertex index triples), already sorted back-to-front by bone layer. */
  triangles: number[];
  /** Up to two bones per vertex: [boneIndex, weight, boneIndex, weight] per vertex (indices into BONES). */
  weights: number[];
  /** Where the feet meet the ground in the drawing (reference pixels). */
  ground: number;
  /** Character height in reference pixels (head top to feet), for body-height units. */
  height: number;
}
