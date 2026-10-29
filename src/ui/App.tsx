import { useEffect } from 'react';
import { naturalVoices } from './voices';
import { store, useApp } from '../store/store';
import { Logo } from './components/Portrait';
import { Home } from './screens/Home';
import { Explorer } from './screens/Explorer';
import { Setup } from './screens/Setup';
import { GameScreen } from './screens/GameScreen';
import { Hall } from './screens/Hall';
import { HowTo, SettingsScreen } from './screens/Info';
import { Saves } from './screens/Saves';

export function App() {
  const screen = useApp((s) => s.screen);
  const ready = useApp((s) => s.ready);
  const game = useApp((s) => s.game);
  const toast = useApp((s) => s.toast);
  const motion = useApp((s) => s.settings.reducedMotion);
  const naturalOn = useApp((s) => s.settings.voice && s.settings.voiceQuality === 'natural');
  // Warm the natural voices up early so they are ready when a battle starts.
  useEffect(() => { if (naturalOn) naturalVoices.load(); }, [naturalOn]);
  const saving = useApp((s) => s.saving);
  const lastSaved = useApp((s) => s.lastSaved);
  const durable = useApp((s) => s.durable);

  return (
    <div className={`app ${motion === 'on' ? 'reduce-motion' : motion === 'system' ? 'motion-system' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => store.go('home')} aria-label="Home">
          <Logo />
          <span className="brand-name">Anime <em>Auction</em></span>
        </button>
        <div className="spacer" />
        {game && screen !== 'game' && <button className="btn sm primary" onClick={() => store.go('game')}>Return to game</button>}
        {game && <span className="save-indicator" aria-live="polite">{saving ? 'Saving…' : lastSaved ? `Saved ${new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}{!durable && ' (memory only)'}</span>}
        <nav className="row" style={{ gap: 6 }}>
          <button className={`btn sm ghost${screen === 'explorer' ? ' active' : ''}`} onClick={() => store.go('explorer')}>Characters</button>
          <button className={`btn sm ghost${screen === 'hall' ? ' active' : ''}`} onClick={() => store.go('hall')}>Hall</button>
          <button className={`btn sm ghost${screen === 'settings' ? ' active' : ''}`} onClick={() => store.go('settings')} aria-label="Settings">⚙</button>
        </nav>
      </header>
      <main className={`main${screen === 'game' ? ' wide' : ''}`}>
        {!ready ? <div className="empty"><div className="spinner" /></div> : (
          <>
            {screen === 'home' && <Home />}
            {screen === 'explorer' && <Explorer />}
            {screen === 'setup' && <Setup />}
            {screen === 'game' && (game ? <GameScreen /> : <Home />)}
            {screen === 'hall' && <Hall />}
            {screen === 'howto' && <HowTo />}
            {screen === 'settings' && <SettingsScreen />}
            {screen === 'saves' && <Saves />}
          </>
        )}
      </main>
      {toast && <div className={`toast ${toast.kind}`} role="status" aria-live="polite">{toast.text}</div>}
    </div>
  );
}
