import { describe, expect, it } from 'vitest';
import { BONES, REST, point, type Anim, type BoneName, type RigData } from '../src/ui/rig/skeleton';
import { blendPose, boneWorld, jointPos, sampleAnim, skinVertices } from '../src/ui/rig/skin';

const bi = (n: BoneName) => BONES.findIndex((b) => b.name === n);

// A tiny rig: one vertex per bone end plus a blended one.
const rig: RigData = {
  art: 'art.webp',
  vertices: [
    ...REST.wristF, // 0: forearmF
    ...REST.elbowF, // 1: upperArmF
    100, 200, // 2: pelvis
    ...REST.ankleB, // 3: half shinB, half thighB
  ],
  triangles: [0, 1, 2, 1, 2, 3],
  weights: [
    bi('forearmF'), 1, 0, 0,
    bi('upperArmF'), 1, 0, 0,
    bi('pelvis'), 1, 0, 0,
    bi('shinB'), 0.5, bi('thighB'), 0.5,
  ],
  ground: 1140,
  height: 1000,
};

const skin = (pose: Parameters<typeof boneWorld>[0]) => skinVertices(rig, boneWorld(pose, rig), new Float32Array(rig.vertices.length));

describe('rig skinning', () => {
  it('leaves vertices unchanged in the rest pose', () => {
    const out = skin({ rot: {} });
    rig.vertices.forEach((v, i) => expect(out[i]).toBeCloseTo(v, 4));
  });

  it('turns a forearm vertex 90 degrees clockwise about the elbow', () => {
    const out = skin({ rot: { forearmF: 90 } });
    const [ex, ey] = REST.elbowF, [wx, wy] = REST.wristF;
    // Clockwise on screen (y down): (dx, dy) -> (-dy, dx).
    expect(out[0]).toBeCloseTo(ex - (wy - ey), 4);
    expect(out[1]).toBeCloseTo(ey + (wx - ex), 4);
    // The elbow vertex (upper arm) stays put.
    expect(out[2]).toBeCloseTo(ex, 4);
    expect(out[3]).toBeCloseTo(ey, 4);
  });

  it('children follow their parent: turning the upper arm moves the wrist', () => {
    const world = boneWorld({ rot: { upperArmF: 90 } }, rig);
    const [sx, sy] = REST.shoulderF, [wx, wy] = REST.wristF;
    const [x, y] = jointPos(world, 'wristF');
    expect(x).toBeCloseTo(sx - (wy - sy), 4);
    expect(y).toBeCloseTo(sy + (wx - sx), 4);
    const out = skin({ rot: { upperArmF: 90 } });
    expect(out[0]).toBeCloseTo(x, 4);
    expect(out[1]).toBeCloseTo(y, 4);
  });

  it('shifts everything by rig.height for a root offset of one body height', () => {
    const out = skin({ rot: { forearmF: 30, thighB: -20 }, x: 1 });
    const ref = skin({ rot: { forearmF: 30, thighB: -20 } });
    for (let i = 0; i < out.length; i += 2) {
      expect(out[i]).toBeCloseTo(ref[i] + rig.height, 3);
      expect(out[i + 1]).toBeCloseTo(ref[i + 1], 3);
    }
  });

  it('squashes about the feet', () => {
    const out = skin({ rot: {}, sx: 2, sy: 0.5 });
    const fx = point('pelvisMid')[0];
    expect(out[4]).toBeCloseTo(fx + (100 - fx) * 2, 4);
    expect(out[5]).toBeCloseTo(rig.ground + (200 - rig.ground) * 0.5, 4);
  });

  it('blends two-bone vertices halfway', () => {
    const out = skin({ rot: { shinB: 40 } });
    const world = boneWorld({ rot: { shinB: 40 } }, rig);
    const [x, y] = jointPos(world, 'ankleB');
    expect(out[6]).toBeCloseTo((x + REST.ankleB[0]) / 2, 4);
    expect(out[7]).toBeCloseTo((y + REST.ankleB[1]) / 2, 4);
  });
});

describe('poses and animations', () => {
  const anim: Anim = {
    ms: 500,
    keys: [
      { t: 0, pose: { rot: { chest: 0 }, x: 0 }, ease: 'inOut' },
      { t: 0.5, pose: { rot: { chest: 20 }, x: 0.1 }, ease: 'snap' },
      { t: 1, pose: { rot: { chest: -10 }, x: 0.2 } },
    ],
  };

  it('returns the first and last key poses at t = 0 and t = 1', () => {
    expect(sampleAnim(anim, 0).rot.chest).toBeCloseTo(0);
    expect(sampleAnim(anim, 1).rot.chest).toBeCloseTo(-10);
    expect(sampleAnim(anim, 1).x).toBeCloseTo(0.2);
    expect(sampleAnim(anim, 2).rot.chest).toBeCloseTo(-10); // clamps when not looping
  });

  it('eases between keys', () => {
    expect(sampleAnim(anim, 0.25).rot.chest).toBeCloseTo(10); // inOut midpoint
    expect(sampleAnim(anim, 0.7).rot.chest).toBeCloseTo(-10); // snap has already arrived
  });

  it('wraps looping anims', () => {
    const loop: Anim = { ...anim, loop: true };
    expect(sampleAnim(loop, 1.25).rot.chest).toBeCloseTo(sampleAnim(loop, 0.25).rot.chest ?? NaN);
  });

  it('blendPose midpoint is the average', () => {
    const p = blendPose({ rot: { head: 10, chest: 4 }, x: 0, sy: 1 }, { rot: { head: 30, thighF: -8 }, x: 1, sy: 0.8 }, 0.5);
    expect(p.rot.head).toBeCloseTo(20);
    expect(p.rot.chest).toBeCloseTo(2);
    expect(p.rot.thighF).toBeCloseTo(-4);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.sy).toBeCloseTo(0.9);
    expect(p.sx).toBeCloseTo(1);
  });
});
