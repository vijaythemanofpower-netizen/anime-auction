// The home page as a scroll-driven film, in the spirit of the anime game's home: one pinned
// stage, scrubbed by scrolling, giant outlined words, short copy per beat. Each beat has its own
// painted scene (public/art, drawn locally by tools/make-art.ts); scrolling crossfades between
// them with a slow zoom. Reduced motion shows the same beats as stills.
import { useEffect, useRef, type ReactNode } from 'react';

export interface Beat { at: number; word: string; art: number; kicker?: string; body?: ReactNode; place: 'hero' | 'low-left' | 'low-right' | 'final' }

const LAST = 6;
const ART = `${import.meta.env.BASE_URL}art`;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
/** How present a beat is at scene position u (0 far away, 1 on screen). */
const presence = (u: number, at: number) => smooth(1 - Math.abs(u - at) / 0.48);
/** Pictures crossfade over a wider window than the words, so there is never a black gap. */
const sceneAt = (u: number, at: number) => smooth(1 - Math.abs(u - at) / 1.0);

export function HomeFilm({ beats, still }: { beats: Beat[]; still: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.film = '';
    return () => { delete document.documentElement.dataset.film; };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el || still) return;
    let raf = 0, u = 0;
    const pics = [...el.querySelectorAll<HTMLElement>('.cf-pic')];
    const words = [...el.querySelectorAll<HTMLElement>('.cf-word')];
    const copy = [...el.querySelectorAll<HTMLElement>('.cf-beat')];
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const r = el.getBoundingClientRect();
      const target = clamp(-r.top / Math.max(1, el.offsetHeight - window.innerHeight)) * LAST;
      if (Math.abs(target - u) < 0.0005) return;
      u += (target - u) * 0.12;
      beats.forEach((b, i) => {
        const d = u - b.at;
        pics[i].style.opacity = String(sceneAt(u, b.at));
        pics[i].style.transform = `scale(${(1.06 + d * 0.05).toFixed(4)})`;
        const p = presence(u, b.at);
        words[i].style.opacity = String(p);
        words[i].style.transform = `translate3d(${(-d * 6).toFixed(2)}vw, 0, 0) scale(${(1 + Math.abs(d) * 0.08).toFixed(3)})`;
        copy[i].style.opacity = String(p);
        copy[i].style.transform = `translate3d(0, ${((1 - p) * (d < 0 ? 24 : -24)).toFixed(1)}px, 0)`;
        const on = p > 0.5;
        if (copy[i].classList.contains('on') !== on) { copy[i].classList.toggle('on', on); copy[i].toggleAttribute('inert', !on); }
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [beats, still]);

  if (still) {
    return (
      <div ref={root} className="cf stills">
        {beats.map((b) => (
          <section key={b.at} className={`cf-still cf-beat at-${b.place} on`}>
            <img className="cf-pic" src={`${ART}/${b.art}.webp`} alt="" loading={b.at ? 'lazy' : 'eager'} />
            <Copy b={b} heading />
          </section>
        ))}
      </div>
    );
  }
  return (
    <div ref={root} className="cf">
      <div className="cf-stage">
        {beats.map((b) => <img key={b.at} className="cf-pic" src={`${ART}/${b.art}.webp`} alt="" style={{ opacity: b.at ? 0 : 1 }} {...(b.at ? { loading: 'lazy' as const } : { fetchpriority: 'high' })} />)}
        <div className="cf-shade" aria-hidden="true" />
        <div className="cf-seam" aria-hidden="true" />
        {beats.map((b) => <div key={b.at} className={`cf-word ${b.at === 0 ? 'cf-title' : ''}`} aria-hidden="true" style={{ opacity: b.at ? 0 : 1 }}>{b.word}</div>)}
        {beats.map((b) => <section key={b.at} className={`cf-beat at-${b.place}${b.at ? '' : ' on'}`} style={{ opacity: b.at ? 0 : 1 }}><Copy b={b} /></section>)}
        <div className="cf-scroll" aria-hidden="true">Scroll</div>
      </div>
    </div>
  );
}

function Copy({ b, heading = false }: { b: Beat; heading?: boolean }) {
  const H = b.at === 0 ? 'h1' : 'h2';
  return (
    <>
      {b.kicker && <div className="cf-kicker">{b.kicker}</div>}
      <H className={heading ? 'cf-heading' : 'cf-sr'}>{b.word}</H>
      {b.body && <div className="cf-body">{b.body}</div>}
    </>
  );
}
