// Every screen except home opens on a cinematic banner: a different character's HD scene
// (public/hero, the same art as the home page), a film-site HUD line and a big katakana
// title, fading into the page. The character is picked per screen and per visit, never the
// same one twice in a row. Purely decorative and behind the content.
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { CinematicVfx, deviceQuality } from '../vfx/CinematicVfx';
import { profileFor } from '../vfx/profiles';
import { useMotionOk } from '../motion/useMotionOk';
import type { Screen } from '../../store/store';
import { WORLDS, type World } from '../home/worlds';
import { sceneSrcSet, sceneUrl } from '../home/HomeStory';

const KANA: Record<Screen, string> = {
  home: 'アニメオークション', explorer: 'キャラクター', setup: 'ゲーム作成', game: 'バトル', hall: '殿堂',
  howto: '遊び方', settings: '設定', saves: 'セーブ', online: 'オンライン', versus: '2Dアリーナ', ranks: 'ランキング',
};

const LABEL: Record<Screen, string> = {
  home: 'HOME', explorer: 'CHARACTER DATABASE', setup: 'NEW GAME', game: 'GAME', hall: 'HALL OF LEGENDS',
  howto: 'HOW TO PLAY', settings: 'SETTINGS', saves: 'SAVED GAMES', online: 'ONLINE ROOMS', versus: '2D ARENA', ranks: 'LEADERBOARDS',
};

/** Which characters suit each screen (by world key). */
const CAST: Record<string, string[]> = {
  explorer: ['gojo', 'killua', 'sasuke'], setup: ['luffy', 'zoro', 'naruto'], auction: ['goku', 'vegeta', 'saitama'],
  battle: ['sukuna', 'levi', 'eren', 'rengoku'], champion: ['rengoku', 'goku'], hall: ['rengoku', 'ichigo', 'vegeta'],
  howto: ['naruto', 'tanjiro'], settings: ['saitama', 'levi'], saves: ['zoro', 'jinwoo'], online: ['tanjiro', 'jinwoo', 'killua'], versus: ['goku', 'naruto', 'sasuke', 'luffy'],
};

function castFor(screen: Screen, phase?: string): string {
  if (screen !== 'game') return screen;
  return phase === 'auction' || phase === 'pool' ? 'auction' : phase === 'champion' ? 'champion' : 'battle';
}

export function PageArt({ screen, phase }: { screen: Screen; phase?: string }) {
  // The game screen's title follows the phase: auction, preparation or battle.
  const kana = screen === 'game' && phase ? (phase === 'auction' || phase === 'pool' ? 'オークション' : phase === 'champion' ? 'チャンピオン' : 'バトル') : KANA[screen];
  const cast = castFor(screen, phase);
  const last = useRef('');
  const world = useMemo<World | null>(() => {
    if (screen === 'home') return null;
    const keys = (CAST[cast] ?? ['naruto']).filter((k) => k !== last.current);
    const key = keys[Math.floor(Math.random() * keys.length)] ?? 'naruto';
    last.current = key;
    return WORLDS.find((w) => w.key === key) ?? null;
  }, [cast]); // eslint-disable-line react-hooks/exhaustive-deps
  // The banner's character gets their own living effects (smoke, aura, lightning...).
  const host = useRef<HTMLDivElement>(null);
  const motionOk = useMotionOk();
  useEffect(() => {
    if (!world || !motionOk || !host.current) return;
    const q = deviceQuality();
    const vfx = new CinematicVfx(q === 'high' && screen !== 'game' ? 'medium' : 'low');
    const el = host.current;
    void vfx.mount(el, null, el.querySelector('.pb-scrim')).then(() => vfx.show(profileFor(world.key, world.accent, world.tone)));
    const ro = new ResizeObserver(() => vfx.resize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    return () => { ro.disconnect(); vfx.canvas?.remove(); vfx.fxCanvas?.remove(); vfx.destroy(); };
  }, [world, motionOk, screen]);
  if (!world) return null;
  // Auction and battle screens are busy, so their banner is shorter and calmer.
  const busy = screen === 'game';
  const scene = busy ? 1 : 3;
  return (
    <div ref={host} className={`page-banner${busy ? ' busy' : ''}`} aria-hidden="true" style={{ '--acc': world.accent, '--ink2': world.ink } as CSSProperties} key={`${cast}-${world.key}`}>
      <img src={sceneUrl(world, scene)} srcSet={sceneSrcSet(world, scene)} sizes="100vw" alt="" decoding="async" />
      <div className="pb-scrim" />
      <div className="pb-hud"><span><i />{world.house}</span><span>{LABEL[screen]} · {world.name.toUpperCase()}</span></div>
      <div className="pb-kana">{kana}</div>
    </div>
  );
}
