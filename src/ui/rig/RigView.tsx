// Draws one rigged 2D fighter (the 2D Arena) with PixiJS: the character's drawing as a
// skinned mesh bent by the shared skeleton (skeleton.ts), animated by one Anim from the
// library, with an optional face variant riding the head bone.
//
// Layout: the component renders a box of RIG_BOX.w x RIG_BOX.h reference canvases (scaled so
// the reference canvas is `height` CSS px tall), with the feet anchor at (--rig-foot-x,
// --rig-foot-y) inside it. The box is shifted by negative margins so that its CSS position
// (left/top set by the parent) IS the feet point: put it at `position:absolute; left:<feet x>;
// top:<ground y>`. The root offset of the pose (dashes, jumps) and the left-facing mirror are
// applied as a CSS transform about the feet, so they never clip at the canvas edge.
import { useEffect, useImperativeHandle, useRef, type CSSProperties, type Ref } from 'react';
import type { Application, Container, Mesh, MeshGeometry, Sprite, Texture } from 'pixi.js';
import { REF_H, REF_W, type Anim, type Expression, type JointName, type Pose, type RigData } from './skeleton';
import { blendPose, boneIndex, boneWorld, feetPoint, jointPos, sampleAnim, skinVertices, type Affine } from './skin';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** The drawing box in reference canvases, and where the feet sit inside it (fractions). */
export const RIG_BOX = { w: 2, h: 1.3, footX: 0.5, footY: 0.95 } as const;
/** Blend time when a new anim starts. */
const BLEND_MS = 120;

/** Imperative access for effect placement. */
export interface RigHandle {
  /** Where a joint is now, in CSS px relative to the feet anchor (flip and root offset included); null before the rig loads. */
  joint(j: JointName | 'pelvisMid' | 'headTop'): { x: number; y: number } | null;
}

export interface RigFighterProps {
  /** Folder holding rig.json (relative to the site base, or absolute / http). */
  base: string;
  anim: Anim;
  /** A change restarts the anim from t = 0, blending from the previous pose. */
  animKey: string | number;
  speed?: number;
  /** CSS px height of the reference canvas (the character is drawn at height * rig.height / REF_H). */
  height: number;
  /** Mirror to face left. */
  flip?: boolean;
  face?: Expression;
  tint?: string;
  glow?: string;
  onImpact?: () => void;
  onDone?: () => void;
  className?: string;
  style?: CSSProperties;
  handle?: Ref<RigHandle>;
}

function siteUrl(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path) || path.startsWith('/')) return path;
  return `${BASE}${path}`;
}
function resolveIn(folder: string, rel: string): string {
  if (/^(https?:|data:|blob:)/.test(rel) || rel.startsWith('/')) return rel;
  return folder.endsWith('/') ? folder + rel : `${folder}/${rel}`;
}
function hex(c: string | undefined): number {
  const m = c ? /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim()) : null;
  if (!m) return 0xffffff;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return parseInt(h, 16);
}
async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}
function validRig(r: unknown): r is RigData {
  const x = r as RigData;
  return !!x && typeof x.art === 'string' && Array.isArray(x.vertices) && Array.isArray(x.triangles) && Array.isArray(x.weights)
    && x.vertices.length >= 6 && x.weights.length >= (x.vertices.length >> 1) * 4 && typeof x.ground === 'number' && typeof x.height === 'number';
}

interface Live {
  app: Application;
  rig: RigData;
  root: Container;
  mesh: Mesh;
  geometry: MeshGeometry;
  positions: Float32Array;
  faceHolder: Container;
  faceSprite: Sprite;
  textures: Texture[];
  faces: Partial<Record<Expression, Texture>>;
  world: Affine[];
  pose: Pose;
  offX: number;
  offY: number;
  destroy(): void;
}

export function RigFighter(props: RigFighterProps) {
  const { base, height, flip, glow, className, style, handle } = props;
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<Live | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // Playback state, kept out of React so the ticker never re-renders.
  const play = useRef({ clock: 0, from: null as Pose | null, blend: 1, impact: false, done: false });

  const s = height / REF_H;
  const boxW = RIG_BOX.w * REF_W * s, boxH = RIG_BOX.h * REF_H * s;
  const footX = RIG_BOX.footX * boxW, footY = RIG_BOX.footY * boxH;
  const geo = useRef({ s, boxW, boxH, footX, footY });
  geo.current = { s, boxW, boxH, footX, footY };

  useImperativeHandle(handle, () => ({
    joint(j) {
      const l = live.current;
      if (!l) return null;
      const g = geo.current;
      const [px, py] = jointPos(l.world, j);
      const [fx, fy] = feetPoint(l.rig);
      const x = (px - fx) * g.s + l.offX, y = (py - fy) * g.s + l.offY;
      return { x: latest.current.flip ? -x : x, y };
    },
  }), []);

  // Build the PixiJS scene once per rig folder.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true;
    let made: Live | null = null;
    let onVis: (() => void) | null = null;
    const folder = siteUrl(base);

    void (async () => {
      try {
        const res = await fetch(resolveIn(folder, 'rig.json'));
        if (!res.ok) return;
        const rig: unknown = await res.json();
        if (!alive || !validRig(rig)) return;
        const pixi = await import('pixi.js');
        const [art, ...faceImgs] = await Promise.all([
          loadImage(resolveIn(folder, rig.art)),
          ...Object.entries(rig.faces ?? {}).map(([k, p]) => loadImage(resolveIn(folder, p as string)).then((img) => [k, img] as const).catch(() => null)),
        ]);
        if (!alive) return;
        const g = geo.current;
        const app = new pixi.Application();
        await app.init({
          backgroundAlpha: 0, width: g.boxW, height: g.boxH, antialias: true, autoDensity: true,
          resolution: Math.min(2, window.devicePixelRatio || 1), preference: 'webgl',
        });
        if (!alive) { try { app.destroy(true, { children: true }); } catch { /* already gone */ } return; }

        const toTex = (img: HTMLImageElement) => new pixi.Texture({ source: new pixi.ImageSource({ resource: img }) });
        const artTex = toTex(art);
        const textures: Texture[] = [artTex];
        const faces: Partial<Record<Expression, Texture>> = {};
        for (const f of faceImgs) if (f && f[1]) { const t = toTex(f[1] as HTMLImageElement); faces[f[0] as Expression] = t; textures.push(t); }

        const n = rig.vertices.length >> 1;
        const positions = new Float32Array(rig.vertices);
        const uvs = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uvs[2 * i] = rig.vertices[2 * i] / REF_W; uvs[2 * i + 1] = rig.vertices[2 * i + 1] / REF_H; }
        const indices = new Uint32Array(rig.triangles);
        const geometry = new pixi.MeshGeometry({ positions, uvs, indices });
        const mesh = new pixi.Mesh({ geometry, texture: artTex });
        const root = new pixi.Container();
        const faceHolder = new pixi.Container();
        const faceSprite = new pixi.Sprite();
        faceSprite.visible = false;
        if (rig.faceBox) { faceSprite.position.set(rig.faceBox[0], rig.faceBox[1]); }
        faceHolder.addChild(faceSprite);
        root.addChild(mesh, faceHolder);
        app.stage.addChild(root);
        app.canvas.style.position = 'absolute';
        app.canvas.style.inset = '0';
        app.canvas.style.pointerEvents = 'none';
        el.appendChild(app.canvas);

        const matrix = new pixi.Matrix();
        const headI = boneIndex('head');
        const restWorld = boneWorld({ rot: {} }, rig);
        made = {
          app, rig, root, mesh, geometry, positions, faceHolder, faceSprite, textures, faces,
          world: restWorld, pose: { rot: {} }, offX: 0, offY: 0,
          destroy() {
            try { app.destroy(true, { children: true }); } catch { /* already gone */ }
            try { geometry.destroy(); } catch { /* already gone */ }
            for (const t of textures) { try { t.destroy(true); } catch { /* already gone */ } }
          },
        };
        live.current = made;
        const l = made;

        const frame = (dtMs: number) => {
          const p = latest.current, st = play.current, gg = geo.current;
          const dt = Math.min(50, dtMs);
          const anim = p.anim;
          st.clock += dt * (p.speed ?? 1);
          const t01 = anim.ms > 0 ? st.clock / anim.ms : 1;
          let pose = sampleAnim(anim, t01);
          if (st.from && st.blend < 1) {
            st.blend = Math.min(1, st.blend + dt / BLEND_MS);
            pose = blendPose(st.from, pose, st.blend);
          }
          l.pose = pose;
          // Bones and squash inside the canvas; the root offset goes to CSS (never clipped).
          const world = boneWorld({ ...pose, x: 0, y: 0 }, rig);
          l.world = world;
          skinVertices(rig, world, positions);
          geometry.getBuffer('aPosition').update();
          // Face variant on the head.
          const faceTex = l.faces[p.face ?? anim.face ?? 'calm'];
          if (faceTex && rig.faceBox) {
            const h = world[headI];
            matrix.set(h.a, h.b, h.c, h.d, h.tx, h.ty);
            faceHolder.setFromMatrix(matrix);
            if (faceSprite.texture !== faceTex) faceSprite.texture = faceTex;
            faceSprite.width = rig.faceBox[2]; faceSprite.height = rig.faceBox[3];
            faceSprite.visible = true;
          } else faceSprite.visible = false;
          const tint = hex(p.tint);
          if (mesh.tint !== tint) { mesh.tint = tint; faceSprite.tint = tint; }
          // Feet of the rest drawing sit on the box's feet anchor.
          const [fx, fy] = feetPoint(rig);
          root.scale.set(gg.s);
          root.position.set(gg.footX - fx * gg.s, gg.footY - fy * gg.s);
          l.offX = (pose.x ?? 0) * rig.height * gg.s;
          l.offY = (pose.y ?? 0) * rig.height * gg.s;
          el.style.transform = `translate(${p.flip ? -l.offX : l.offX}px, ${l.offY}px)${p.flip ? ' scaleX(-1)' : ''}`;
          // Events.
          if (!st.impact && anim.impact !== undefined && t01 >= anim.impact) { st.impact = true; p.onImpact?.(); }
          if (!st.done && !anim.loop && t01 >= 1) { st.done = true; p.onDone?.(); }
        };
        app.ticker.add((t) => { try { frame(t.deltaMS); } catch { /* keep the page alive */ } });
        frame(0);
        onVis = () => { if (document.hidden) app.ticker.stop(); else app.ticker.start(); };
        document.addEventListener('visibilitychange', onVis);
      } catch {
        // No WebGL, missing files or a bad rig: draw nothing.
      }
    })();

    return () => {
      alive = false;
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      made?.destroy();
      if (live.current === made) live.current = null;
      el.style.transform = '';
    };
  }, [base]);

  // A new move: restart from t = 0, blending from where the body is now.
  const firstKey = useRef(true);
  useEffect(() => {
    const st = play.current;
    if (firstKey.current) { firstKey.current = false; return; }
    st.from = live.current ? live.current.pose : null;
    st.blend = st.from ? 0 : 1;
    st.clock = 0; st.impact = false; st.done = false;
  }, [props.animKey]);

  // Resize the canvas with the requested height.
  useEffect(() => {
    const l = live.current;
    if (!l) return;
    try { l.app.renderer.resize(boxW, boxH); } catch { /* destroyed */ }
  }, [boxW, boxH]);

  const box = {
    position: 'absolute', width: boxW, height: boxH, marginLeft: -footX, marginTop: -footY, pointerEvents: 'none',
    '--rig-w': `${boxW}px`, '--rig-h': `${boxH}px`, '--rig-foot-x': `${footX}px`, '--rig-foot-y': `${footY}px`,
    filter: glow ? `drop-shadow(0 0 ${Math.max(2, height * 0.012)}px ${glow}) drop-shadow(0 0 ${Math.max(4, height * 0.035)}px ${glow})` : undefined,
    ...style,
  } as CSSProperties;
  return (
    <div className={className ? `rig-fighter ${className}` : 'rig-fighter'} style={box} aria-hidden="true" data-flip={flip ? '1' : undefined}>
      <div ref={host} style={{ position: 'absolute', inset: 0, transformOrigin: `${footX}px ${footY}px`, willChange: 'transform' }} />
    </div>
  );
}
