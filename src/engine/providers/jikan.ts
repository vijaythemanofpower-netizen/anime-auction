// MyAnimeList characters through Jikan (https://jikan.moe), a free public API.
// Used to fill in characters AniList is missing. Failures are silent: AniList
// stays the main source, and the game works without this.
import type { PublicCharacter } from '../types';
import { mapAniListCharacter } from './anilist';

interface JikanChar {
  mal_id: number;
  name: string;
  nicknames?: string[];
  images?: { jpg?: { image_url?: string } };
  about?: string | null;
  favorites?: number;
}

const cache = new Map<string, PublicCharacter[]>();

export async function searchJikan(text: string, signal?: AbortSignal): Promise<PublicCharacter[]> {
  const q = text.trim();
  if (q.length < 2) return [];
  if (cache.has(q)) return cache.get(q)!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(q)}&order_by=favorites&sort=desc&limit=12`, { signal: ctrl.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: JikanChar[] };
    const out: PublicCharacter[] = [];
    for (const c of json.data ?? []) {
      if (typeof c.mal_id !== 'number' || !c.name) continue;
      try {
        const base = mapAniListCharacter({
          id: c.mal_id, name: { full: c.name, alternative: c.nicknames ?? [] }, image: { large: c.images?.jpg?.image_url ?? null },
          description: c.about ?? null, favourites: c.favorites ?? 0, media: null,
        });
        out.push({ ...base, id: `mal:${c.mal_id}`, source: 'mal', series: 'MyAnimeList', seriesId: 'mal-media:unknown' });
      } catch { /* skip malformed records */ }
    }
    cache.set(q, out);
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** MyAnimeList results whose names are not already in the AniList results. */
export function missingFrom(anilist: PublicCharacter[], mal: PublicCharacter[]): PublicCharacter[] {
  const seen = new Set(anilist.flatMap((c) => [c.name, ...c.aliases]).map(norm));
  // MyAnimeList often writes names surname-first; compare both orders.
  return mal.filter((c) => !seen.has(norm(c.name)) && !seen.has(norm(c.name.split(/,\s*/).reverse().join(' '))));
}
