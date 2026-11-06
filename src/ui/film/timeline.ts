// The film's script, as pure functions (no DOM): scroll position -> which frame of the one
// continuous take, which colour, and which words are on screen. "u" counts key poses: u = 0 is the
// opening close-up, u = 1 the second key pose, and so on; clip n runs from u = n to u = n + 1.

export interface Manifest {
  /** Frame widths available, largest first. */
  sizes: number[];
  /** Aspect of the frames. */
  w: number;
  h: number;
  /** Frames in each clip. A clip's last frame is the next clip's first, stored once. */
  clips: number[];
}

/** First frame of each clip in the joined take, plus the total. */
export function clipStarts(clips: number[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let at = 0;
  for (const n of clips) { starts.push(at); at += n - 1; }
  return { starts, total: at + 1 };
}

/** Slows the picture near each key pose (where the words sit) without ever stopping it, and
 *  speeds it between them, with no jolt where two clips join. */
export function ease(x: number, a = 0.82): number {
  return x - (a * Math.sin(2 * Math.PI * x)) / (2 * Math.PI);
}

/** The frame (fractional: the player blends the two neighbours) shown at position u. */
export function frameAt(u: number, clips: number[]): number {
  const { starts, total } = clipStarts(clips);
  if (u <= 0) return 0;
  if (u >= clips.length) return total - 1;
  const i = Math.floor(u);
  return starts[i] + ease(u - i) * (clips[i] - 1);
}

const BLAST = 4.42;
export interface Grade { /** Accent, 0-1 rgb. */ accent: [number, number, number]; smoke: number; exposure: number; flash: number }

const GRADES: Grade[] = [
  { accent: [0.72, 0.8, 0.95], smoke: 0.55, exposure: 1, flash: 0 },    // sealed: cold, almost black
  { accent: [0.2, 0.62, 1], smoke: 0.4, exposure: 1.02, flash: 0 },     // eyes open: electric blue
  { accent: [0.25, 0.6, 1], smoke: 0.18, exposure: 1.04, flash: 0 },    // the orb
  { accent: [0.95, 0.14, 0.2], smoke: 0.34, exposure: 1, flash: 0 },    // crimson city
  { accent: [0.62, 0.32, 1], smoke: 0.2, exposure: 1.05, flash: 0 },    // Hollow Purple
  { accent: [0.8, 0.84, 0.92], smoke: 0.3, exposure: 0.98, flash: 0 },  // silver crater
  { accent: [0.8, 0.84, 0.92], smoke: 0.16, exposure: 1, flash: 0 },    // he looks back
  { accent: [0.86, 0.14, 0.2], smoke: 0.42, exposure: 0.96, flash: 0 }, // sealed again, your move
];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function gradeAt(u: number): Grade {
  const c = Math.max(0, Math.min(GRADES.length - 1, u));
  const i = Math.min(GRADES.length - 2, Math.floor(c)), t = c - i;
  const s = t * t * (3 - 2 * t), A = GRADES[i], B = GRADES[i + 1];
  // The sphere goes off: a white-out carries the cut from purple to the moon.
  const blast = Math.exp(-(((u - BLAST) / 0.075) ** 2));
  return { accent: [mix(A.accent[0], B.accent[0], s), mix(A.accent[1], B.accent[1], s), mix(A.accent[2], B.accent[2], s)], smoke: mix(A.smoke, B.smoke, s), exposure: mix(A.exposure, B.exposure, s) * (1 + blast * 1.6), flash: blast };
}

/** How present something centred on u = at is: 0 far away, 1 in the middle of its window. */
export function presence(u: number, at: number, inW = 0.32, hold = 0.14, outW = 0.3): number {
  const d = u - at;
  if (d < -hold) return Math.max(0, 1 + (d + hold) / inW);
  if (d > hold) return Math.max(0, 1 - (d - hold) / outW);
  return 1;
}

export interface Word {
  text: string;
  /** The key pose it belongs to. */
  at: number;
  /** Anchor position (fractions of the screen) and letter height (fraction of screen height). */
  x: number; y: number; size: number;
  align: 'left' | 'right' | 'center';
  /** Slides this far (fraction of width) per unit of u, so lines shear past each other. */
  drift: number;
  /** 1 = passes behind him (uses the cut-out mask). */
  behind: number;
  outline?: boolean;
  /** Takes the scene's colour instead of paper white. */
  accent?: boolean;
  /** Also drawn as an outline in front of him, so the word still reads where he covers it. */
  echo?: boolean;
}

/** The giant words of each scene, placed differently on wide and tall screens. */
export function wordsFor(aspect: number): Word[] {
  return placed(aspect).flatMap((w) => (w.echo ? [w, { ...w, echo: false, outline: true, behind: 0, accent: false }] : [w]));
}
function placed(aspect: number): Word[] {
  if (aspect >= 1) return [
    { text: 'ANIME', at: 0, x: 0.045, y: 0.2, size: 0.24, align: 'left', drift: -0.09, behind: 1, echo: true },
    { text: 'AUCTION', at: 0, x: 0.045, y: 0.43, size: 0.24, align: 'left', drift: 0.07, behind: 1, echo: true },
    { text: 'TRUE POWER', at: 1, x: 0.04, y: 0.3, size: 0.17, align: 'left', drift: -0.12, behind: 0.9, echo: true },
    { text: 'STAYS', at: 1, x: 0.04, y: 0.5, size: 0.17, align: 'left', drift: 0.08, behind: 0.9, echo: true },
    { text: 'HIDDEN', at: 1, x: 0.04, y: 0.71, size: 0.2, align: 'left', drift: -0.05, behind: 0.9, accent: true, echo: true },
    { text: 'BID', at: 2, x: 0.97, y: 0.62, size: 0.58, align: 'right', drift: 0.16, behind: 1, echo: true },
    { text: 'BUILD', at: 3, x: 0.5, y: 0.34, size: 0.5, align: 'center', drift: -0.14, behind: 1 },
    { text: 'BATTLE', at: 4, x: 0.03, y: 0.3, size: 0.34, align: 'left', drift: 0.12, behind: 0.8, accent: true, echo: true },
    { text: 'ONE CHAMPION', at: 5, x: 0.5, y: 0.22, size: 0.2, align: 'center', drift: 0.06, behind: 0 },
    { text: 'YOUR', at: 7, x: 0.045, y: 0.2, size: 0.22, align: 'left', drift: 0.1, behind: 1, echo: true },
    { text: 'MOVE', at: 7, x: 0.045, y: 0.41, size: 0.22, align: 'left', drift: -0.08, behind: 1, accent: true, echo: true },
  ];
  return [
    { text: 'ANIME', at: 0, x: 0.5, y: 0.13, size: 0.135, align: 'center', drift: -0.16, behind: 1, echo: true },
    { text: 'AUCTION', at: 0, x: 0.5, y: 0.27, size: 0.135, align: 'center', drift: 0.14, behind: 1, echo: true },
    { text: 'TRUE', at: 1, x: 0.06, y: 0.12, size: 0.1, align: 'left', drift: -0.16, behind: 0.9, echo: true },
    { text: 'POWER', at: 1, x: 0.06, y: 0.21, size: 0.1, align: 'left', drift: 0.12, behind: 0.9, echo: true },
    { text: 'HIDDEN', at: 1, x: 0.94, y: 0.31, size: 0.1, align: 'right', drift: -0.1, behind: 0.9, accent: true, echo: true },
    { text: 'BID', at: 2, x: 0.5, y: 0.18, size: 0.24, align: 'center', drift: 0.1, behind: 1, echo: true },
    { text: 'BUILD', at: 3, x: 0.5, y: 0.18, size: 0.17, align: 'center', drift: -0.1, behind: 1 },
    { text: 'BATTLE', at: 4, x: 0.5, y: 0.14, size: 0.145, align: 'center', drift: 0.1, behind: 0.8, accent: true, echo: true },
    { text: 'ONE', at: 5, x: 0.5, y: 0.12, size: 0.1, align: 'center', drift: 0.06, behind: 0 },
    { text: 'CHAMPION', at: 5, x: 0.5, y: 0.21, size: 0.1, align: 'center', drift: -0.06, behind: 0 },
    { text: 'YOUR', at: 7, x: 0.5, y: 0.14, size: 0.135, align: 'center', drift: 0.1, behind: 1, echo: true },
    { text: 'MOVE', at: 7, x: 0.5, y: 0.27, size: 0.135, align: 'center', drift: -0.08, behind: 1, accent: true, echo: true },
  ];
}

export interface Stop { y: number; u: number }
/** Scroll position (px) -> u, through the stops measured from the page. */
export function uAt(y: number, stops: Stop[]): number {
  if (!stops.length) return 0;
  if (y <= stops[0].y) return stops[0].u;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (y <= b.y) return b.y === a.y ? b.u : a.u + ((b.u - a.u) * (y - a.y)) / (b.y - a.y);
  }
  return stops[stops.length - 1].u;
}
