// Addresses of the drawn character scenes (public/hero), used by the page banners.
import type { World } from './worlds';

const BASE = import.meta.env.BASE_URL;
/** A scene at full size (2560 px wide), or a smaller copy (1920 or 1280 px) for smaller screens. */
export const sceneUrl = (w: World, n: number, size: 1280 | 1920 | 2560 | boolean = 2560) => {
  const px = size === true ? 1280 : size === false ? 2560 : size;
  return `${BASE}hero/${w.key}/${n}${px === 2560 ? '' : `-${px}`}.webp`;
};
export const sceneSrcSet = (w: World, n: number) => `${sceneUrl(w, n, 1280)} 1280w, ${sceneUrl(w, n, 1920)} 1920w, ${sceneUrl(w, n, 2560)} 2560w`;
