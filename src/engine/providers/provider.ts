import type { Archetype, PublicCharacter, Tag } from '../types';

export interface SearchQuery {
  text: string;
  /** Search by character name or by series/anime title. */
  field: 'name' | 'series';
  archetype?: Archetype | '';
  tag?: Tag | '';
  seriesId?: string;
  sort: 'name' | 'series' | 'popular';
  page: number;
  perPage: number;
}

export interface SearchPage {
  items: PublicCharacter[];
  page: number;
  hasNext: boolean;
  total?: number;
}

export interface SeriesInfo {
  id: string;
  title: string;
  synopsis: string;
  source: 'original' | 'anilist' | 'legend' | 'mal';
}

export interface CharacterProvider {
  id: 'original' | 'anilist' | 'legend';
  label: string;
  online: boolean;
  search(q: SearchQuery, signal?: AbortSignal): Promise<SearchPage>;
  getSeries(seriesId: string, signal?: AbortSignal): Promise<{ series: SeriesInfo; characters: PublicCharacter[] }>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}
