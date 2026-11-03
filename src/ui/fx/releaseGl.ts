import type { Application, DestroyOptions } from 'pixi.js';

/**
 * Destroys a PixiJS app and hands its WebGL context back to the browser right away. Browsers keep
 * only a handful of live WebGL contexts (Chrome ~16, iOS Safari fewer); a destroyed app whose
 * context is only released by garbage collection still counts, so after a few fights the oldest
 * canvases were dropped and players saw black screens (Nov 3 2026).
 */
export function destroyApp(app: Application | null | undefined, opts?: DestroyOptions): void {
  if (!app) return;
  const gl = (app.renderer as unknown as { gl?: WebGLRenderingContext } | undefined)?.gl;
  try { app.destroy(true, opts); } catch { /* already gone */ }
  try { if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* nothing to release */ }
}
