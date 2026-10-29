import type { CharacterProvider, SearchPage, SearchQuery } from './provider';
import { ORIGINAL_CHARACTERS, ORIGINAL_SERIES } from '../data/originals';
import type { PublicCharacter } from '../types';
import { LEGEND_CHARACTERS, LEGEND_SERIES } from '../data/legends';

/** Searches the complete local original catalog (not just a loaded page). */
export function searchLocal(all: PublicCharacter[], q: SearchQuery): SearchPage {
  const text = q.text.trim().toLowerCase();
  let list = all.filter((c) => {
    if (q.archetype && c.archetype !== q.archetype) return false;
    if (q.tag && !c.tags.includes(q.tag)) return false;
    if (q.seriesId && c.seriesId !== q.seriesId) return false;
    if (!text) return true;
    if (q.field === 'series') return c.series.toLowerCase().includes(text);
    return c.name.toLowerCase().includes(text) || c.aliases.some((a) => a.toLowerCase().includes(text));
  });
  list = list.slice().sort((a, b) =>
    q.sort === 'series' ? a.series.localeCompare(b.series) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const start = (q.page - 1) * q.perPage;
  return { items: list.slice(start, start + q.perPage), page: q.page, hasNext: start + q.perPage < list.length, total: list.length };
}

export const localProvider: CharacterProvider = {
  id: 'original',
  label: 'Arena Originals',
  online: false,
  async search(q) {
    return searchLocal(ORIGINAL_CHARACTERS, q);
  },
  async getSeries(seriesId) {
    const s = ORIGINAL_SERIES.find((x) => x.id === seriesId);
    if (!s) throw new Error('Unknown series');
    return {
      series: { id: s.id, title: s.title, synopsis: s.synopsis, source: 'original' },
      characters: ORIGINAL_CHARACTERS.filter((c) => c.seriesId === seriesId),
    };
  },
};

export const legendProvider: CharacterProvider = {
  id: 'legend',
  label: 'Anime Legends',
  online: false,
  async search(q) {
    return searchLocal(LEGEND_CHARACTERS, q);
  },
  async getSeries(seriesId) {
    const s = LEGEND_SERIES.find((x) => x.id === seriesId);
    if (!s) throw new Error('Unknown series');
    return { series: { id: s.id, title: s.title, synopsis: s.synopsis, source: 'legend' }, characters: LEGEND_CHARACTERS.filter((c) => c.seriesId === seriesId) };
  },
};
