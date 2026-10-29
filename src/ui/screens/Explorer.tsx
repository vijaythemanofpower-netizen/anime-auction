import { useCallback, useEffect, useRef, useState } from 'react';
import type { Archetype, PublicCharacter, Tag } from '../../engine/types';
import type { CharacterProvider, SearchQuery, SeriesInfo } from '../../engine/providers/provider';
import { legendProvider, localProvider } from '../../engine/providers/local';
import { LEGEND_CHARACTERS, LEGEND_SERIES } from '../../engine/data/legends';
import { aniListProvider, randomPopular } from '../../engine/providers/anilist';
import { ORIGINAL_CHARACTERS, ORIGINAL_SERIES } from '../../engine/data/originals';
import { ARCHETYPES } from '../../engine/data/archetypes';
import * as G from '../../engine/game';
import { store, useApp } from '../../store/store';
import { CharacterCard, Modal, PublicProfile, Seg, SourceBadge } from '../components/common';
import { CharArt } from '../components/Portrait';
import { MySounds } from '../components/MySounds';
import { AiMoves } from '../components/AiMoves';
import { withAiMoves } from '../ai/moveWriter';
import { missingFrom, searchJikan } from '../../engine/providers/jikan';

const TAGS: Tag[] = ['FIRE', 'ICE', 'LIGHTNING', 'WATER', 'WIND', 'EARTH', 'DRAGON', 'DEMON', 'DARK', 'SHADOW', 'HOLY', 'DIVINE', 'MAGIC', 'SPIRIT', 'WARRIOR'];
const PER_PAGE = 16;

export function Explorer({ embedded }: { embedded?: boolean }) {
  const settings = useApp((s) => s.settings);
  const game = useApp((s) => s.game);
  const recent = useApp((s) => s.recent);
  const poolMode = !!game && game.phase === 'pool';
  const [source, setSource] = useState<'legend' | 'original' | 'anilist'>(settings.useOnlineProvider ? 'anilist' : 'legend');
  const provider: CharacterProvider = source === 'anilist' ? aniListProvider : source === 'legend' ? legendProvider : localProvider;
  const catalog = source === 'original' ? ORIGINAL_CHARACTERS : LEGEND_CHARACTERS;
  const seriesList = source === 'original' ? ORIGINAL_SERIES : LEGEND_SERIES;
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [field, setField] = useState<'name' | 'series'>('name');
  const [archetype, setArchetype] = useState<Archetype | ''>('');
  const [tag, setTag] = useState<Tag | ''>('');
  const [seriesId, setSeriesId] = useState('');
  const [sort, setSort] = useState<SearchQuery['sort']>('name');
  const [items, setItems] = useState<PublicCharacter[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PublicCharacter | null>(null);
  const [series, setSeries] = useState<{ series: SeriesInfo; characters: PublicCharacter[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(text), 400); return () => clearTimeout(t); }, [text]);

  const load = useCallback(async (p: number, append: boolean) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const r = await provider.search({ text: debounced, field, archetype, tag, seriesId: source !== 'anilist' ? seriesId : undefined, sort, page: p, perPage: PER_PAGE }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      r.items = r.items.map(withAiMoves);
      // A name search also checks MyAnimeList for characters AniList is missing.
      if (source === 'anilist' && field === 'name' && p === 1 && debounced.trim()) {
        const extra = missingFrom(r.items, await searchJikan(debounced, ctrl.signal)).map(withAiMoves);
        if (ctrl.signal.aborted) return;
        r.items = [...r.items, ...extra];
      }
      setItems((prev) => {
        if (!append) return r.items;
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...r.items.filter((c) => !seen.has(c.id))];
      });
      setPage(p);
      setHasNext(r.hasNext);
      setTotal(r.total);
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message || 'Search failed.');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [provider, debounced, field, archetype, tag, seriesId, sort, source]);

  useEffect(() => { void load(1, false); }, [load]);

  const open = (c: PublicCharacter) => { setDetail(c); store.viewCharacter(c); };
  const inPool = (id: string) => !!game?.pool.includes(id);
  const toggle = (c: PublicCharacter) => {
    if (!poolMode) return;
    if (inPool(c.id)) store.act((g) => G.removeFromPool(g, c.id));
    else store.act((g, v) => G.addToPool(g, v, c));
  };

  const randomCharacter = async () => {
    if (source !== 'anilist') return open(catalog[Math.floor(Math.random() * catalog.length)]);
    try {
      const [c] = await randomPopular(1);
      if (c) open(c);
    } catch (e) { store.toast((e as Error).message, 'error'); }
  };
  const randomAnime = async () => {
    try {
      if (source !== 'anilist') {
        const s = seriesList[Math.floor(Math.random() * seriesList.length)];
        setSeries(await (source === 'legend' ? legendProvider : localProvider).getSeries(s.id));
      } else {
        const r = await aniListProvider.search({ text: '', field: 'name', sort: 'popular', page: 1 + Math.floor(Math.random() * 40), perPage: 25 });
        const c = r.items[Math.floor(Math.random() * r.items.length)];
        if (c) setSeries(await aniListProvider.getSeries(c.seriesId));
      }
    } catch (e) { store.toast((e as Error).message, 'error'); }
  };
  const surprise = async () => {
    if (poolMode && game) {
      let picks = catalog;
      if (source === 'anilist') {
        try { picks = await randomPopular(25); } catch (e) { store.toast((e as Error).message, 'error'); return; }
      }
      const r = store.act((g, v) => G.autoFillPool(g, v, picks, Math.min(60, g.pool.length + 3)));
      if (r.ok) store.toast('Three surprise fighters joined the pool!', 'success');
    } else void randomCharacter();
  };
  const openSeries = async (c: PublicCharacter) => {
    try { setSeries(await (c.source === 'anilist' ? aniListProvider : c.source === 'legend' ? legendProvider : localProvider).getSeries(c.seriesId)); } catch (e) { store.toast((e as Error).message, 'error'); }
  };

  return (
    <div className="col" style={{ gap: 18 }}>
      {!embedded && (
        <div className="section-head">
          <div><div className="eyebrow">Character database</div><h1>Character Explorer</h1></div>
          {poolMode && <button className="btn primary" onClick={() => store.go('game')}>Back to pool ({game!.pool.length})</button>}
        </div>
      )}
      <div className="panel col" style={{ gap: 12 }}>
        <div className="row">
          <Seg value={source} label="Data source" onChange={(v) => { setSource(v); setItems([]); setSeriesId(''); }}
            options={[...(settings.useOnlineProvider ? [{ v: 'anilist' as const, label: 'All Anime' }] : []), { v: 'legend', label: 'Signature Legends' }, { v: 'original', label: 'Arena Originals' }]} />
          <Seg value={field} label="Search field" onChange={setField} options={[{ v: 'name', label: 'Character' }, { v: 'series', label: 'Anime title' }]} />
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder={field === 'name' ? 'Search characters…' : 'Search anime titles…'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Search" />
        </div>
        <div className="row">
          <select className="input" value={archetype} onChange={(e) => setArchetype(e.target.value as Archetype | '')} aria-label="Filter by archetype">
            <option value="">All archetypes</option>
            {Object.keys(ARCHETYPES).map((a) => <option key={a}>{a}</option>)}
          </select>
          <select className="input" value={tag} onChange={(e) => setTag(e.target.value as Tag | '')} aria-label="Filter by tag">
            <option value="">All tags</option>
            {TAGS.map((t) => <option key={t}>{t}</option>)}
          </select>
          {source !== 'anilist' && (
            <select className="input" value={seriesId} onChange={(e) => setSeriesId(e.target.value)} aria-label="Filter by series">
              <option value="">All series</option>
              {seriesList.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          {source !== 'anilist' && (
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SearchQuery['sort'])} aria-label="Sort">
              <option value="name">Sort: Name</option>
              <option value="series">Sort: Series</option>
            </select>
          )}
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn sm" onClick={randomCharacter}>Random Character</button>
          <button className="btn sm" onClick={randomAnime}>Random Anime</button>
          <button className="btn sm gold" onClick={surprise} title={poolMode ? 'Add 3 random fighters to the pool' : 'Open a random character'}>Surprise Me</button>
        </div>
        {source === 'legend' && <p className="faint">Real anime characters with their official AniList artwork (needs an internet connection to show pictures) and the moves they use in their series. Combat stats are rolled fresh every game, so nobody is guaranteed to win.</p>}
        {source === 'anilist' && <p className="faint">Every character on AniList (well over 100,000), most popular first. Search a name, or switch to <b>Anime title</b> to get a show's whole cast. Characters marked <span className="tag src-legend">ANIME</span> have their real signature moves; the rest get moves matched to their style and element. Filters apply to the loaded page.</p>}
      </div>

      {recent.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Recently viewed</div>
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}>
            {recent.map((c) => (
              <button key={c.id} className="btn sm" onClick={() => open(c)} style={{ flexShrink: 0 }}>{c.name}</button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="panel row" style={{ justifyContent: 'space-between', borderColor: 'var(--bad)' }}>
          <span>{error}</span>
          <div className="row">
            <button className="btn sm" onClick={() => load(1, false)}>Retry</button>
            {source === 'anilist' && <button className="btn sm" onClick={() => setSource('original')}>Use Arena Originals</button>}
          </div>
        </div>
      )}

      {!loading && !error && items.length === 0 && <div className="panel empty">No characters match your search.</div>}

      <div className="cards">
        {items.map((c) => (
          <CharacterCard key={c.id} c={c} onClick={() => open(c)} selected={inPool(c.id)}
            corner={poolMode ? (
              <button className={`btn sm ${inPool(c.id) ? 'gold' : 'primary'}`} onClick={(e) => { e.stopPropagation(); toggle(c); }} aria-label={inPool(c.id) ? `Remove ${c.name} from pool` : `Add ${c.name} to pool`}>
                {inPool(c.id) ? '✓ In pool' : '+ Pool'}
              </button>
            ) : undefined} />
        ))}
      </div>
      {loading && <div className="empty"><div className="spinner" /></div>}
      <div className="row" style={{ justifyContent: 'center' }}>
        {hasNext && !loading && <button className="btn" onClick={() => load(page + 1, true)}>Load more</button>}
        {total !== undefined && <span className="faint">{items.length} of {total} shown</span>}
      </div>

      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <div className="reveal-card">
            <div className="lot-art"><CharArt c={detail} /></div>
            <div className="col">
              <div className="row"><SourceBadge c={detail} /><button className="btn sm ghost" onClick={() => openSeries(detail)}>{detail.series} →</button></div>
              <PublicProfile c={detail} />
              <p className="faint">True power, combat stats, hidden traits and the hidden ability are revealed only after purchase.</p>
              <AiMoves c={detail} onChange={(c) => { setDetail(c); setItems((prev) => prev.map((x) => (x.id === c.id ? c : x))); store.viewCharacter(c); }} />
              <MySounds c={detail} />
              {poolMode && (
                <button className={`btn ${inPool(detail.id) ? 'danger' : 'primary'}`} onClick={() => toggle(detail)}>
                  {inPool(detail.id) ? 'Remove from auction pool' : 'Add to auction pool'}
                </button>
              )}
              {!game && <p className="faint">Create a game to add characters to an auction pool.</p>}
            </div>
          </div>
        </Modal>
      )}
      {series && (
        <Modal title={series.series.title} onClose={() => setSeries(null)} wide>
          <p className="muted" style={{ marginBottom: 14 }}>{series.series.synopsis || 'No synopsis available.'} {series.series.source === 'original' && <span className="tag src-original">ORIGINAL SERIES</span>}</p>
          <div className="cards">
            {series.characters.map((c) => <CharacterCard key={c.id} c={c} onClick={() => { setSeries(null); open(c); }} selected={inPool(c.id)} />)}
          </div>
        </Modal>
      )}
    </div>
  );
}
