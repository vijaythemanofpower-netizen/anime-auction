import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { Application, Container, Graphics, Mesh, MeshGeometry, Texture } from 'pixi.js';
import { REF_H, REF_W, type Anim, type JointName, type RigData } from './skeleton';
import { boneWorld, feetPoint, jointPos, sampleAnim, skinVertices, type Affine } from './skin';
import type { MoveEffect } from './moves';

export interface RigWound { part: 'head' | 'arm' | 'leg' | 'torso'; severity: 1 | 2; label: string }
export interface RigStageFighter { id: string; base: string; x: number; ground: number; height: number; flip: boolean; form?: number; tint?: string; wounds?: RigWound[]; hurt?: number }
export interface RigStageHandle {
  play(id: string, anim: Anim, opts?: { speed?: number; onImpact?: () => void; key?: string | number }): void;
  setForm(id: string, base: string): void;
  moveTo(id: string, x: number, ms: number): void;
  joint(id: string, jointName: JointName | 'pelvisMid' | 'headTop'): { x: number; y: number } | null;
  impact(id: string, direction: number, severity: number): void;
  moveEffect(kind: MoveEffect['kind'], x: number, y: number, tx: number, ty: number, color: string, size: number, duration?: number, targetId?: string): void;
  flash(id: string, duration?: number): void;
  effects: Container | null;
}
interface Fighter { rig: RigData; root: Container; mesh: Mesh; geometry: MeshGeometry; positions: Float32Array; textures: Texture[]; world: Affine[]; descriptor: RigStageFighter; decals: Graphics[]; decalKey: string; anim: Anim; clock: number; speed: number; x: number; fromX: number; toX: number; moveAt: number; moveMs: number; key: string | number; impact: boolean; flashUntil: number; onImpact?: () => void; alive: boolean }
interface Visual { node: Graphics; kind: MoveEffect['kind']; active: boolean; age: number; life: number; x: number; y: number; tx: number; ty: number; color: number; size: number; targetId?: string }
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const url = (base: string, rel: string) => /^(https?:|\/)/.test(rel) ? rel : `${base.replace(/\/$/, '')}/${rel}`;
const site = (base: string) => /^(https?:|\/)/.test(base) ? base : `${BASE}${base}`;
async function image(src: string) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = src; await im.decode(); return im; }
function isRig(x: unknown): x is RigData { const r = x as RigData; return !!r && typeof r.art === 'string' && Array.isArray(r.vertices) && Array.isArray(r.weights) && Array.isArray(r.triangles) && typeof r.ground === 'number' && typeof r.height === 'number'; }

/** A single stage sized Pixi scene. Fighters and later effects share the same unclipped canvas. */
export function RigStage({ fighters, handle }: { fighters: RigStageFighter[]; handle: Ref<RigStageHandle> }) {
  const host = useRef<HTMLDivElement>(null), live = useRef(new Map<string, Fighter>()), api = useRef<RigStageHandle | null>(null), descriptors = useRef(fighters), pending = useRef(new Map<string, { anim: Anim; speed: number; key: string | number; onImpact?: () => void }>());
  descriptors.current = fighters;
  useImperativeHandle(handle, () => ({
    get effects() { return api.current?.effects ?? null; },
    play: (...args) => api.current?.play(...args),
    setForm: (...args) => api.current?.setForm(...args),
    moveTo: (...args) => api.current?.moveTo(...args),
    joint: (...args) => api.current?.joint(...args) ?? null,
    impact: (...args) => api.current?.impact(...args),
    moveEffect: (...args) => api.current?.moveEffect(...args),
    flash: (...args) => api.current?.flash(...args),
  }), []);
  useEffect(() => {
    const el = host.current; if (!el) return;
    let alive = true, app: Application | null = null, effects: Container | null = null, resize: ResizeObserver | null = null, vis: (() => void) | null = null;
    const destroyed = (f: Fighter) => { f.alive = false; try { f.geometry.destroy(); } catch {} for (const t of f.textures) try { t.destroy(true); } catch {} };
    const create = async (d: RigStageFighter) => {
      try {
        const folder = site(d.base), response = await fetch(url(folder, 'rig.json')); if (!response.ok) return;
        const raw: unknown = await response.json(); if (!alive || !isRig(raw)) return;
        const pixi = await import('pixi.js'); const art = await image(url(folder, raw.art)); if (!alive) return;
        const a = app; if (!a || !alive) return;
        const texture = new pixi.Texture({ source: new pixi.ImageSource({ resource: art }) });
        const positions = new Float32Array(raw.vertices), n = positions.length / 2, uvs = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uvs[2*i] = raw.vertices[2*i] / REF_W; uvs[2*i+1] = raw.vertices[2*i+1] / REF_H; }
        const geometry = new pixi.MeshGeometry({ positions, uvs, indices: new Uint32Array(raw.triangles) });
        const mesh = new pixi.Mesh({ geometry, texture }); const root = new pixi.Container(); root.addChild(mesh); a.stage.addChild(root);
        const f: Fighter = { rig: raw, root, mesh, geometry, positions, textures: [texture], world: boneWorld({ rot: {} }, raw), descriptor: d, decals: [], decalKey: '', anim: { ms: 1000, loop: true, keys: [{ t: 0, pose: { rot: {} } }] }, clock: 0, speed: 1, x: d.x, fromX: d.x, toX: d.x, moveAt: 0, moveMs: 0, key: 0, impact: false, flashUntil: 0, alive: true };
        live.current.set(d.id, f); const queued = pending.current.get(d.id); if (queued) { f.anim = queued.anim; f.speed = queued.speed; f.key = queued.key; f.onImpact = queued.onImpact; } renderFighter(f, performance.now());
      } catch { /* missing art/WebGL context: leave the fighter absent */ }
    };
    const renderFighter = (f: Fighter, now: number) => {
      if (!f.alive || !app) return;
      const d = descriptors.current.find(x => x.id === f.descriptor.id) ?? f.descriptor; f.descriptor = d;
      const p = sampleAnim(f.anim, f.clock / Math.max(1, f.anim.ms)); f.world = boneWorld({ ...p, x: 0, y: 0 }, f.rig); skinVertices(f.rig, f.world, f.positions); f.geometry.getBuffer('aPosition').update();
      let x = f.toX;
      if (f.moveMs > 0) { const t = Math.min(1, Math.max(0, (now - f.moveAt) / f.moveMs)); x = f.fromX + (f.toX - f.fromX) * t; if (t === 1) f.moveMs = 0; }
      f.x = x; const [fx, fy] = feetPoint(f.rig), scale = d.height / REF_H;
      f.root.scale.set(d.flip ? -scale : scale, scale); f.root.position.set(x + (p.x ?? 0) * f.rig.height * scale, d.ground + (p.y ?? 0) * f.rig.height * scale);
      f.root.pivot.set(fx, fy); f.root.zIndex = 1;
      const hurt = d.hurt ?? 0, pulse = hurt > 0 ? (0.5 + Math.sin(now / 135) * 0.5) * hurt : 0;
      f.root.position.x += pulse * Math.sin(now / 245) * 2.5;
      f.root.position.y += pulse * Math.max(0, Math.sin(now / 510)) * 2;
      f.mesh.tint = now < f.flashUntil ? 0xffffff : pulse > 0 ? (0xff - Math.round(pulse * 64) << 16) | (0xff - Math.round(pulse * 170) << 8) | (0xff - Math.round(pulse * 170)) : 0xffffff;
      f.root.scale.set((d.flip ? -1 : 1) * scale * (1 + pulse * (Math.sin(now / 95) * 0.012)), scale * (1 + pulse * (0.012 + Math.sin(now / 150) * 0.02)));
      for (let i = 0; i < f.decals.length; i++) {
        const wound = d.wounds?.[i]; if (!wound) continue;
        const bone = wound.part === 'head' ? 'head' : wound.part === 'arm' ? 'forearmF' : wound.part === 'leg' ? 'thighF' : 'chest';
        const m = f.world[({ pelvis: 0, chest: 1, head: 2, forearmF: 10, thighF: 7 } as Record<string, number>)[bone]];
        f.decals[i].position.set(m.tx + (wound.part === 'head' ? 18 : wound.part === 'arm' ? 18 : wound.part === 'leg' ? 16 : 28), m.ty + (wound.part === 'head' ? 35 : wound.part === 'leg' ? 90 : 35));
        f.decals[i].rotation = Math.atan2(m.b, m.a);
      }
      if (!f.impact && f.anim.impact !== undefined && f.clock / Math.max(1, f.anim.ms) >= f.anim.impact) { f.impact = true; f.onImpact?.(); }
    };
    void (async () => {
      try {
        const pixi = await import('pixi.js'); if (!alive) return;
        const a = new pixi.Application(); await a.init({ backgroundAlpha: 0, width: el.clientWidth || 1, height: el.clientHeight || 1, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1), preference: 'webgl' });
        if (!alive) { a.destroy(true, { children: true }); return; }
        app = a; a.stage.sortableChildren = true; effects = new pixi.Container(); effects.zIndex = 1000; a.stage.addChild(effects);
        const bloodPool: Array<{ node: Graphics; vx: number; vy: number; age: number; life: number }> = [];
        for (let i = 0; i < 48; i++) { const node = new pixi.Graphics(); node.visible = false; effects.addChild(node); bloodPool.push({ node, vx: 0, vy: 0, age: 0, life: 0 }); }
        const visualPool: Visual[] = [];
        for (let i = 0; i < 40; i++) { const node = new pixi.Graphics(); node.visible = false; effects.addChild(node); visualPool.push({ node, kind: 'none', active: false, age: 0, life: 0, x: 0, y: 0, tx: 0, ty: 0, color: 0xffffff, size: 1 }); }
        a.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; el.appendChild(a.canvas);
        const sync = () => { if (!alive || !app) return; const current = new Map(descriptors.current.map(d => [d.id, d])); for (const [id, f] of live.current) { const d = current.get(id); if (!d) { destroyed(f); f.root.destroy({ children: true }); live.current.delete(id); } else if (f.descriptor.base !== d.base) { destroyed(f); f.root.destroy({ children: true }); live.current.delete(id); void create(d); } else { f.descriptor = d; const wounds = d.wounds ?? [], signature = wounds.map(w => `${w.part}:${w.severity}:${w.label}`).join('|'); if (signature !== f.decalKey) { for (const decal of f.decals) { f.root.removeChild(decal); decal.destroy(); } f.decals = []; for (const w of wounds) { const decal = new pixi.Graphics(), severity = w.severity, label = w.label.toLowerCase(); if (/burn|scorch/.test(label)) { decal.roundRect(-15, -8, 31, 17, 5).fill({ color: 0x321c22, alpha: .82 }); decal.circle(-7, -2, 5 + severity).fill({ color: 0x6b2927, alpha: .75 }); } else if (/bruise|contusion/.test(label)) decal.ellipse(0, 0, 18 + severity * 4, 10 + severity * 3).fill({ color: 0x51285f, alpha: .72 }); else { for (let j = 0; j < severity + 1; j++) decal.moveTo(-13, -7 + j * 7).lineTo(13, 6 - j * 7).stroke({ color: 0xa4142a, width: 2 + severity, alpha: .9 }); decal.ellipse(10, 10, 2 + severity, 3 + severity).fill({ color: 0x9e1427, alpha: .7 }); } f.root.addChild(decal); f.decals.push(decal); } f.decalKey = signature; } } } for (const d of descriptors.current) if (!live.current.has(d.id)) void create(d); };
        api.current = {
          effects,
          play(id, anim, opts = {}) { const f = live.current.get(id); const speed = opts.speed ?? 1, key = opts.key ?? (f && typeof f.key === 'number' ? f.key + 1 : 1); pending.current.set(id, { anim, speed, key, onImpact: opts.onImpact }); if (!f) return; f.anim = anim; f.clock = 0; f.speed = speed; f.key = key; f.impact = false; f.onImpact = opts.onImpact; },
          setForm(id, base) { const f = live.current.get(id); const d = descriptors.current.find(x => x.id === id); if (d) { d.base = base; if (f) { destroyed(f); f.root.destroy({ children: true }); live.current.delete(id); void create(d); } } },
          moveTo(id, x, ms) { const f = live.current.get(id); if (f) { f.fromX = f.x; f.toX = x; f.moveAt = performance.now(); f.moveMs = Math.max(0, ms); if (!ms) f.x = x; } },
          joint(id, name) { const f = live.current.get(id); if (!f) return null; const [x,y] = jointPos(f.world, name), [fx,fy] = feetPoint(f.rig), s=f.descriptor.height/REF_H; return { x: f.x + (f.descriptor.flip ? -1 : 1)*(x-fx)*s, y: f.descriptor.ground+(y-fy)*s }; },
          impact(id, direction, severity) {
            const f = live.current.get(id); if (!f || !effects) return;
            const p = f.descriptor; const [fx, fy] = feetPoint(f.rig); const s = p.height / REF_H;
            const g = new pixi.Graphics();
            const atX = f.x, atY = p.ground;
            g.ellipse(atX, atY - 2, 5 + severity * 2, 2 + severity).fill({ color: 0x861626, alpha: 0.78 }); effects.addChild(g);
            for (let i = 0; i < Math.min(14, 5 + severity * 3); i++) {
              const particle = bloodPool.find(v => v.age >= v.life) ?? bloodPool[i % bloodPool.length];
              particle.node.clear(); particle.node.circle(0, 0, Math.max(1, 3 - i * .13)).fill({ color: 0xa7192d, alpha: .92 });
              particle.node.position.set(atX, atY - 28); particle.node.visible = true;
              particle.vx = direction * (1.2 + (i % 5) * .55); particle.vy = -2 - ((i * 7) % 9) * .35; particle.age = 0; particle.life = 42 + (i % 12);
            }
            void fy; void fx; void s;
          },
          moveEffect(kind, x, y, tx, ty, color, size, duration = 620, targetId) {
            if (!effects || kind === 'none') return;
            const v = visualPool.find(item => !item.active); if (!v) return;
            const g = v.node; g.clear(); v.kind = kind; v.x = x; v.y = y; v.tx = tx; v.ty = ty; v.color = Number.parseInt(color.replace('#', ''), 16) || 0x93c5fd; v.size = size; v.age = 0; v.life = Math.max(1, duration); v.targetId = targetId; v.active = true; g.visible = true; g.alpha = 1;
            const dx = tx - x, dy = ty - y, s = size;
            if (kind === 'palmOrb' || kind === 'chargeHand') { const r = 17 * s; g.circle(0, 0, r).fill({ color: v.color, alpha: .72 }); g.circle(0, 0, r * .62).fill({ color: 0xffffff, alpha: .9 }); for (let k = 0; k < 3; k++) { const a = k * 2.094; g.moveTo(Math.cos(a) * r * .2, Math.sin(a) * r * .2).quadraticCurveTo(Math.cos(a + 1) * r, Math.sin(a + 1) * r, Math.cos(a + 2) * r * .2, Math.sin(a + 2) * r * .2).stroke({ color: kind === 'chargeHand' ? 0xffffff : v.color, width: 2.5 * s }); } if (kind === 'chargeHand') for (let k = 0; k < 7; k++) { const a = k * .897; g.moveTo(Math.cos(a) * r, Math.sin(a) * r).lineTo(Math.cos(a + .7) * r * 1.6, Math.sin(a + .7) * r * 1.6).stroke({ color: 0xdff8ff, width: 2.5 }); } }
            else if (kind === 'beam') { g.moveTo(0, 0).lineTo(dx, dy).stroke({ color: v.color, width: 42 * s, alpha: .24 }); g.moveTo(0, 0).lineTo(dx, dy).stroke({ color: v.color, width: 22 * s, alpha: .92 }); g.moveTo(0, 0).lineTo(dx, dy).stroke({ color: 0xffffff, width: 7 * s }); }
            else if (kind === 'projectile') { g.moveTo(-dx * .12, 0).lineTo(0, 0).stroke({ color: v.color, width: 18 * s, alpha: .35 }); g.circle(0, 0, 11 * s).fill({ color: v.color }); g.circle(0, 0, 5 * s).fill({ color: 0xffffff }); }
            else if (kind === 'slashArc' || kind === 'impact') { for (let k = 0; k < 3; k++) { const r = (28 + k * 13) * s; g.moveTo(-r, r * .6).quadraticCurveTo(0, -r * 1.5, r, r * .6).stroke({ color: k === 0 ? 0xffffff : v.color, width: (6 - k) * s, alpha: .94 - k * .2 }); } }
            else if (kind === 'stretchArm') { g.moveTo(0, 0).lineTo(dx, dy).stroke({ color: 0x1f2937, width: 22 * s }); g.moveTo(0, 0).lineTo(dx, dy).stroke({ color: 0xf2c6a0, width: 15 * s }); g.circle(dx, dy, 17 * s).fill({ color: 0xf2c6a0 }); }
            else if (kind === 'speedLines') { for (let k = 0; k < 9; k++) { const yy = (k - 4) * 8 * s; g.moveTo(-90 * s + (k % 3) * 17 * s, yy).lineTo(12 * s, yy - (k % 2 ? 5 : -5) * s).stroke({ color: v.color, width: (k % 3 === 0 ? 3 : 1.5) * s, alpha: .82 }); } }
            else if (kind === 'afterimage') { g.ellipse(0, -80 * s, 15 * s, 19 * s).fill({ color: v.color, alpha: .46 }); g.moveTo(-12 * s, -62 * s).lineTo(-19 * s, -25 * s).lineTo(-10 * s, 0).lineTo(10 * s, 0).lineTo(19 * s, -25 * s).lineTo(12 * s, -62 * s).closePath().fill({ color: v.color, alpha: .28 }); g.moveTo(-9 * s, -53 * s).lineTo(-31 * s, -28 * s).lineTo(-42 * s, -8 * s).stroke({ color: v.color, width: 7 * s, alpha: .4 }); g.moveTo(9 * s, -53 * s).lineTo(30 * s, -27 * s).lineTo(42 * s, -9 * s).stroke({ color: v.color, width: 7 * s, alpha: .4 }); }
            else if (kind === 'area') { for (let k = 0; k < 7; k++) { const fx = (k - 3) * 13 * s; g.moveTo(fx - 8, 20 * s).quadraticCurveTo(fx - 15, -35 * s, fx + 2, -23 * s).quadraticCurveTo(fx + 18, -60 * s, fx + 12, 20 * s).fill({ color: v.color, alpha: .9 }); } }
            else if (kind === 'aura' || kind === 'summon') { if (kind === 'summon') { g.ellipse(0, -48 * s, 30 * s, 48 * s).stroke({ color: v.color, width: 6 * s, alpha: .8 }); g.moveTo(-28 * s, -67 * s).quadraticCurveTo(0, -105 * s, 28 * s, -67 * s).stroke({ color: v.color, width: 8 * s }); for (let k = 0; k < 5; k++) { const a = -1.1 + k * .55; g.moveTo(Math.cos(a) * 28 * s, -48 * s + Math.sin(a) * 48 * s).lineTo(Math.cos(a) * 39 * s, -48 * s + Math.sin(a) * 57 * s).stroke({ color: v.color, width: 5 * s }); } } else g.ellipse(0, -48 * s, 44 * s, 66 * s).stroke({ color: v.color, width: 5 * s, alpha: .8 }); }
            else if (kind === 'clones') { g.ellipse(-34 * s, -45 * s, 16 * s, 48 * s).fill({ color: v.color, alpha: .38 }); g.ellipse(34 * s, -45 * s, 16 * s, 48 * s).fill({ color: v.color, alpha: .38 }); }
            else { g.circle(0, 0, 22 * s).fill({ color: v.color, alpha: .55 }); g.circle(0, 0, 10 * s).fill({ color: 0xffffff, alpha: .9 }); }
            g.position.set(x, y);
          },
          flash(id, duration = 70) { const f = live.current.get(id); if (f) f.flashUntil = performance.now() + duration; },
        };
        resize = new ResizeObserver(() => { if (alive && app) try { app.renderer.resize(el.clientWidth || 1, el.clientHeight || 1); } catch {} }); resize.observe(el);
        sync(); a.ticker.add(t => { if (!alive) return; const now = performance.now(); for (const f of live.current.values()) { f.clock += t.deltaMS * f.speed; renderFighter(f, now); } for (const p of bloodPool) if (p.age < p.life) { p.age += t.deltaTime; p.vy += 0.16 * t.deltaTime; p.node.x += p.vx * t.deltaTime; p.node.y += p.vy * t.deltaTime; p.node.alpha = Math.max(0, 1 - p.age / p.life); if (p.age >= p.life) p.node.visible = false; } for (const v of visualPool) if (v.active) { v.age += t.deltaMS; const q = Math.min(1, v.age / v.life); v.node.alpha = v.kind === 'area' || v.kind === 'aura' || v.kind === 'summon' ? .88 - q * .45 : 1 - q; if (v.kind === 'projectile' || v.kind === 'beam') { v.node.x = v.x + (v.tx - v.x) * Math.min(1, q * 1.3); v.node.y = v.y + (v.ty - v.y) * Math.min(1, q * 1.3); } if (q >= 1) { v.active = false; v.node.visible = false; } } });
        vis = () => { if (!app || !alive) return; document.hidden ? app.ticker.stop() : app.ticker.start(); }; document.addEventListener('visibilitychange', vis);
        // React descriptors are updated every render; this lightweight interval picks up form/membership changes.
        const timer = window.setInterval(sync, 100);
        return () => window.clearInterval(timer);
      } catch { /* graceful fallback when WebGL is unavailable */ }
    })();
    return () => { alive = false; resize?.disconnect(); if (vis) document.removeEventListener('visibilitychange', vis); for (const f of live.current.values()) { destroyed(f); try { f.root.destroy({ children: true }); } catch {} } live.current.clear(); api.current = null; try { app?.destroy(true, { children: true }); } catch {} };
  }, []);
  return <div ref={host} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 2 }} />;
}
