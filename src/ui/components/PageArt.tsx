// Manga-style page dressing: a huge vertical katakana title down the edge of each
// page and a faded character poster on the other side, a different character
// each time you change page. Purely decorative and behind the content.
import { useMemo } from 'react';
import type { Screen } from '../../store/store';
import { LEGEND_CHARACTERS } from '../../engine/data/legends';

const KANA: Record<Screen, string> = {
  home: 'アニメオークション', explorer: 'キャラクター', setup: 'ゲーム作成', game: 'バトル', hall: '殿堂',
  howto: '遊び方', settings: '設定', saves: 'セーブ', online: 'オンライン',
};

export function PageArt({ screen, phase }: { screen: Screen; phase?: string }) {
  // The game screen's title follows the phase: auction, preparation or battle.
  const kana = screen === 'game' && phase ? (phase === 'auction' || phase === 'pool' ? 'オークション' : phase === 'champion' ? 'チャンピオン' : 'バトル') : KANA[screen];
  const poster = useMemo(() => LEGEND_CHARACTERS[Math.floor(Math.random() * LEGEND_CHARACTERS.length)], [screen]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page-art" aria-hidden="true">
      <div className="kana-title" key={kana}>{kana}</div>
      {screen !== 'home' && poster.imageUrl && <img className="page-poster" key={poster.id} src={poster.imageUrl} alt="" referrerPolicy="no-referrer" />}
    </div>
  );
}
