import { memo, useState } from 'react';
import type { PublicCharacter, Tag } from '../../engine/types';

const TAG_COLOR: Partial<Record<Tag, string>> = {
  FIRE: '#ff6a3d', ICE: '#7dd3fc', LIGHTNING: '#facc15', DRAGON: '#f97316', DEMON: '#e11d48', DIVINE: '#fde68a',
  MAGIC: '#818cf8', WARRIOR: '#e2e8f0', ASSASSIN: '#a855f7', SHADOW: '#a855f7', HOLY: '#fef3c7', WIND: '#6ee7b7',
  EARTH: '#d6a77a', WATER: '#38bdf8', SPIRIT: '#c4b5fd', DARK: '#9f1239',
};

export function tagColor(t: Tag): string { return TAG_COLOR[t] ?? '#a78bfa'; }

const HAIR = [
  'M60 92 L70 40 L84 70 L96 28 L108 66 L124 30 L132 70 L150 44 L148 96 Z',
  'M58 100 C52 50 90 26 100 26 C120 26 150 44 142 100 L132 84 L120 96 L100 80 L80 96 L68 84 Z',
  'M56 120 C50 60 80 30 100 30 C126 30 152 60 144 120 L136 160 L128 100 L72 100 L64 160 Z',
  'M62 96 L52 60 L78 64 L84 30 L104 56 L118 24 L126 60 L150 52 L140 98 Z',
  'M60 96 C56 54 82 34 100 34 C118 34 146 52 140 96 C130 76 116 70 100 70 C84 70 70 78 60 96 Z',
  'M58 110 C54 56 84 32 102 32 C124 32 150 58 142 112 L150 150 L130 104 L118 120 L100 96 L82 120 L70 104 L50 150 Z',
];

/** Original procedurally drawn portrait; no external artwork. */
export const Portrait = memo(function Portrait({ c, className }: { c: Pick<PublicCharacter, 'id' | 'art' | 'tags' | 'archetype' | 'name'>; className?: string }) {
  const { hue, hue2, hair, eye } = c.art;
  const id = c.id.replace(/[^a-z0-9]/gi, '');
  const glow = tagColor(c.tags[0]);
  const glow2 = tagColor(c.tags[1] ?? c.tags[0]);
  const eyePath = [
    'M84 112 L96 108 L96 113 Z M116 108 L128 112 L116 113 Z',
    'M83 110 Q90 106 97 110 Q90 114 83 110 Z M115 110 Q122 106 129 110 Q122 114 115 110 Z',
    'M84 109 L97 111 L84 113 Z M128 109 L115 111 L128 113 Z',
    'M85 108 L95 112 M117 112 L127 108',
  ][eye];
  return (
    <svg className={className ?? 'portrait'} viewBox="0 0 200 266" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Portrait of ${c.name}`}>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 70% 22%)`} />
          <stop offset="0.55" stopColor={`hsl(${(hue + 30) % 360} 60% 10%)`} />
          <stop offset="1" stopColor={`hsl(${hue2} 55% 6%)`} />
        </linearGradient>
        <radialGradient id={`halo${id}`} cx="0.5" cy="0.42" r="0.5">
          <stop offset="0" stopColor={glow} stopOpacity="0.55" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`body${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 30% 16%)`} />
          <stop offset="1" stopColor="#05050a" />
        </linearGradient>
      </defs>
      <rect width="200" height="266" fill={`url(#bg${id})`} />
      {[...Array(7)].map((_, i) => (
        <path key={i} d={`M100 110 L${-40 + i * 50} -10 L${-20 + i * 50} -10 Z`} fill={glow2} opacity={0.05 + (i % 3) * 0.02} />
      ))}
      <circle cx="100" cy="112" r="96" fill={`url(#halo${id})`} />
      <circle cx="100" cy="112" r="70" fill="none" stroke={glow} strokeOpacity="0.25" strokeDasharray="2 6" />
      {/* shoulders and body */}
      <path d="M20 266 C24 200 60 176 100 172 C140 176 176 200 180 266 Z" fill={`url(#body${id})`} stroke={glow} strokeOpacity="0.35" />
      <path d="M78 150 L100 186 L122 150 L118 176 L100 196 L82 176 Z" fill={`hsl(${hue2} 40% 18%)`} opacity="0.9" />
      {/* neck and head */}
      <path d="M88 140 L112 140 L114 172 L86 172 Z" fill="#14121f" />
      <path d="M68 104 C68 72 82 56 100 56 C118 56 132 72 132 104 C132 130 118 150 100 152 C82 150 68 130 68 104 Z" fill="#17142a" stroke={glow} strokeOpacity="0.25" />
      {/* hair */}
      <path d={HAIR[hair]} fill={`hsl(${hue2} 45% 14%)`} stroke={glow2} strokeOpacity="0.5" strokeWidth="1.2" />
      {/* eyes */}
      <path d={eyePath} fill={glow} stroke={glow} strokeWidth={eye === 3 ? 3 : 0.5} strokeLinecap="round" />
      <path d={eyePath} fill="none" stroke={glow} strokeWidth="6" opacity="0.25" />
      {/* particles */}
      {[...Array(10)].map((_, i) => {
        const x = (hue * (i + 3) * 7) % 200;
        const y = 150 + ((hue2 * (i + 5)) % 110);
        return <circle key={i} cx={x} cy={y} r={1 + (i % 3)} fill={i % 2 ? glow : glow2} opacity={0.5} />;
      })}
    </svg>
  );
});

/** External image when available, procedural portrait fallback otherwise. */
export function CharArt({ c }: { c: PublicCharacter }) {
  const [failed, setFailed] = useState(false);
  if (c.imageUrl && !failed) {
    return <img src={c.imageUrl} alt={`Artwork of ${c.name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return <Portrait c={c} />;
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
      </defs>
      <path d="M32 3 L60 32 L32 61 L4 32 Z" fill="none" stroke="url(#lg1)" strokeWidth="3" />
      <path d="M32 14 L48 32 L32 50 L16 32 Z" fill="url(#lg1)" opacity="0.9" />
      <path d="M26 38 L32 22 L38 38 M28.5 33 L35.5 33" stroke="#07070d" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
