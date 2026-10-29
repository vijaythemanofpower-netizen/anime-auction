import { memo, useMemo } from 'react';
import { Rng, hashString } from '../../engine/rng';

type ParticleMode = 'rise' | 'fall' | 'rain' | 'drift';
interface Particles { mode: ParticleMode; count: number; colors: string[]; size: [number, number]; speed: [number, number] }

const PARTICLES: Record<string, Particles> = {
  volcano: { mode: 'rise', count: 34, colors: ['#ff6a3d', '#fbbf24', '#f97316'], size: [2, 5], speed: [4, 9] },
  tundra: { mode: 'fall', count: 60, colors: ['#ffffff', '#e0f2fe'], size: [2, 5], speed: [6, 14] },
  storm: { mode: 'rain', count: 70, colors: ['rgba(190,200,255,0.55)'], size: [1, 1], speed: [0.6, 1.1] },
  temple: { mode: 'drift', count: 26, colors: ['#fde68a', '#fff7d6'], size: [2, 4], speed: [3, 7] },
  rooftops: { mode: 'rain', count: 50, colors: ['rgba(125,211,252,0.45)'], size: [1, 1], speed: [0.7, 1.2] },
  forest: { mode: 'drift', count: 30, colors: ['#bef264', '#a855f7', '#d9f99d'], size: [2, 4], speed: [3, 6] },
  ocean: { mode: 'rise', count: 24, colors: ['rgba(186,230,253,0.7)'], size: [3, 7], speed: [5, 10] },
  colosseum: { mode: 'drift', count: 22, colors: ['#e9d5ff', '#c4b5fd'], size: [1, 3], speed: [4, 8] },
};

function ParticleField({ envId }: { envId: string }) {
  const cfg = PARTICLES[envId] ?? PARTICLES.colosseum;
  const items = useMemo(() => {
    const rng = new Rng(hashString(envId));
    return Array.from({ length: cfg.count }, () => {
      const s = rng.range(cfg.size[0], cfg.size[1]);
      return {
        left: `${rng.range(0, 100)}%`, top: cfg.mode === 'drift' ? `${rng.range(10, 90)}%` : undefined,
        width: s, height: s, background: rng.pick(cfg.colors),
        animationDuration: `${rng.range(cfg.speed[0], cfg.speed[1])}s`, animationDelay: `-${rng.range(0, 10)}s`,
        boxShadow: cfg.mode === 'rain' ? undefined : `0 0 ${s * 2}px ${rng.pick(cfg.colors)}`,
        ['--dx' as string]: `${rng.range(-60, 60)}px`, ['--dy' as string]: `${rng.range(-60, 20)}px`,
      };
    });
  }, [envId, cfg]);
  return <div className={`particles p-${cfg.mode}`} aria-hidden="true">{items.map((st, i) => <i key={i} style={st} />)}</div>;
}

function Scene({ envId }: { envId: string }) {
  switch (envId) {
    case 'volcano': return (
      <svg className="scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="vs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#12030a" /><stop offset="0.55" stopColor="#5c140b" /><stop offset="1" stopColor="#ff6a3d" /></linearGradient>
          <radialGradient id="vg" cx="0.5" cy="1" r="0.6"><stop offset="0" stopColor="#ff9f43" stopOpacity="0.8" /><stop offset="1" stopColor="#ff6a3d" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="1000" height="560" fill="url(#vs)" />
        <rect width="1000" height="560" fill="url(#vg)" />
        <path d="M0 380 L120 260 L210 320 L330 170 L420 250 L500 150 L540 160 L600 240 L700 190 L820 300 L1000 220 L1000 560 L0 560Z" fill="#1a0505" />
        <path d="M500 150 L540 160 L520 260 L560 330 L515 420" stroke="#ff7a1a" strokeWidth="5" fill="none" opacity="0.9" />
        <path d="M330 170 L350 260 L320 330" stroke="#ff7a1a" strokeWidth="3" fill="none" opacity="0.7" />
        <ellipse cx="520" cy="150" rx="70" ry="18" fill="#ffb347" opacity="0.6" />
        <path d="M0 450 L180 400 L360 440 L520 395 L700 430 L860 400 L1000 440 L1000 560 L0 560Z" fill="#0d0303" />
      </svg>);
    case 'tundra': return (
      <svg className="scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="ts" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b1b2d" /><stop offset="0.6" stopColor="#3b6b8f" /><stop offset="1" stopColor="#cfe8f7" /></linearGradient></defs>
        <rect width="1000" height="560" fill="url(#ts)" />
        <path d="M0 120 C200 160 300 60 500 110 C700 160 800 60 1000 100" stroke="#67e8f9" strokeWidth="18" fill="none" opacity="0.18" />
        <path d="M0 160 C250 200 400 100 600 150 C800 200 900 120 1000 140" stroke="#a78bfa" strokeWidth="12" fill="none" opacity="0.15" />
        <path d="M0 360 L150 220 L240 300 L360 180 L470 290 L600 200 L720 290 L850 210 L1000 320 L1000 560 L0 560Z" fill="#9cc3dc" />
        <path d="M150 220 L185 255 L160 260 Z M360 180 L400 220 L370 225Z M600 200 L640 240 L610 240Z M850 210 L890 250 L860 252Z" fill="#fff" />
        <path d="M0 440 L250 410 L500 430 L760 405 L1000 430 L1000 560 L0 560Z" fill="#e8f4fb" />
      </svg>);
    case 'storm': return (
      <svg className="scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="ss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#05040f" /><stop offset="0.7" stopColor="#26215c" /><stop offset="1" stopColor="#3f3a7a" /></linearGradient></defs>
        <rect width="1000" height="560" fill="url(#ss)" />
        <g fill="#151236" opacity="0.9"><ellipse cx="200" cy="80" rx="260" ry="60" /><ellipse cx="700" cy="60" rx="320" ry="70" /><ellipse cx="480" cy="120" rx="240" ry="40" /></g>
        <path d="M640 40 L610 140 L650 140 L600 260" stroke="#facc15" strokeWidth="4" fill="none" opacity="0.6" />
        <path d="M470 560 L480 210 L470 200 L500 120 L530 200 L520 210 L530 560Z" fill="#0b0920" />
        <circle cx="500" cy="118" r="10" fill="#facc15" opacity="0.8" />
        <path d="M0 430 L200 380 L400 420 L600 370 L800 410 L1000 380 L1000 560 L0 560Z" fill="#0b0920" />
      </svg>);
    case 'temple': return (
      <svg className="scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="tp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a1206" /><stop offset="0.6" stopColor="#6b4a14" /><stop offset="1" stopColor="#f5c451" /></linearGradient></defs>
        <rect width="1000" height="560" fill="url(#tp)" />
        <circle cx="500" cy="260" r="160" fill="#fde68a" opacity="0.18" />
        <path d="M330 140 L500 60 L670 140 Z" fill="#2a1d08" />
        <rect x="350" y="140" width="300" height="18" fill="#2a1d08" />
        {[370, 440, 530, 600].map((x) => <rect key={x} x={x} y="158" width="30" height="300" fill="#2a1d08" />)}
        <path d="M480 175 C480 150 520 150 520 175 L528 215 L472 215 Z" fill="#c8961e" />
        {[60, 180, 820, 940].map((x) => <rect key={x} x={x - 18} y="200" width="36" height="300" fill="#1f1606" opacity="0.8" />)}
        <path d="M0 460 L1000 460 L1000 560 L0 560Z" fill="#1a1206" />
      </svg>);
    case 'rooftops': return (
      <svg className="scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="rt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#05051a" /><stop offset="0.7" stopColor="#1e1b4b" /><stop offset="1" stopColor="#4c1d95" /></linearGradient></defs>
        <rect width="1000" height="560" fill="url(#rt)" />
        <circle cx="820" cy="90" r="44" fill="#e0e7ff" opacity="0.85" />
        {[[0, 230, 90], [90, 180, 70], [160, 260, 110], [270, 150, 80], [350, 220, 100], [450, 120, 70], [520, 200, 120], [640, 170, 80], [720, 240, 110], [830, 190, 90], [920, 260, 80]].map(([x, y, w], i) => (
          <g key={i}><rect x={x} y={y} width={w} height={560 - y} fill="#0c0a24" />
            {Array.from({ length: 12 }, (_, k) => <rect key={k} x={x + 8 + (k % 3) * (w / 3.4)} y={y + 14 + Math.floor(k / 3) * 26} width="8" height="12" fill={k % 4 === 0 ? '#22d3ee' : '#f472b6'} opacity={(i + k) % 3 === 0 ? 0.8 : 0.15} />)}
          </g>))}
        <rect x="300" y="160" width="140" height="26" rx="4" fill="none" stroke="#f472b6" strokeWidth="3" opacity="0.8" />
        <rect x="0" y="440" width="1000" height="120" fill="#07061a" />
        <rect x="0" y="440" width="1000" height="3" fill="#22d3ee" opacity="0.6" />
      </svg>);
    case 'forest': return (
      <svg className="scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="fs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#030806" /><stop offset="0.6" stopColor="#14302a" /><stop offset="1" stopColor="#2e1065" /></linearGradient></defs>
        <rect width="1000" height="560" fill="url(#fs)" />
        <circle cx="500" cy="120" r="70" fill="#f1f5f9" opacity="0.9" />
        <circle cx="530" cy="105" r="62" fill="#14302a" opacity="0.6" />
        {[30, 140, 240, 760, 860, 960].map((x, i) => (
          <g key={x} fill="#020604"><rect x={x - 10} y={150 + (i % 2) * 30} width="20" height="420" /><path d={`M${x - 70} ${300 + (i % 2) * 30} L${x} ${100 + (i % 3) * 30} L${x + 70} ${300 + (i % 2) * 30}Z`} /><path d={`M${x - 90} ${400} L${x} ${220} L${x + 90} ${400}Z`} /></g>))}
        <path d="M0 450 C200 430 400 470 600 440 C800 420 900 450 1000 440 L1000 560 L0 560Z" fill="#020604" />
      </svg>);
    case 'ocean': return (
      <svg className="scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="os" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#04101c" /><stop offset="0.6" stopColor="#0c3352" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient></defs>
        <rect width="1000" height="560" fill="url(#os)" />
        <g fill="#082233">{[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M${i * 150 - 20} 360 L${i * 150 - 20} 170 C${i * 150 - 20} 120 ${i * 150 + 90} 120 ${i * 150 + 90} 170 L${i * 150 + 90} 360 L${i * 150 + 70} 360 L${i * 150 + 70} 180 C${i * 150 + 70} 150 ${i * 150} 150 ${i * 150} 180 L${i * 150} 360Z`} />)}</g>
        <rect x="0" y="150" width="1000" height="14" fill="#082233" />
        <path d="M0 400 C100 380 200 420 300 400 C400 380 500 420 600 400 C700 380 800 420 900 400 C950 390 1000 400 1000 400 L1000 560 L0 560Z" fill="#0369a1" opacity="0.8" />
        <path d="M0 440 C120 420 240 460 360 440 C480 420 600 460 720 440 C840 420 960 460 1000 440 L1000 560 L0 560Z" fill="#075985" />
      </svg>);
    default: return (
      <svg className="scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="cs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c0a14" /><stop offset="0.7" stopColor="#2a2140" /><stop offset="1" stopColor="#4c3a73" /></linearGradient>
          <linearGradient id="sl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.25" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        </defs>
        <rect width="1000" height="560" fill="url(#cs)" />
        <path d="M180 0 L320 460 L420 460 Z" fill="url(#sl)" /><path d="M820 0 L680 460 L580 460 Z" fill="url(#sl)" />
        <path d="M0 330 C250 260 750 260 1000 330 L1000 400 C750 330 250 330 0 400Z" fill="#17122a" />
        {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={20 + i * 25} cy={300 + Math.abs(20 - i) * 1.5 - 10} r="5" fill="#2e2550" />)}
        <path d="M0 400 C250 340 750 340 1000 400 L1000 560 L0 560Z" fill="#0d0a18" />
      </svg>);
  }
}

export const ArenaBackdrop = memo(function ArenaBackdrop({ envId }: { envId: string }) {
  return (
    <div className="backdrop" aria-hidden="true">
      <Scene envId={envId} />
      {envId === 'storm' && <div className="storm-flash" />}
      <ParticleField envId={envId} />
      <div className="floor" />
      <div className="vignette" />
    </div>
  );
});
