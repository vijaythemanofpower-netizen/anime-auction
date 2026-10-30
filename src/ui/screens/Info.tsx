import { useState } from 'react';
import { getApiKey, setApiKey } from '../ai/moveWriter';
import { store, useApp } from '../../store/store';
import { RUNNING_LOCALLY } from '../../store/persistence';
import { Seg } from '../components/common';
import { SYNERGIES } from '../../engine/data/world';
import { ARCHETYPES } from '../../engine/data/archetypes';

export function HowTo() {
  const steps: Array<[string, string]> = [
    ['Create a game', 'Pick 2–6 players (humans or NPC bidders), a roster size of 3 or 4, and your auction and tournament rules. Everyone starts with 10,000 coins.'],
    ['Build the auction pool', 'Browse the Character Explorer and add fighters to this game\'s pool, or auto-fill it. Browsing never adds a character on its own.'],
    ['Bid', 'Fighters are auctioned one at a time. In Live mode everyone bids from one screen and late bids extend the timer. In Turn mode the device passes around and each player bids or passes. You must always keep enough coins to fill your remaining slots.'],
    ['Scout', 'The Scout Advisor rates each lot TAKE, MIGHT TAKE or LEAVE from public information and your situation. Spend a scout token to get a vague hint about a hidden attribute.'],
    ['Reveal', 'After the auction, each player privately sees the true stats, hidden traits, hidden ability and evolution path of the fighters they bought.'],
    ['Prepare', 'Before each match choose fighters, frontline, strategy and mental approach, and spend 2 preparation points on training, recovery, treatment or scouting an opponent.'],
    ['Battle', 'The combat engine simulates every action from stats, abilities, personality, strategy, environment, synergies and seeded randomness. The narrator only describes what the engine decided.'],
    ['Win the tournament', 'Group rounds of solo duels and tag-team battles lead into a squad-battle knockout. Fatigue, injuries, evolutions and rivalries carry forward.'],
  ];
  return (
    <div className="col" style={{ gap: 20, maxWidth: 960 }}>
      <div><div className="eyebrow">Rules</div><h1>How to Play</h1></div>
      <div className="grid grid-2">
        {steps.map(([t, d], i) => (
          <div key={t} className="panel">
            <div className="eyebrow">Step {i + 1}</div>
            <h3 style={{ margin: '4px 0 6px' }}>{t}</h3>
            <p className="muted">{d}</p>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>What decides a battle</h3>
        <p className="muted" style={{ marginBottom: 8 }}>There are no health bars. Fights are a series of exchanges: every attack is met with a dodge, a block, a parry, or a technique of the defender&apos;s own that clashes with it head-on. Only clean hits hurt. They wear a fighter down, can injure an arm, a leg, the ribs or the head, and can knock them down or out. A fight ends with a knockout, a finishing move, a stoppage when someone is too hurt or knocked down three times, or the judges&apos; scorecards.</p>
        <div className="grid grid-2" style={{ gap: 8 }}>
          {[
            ['Guard', 'Blocking spends guard. When it breaks, the fighter is wide open and the next hit lands clean.'],
            ['Injuries', 'A broken arm weakens strikes, a damaged leg slows dodges, cracked ribs drain stamina, a concussion makes a knockout likelier.'],
            ['Condition', 'Fresh, Bruised, Hurt, Battered, Barely standing. The more worn down, the more likely a clean hit ends it.'],
            ['True stats', 'Rolled fresh every game and hidden until you buy. Stronger fighters usually win, but gaps have diminishing returns.'],
            ['Battle form', 'Each fighter has a good or bad day (up to ±12% to attack, defense, speed and technique), shown as TOP FORM or OFF DAY.'],
            ['Moves and type matchups', 'Fire beats ice, holy beats demons, and so on. Signature moves have costs, cooldowns and status effects.'],
            ['The arena', 'Each battleground powers up some elements and has its own hazards.'],
            ['Your preparation', 'Lineup, frontline, strategy, mental approach, training and recovery.'],
            ['Between matches', 'Fatigue carries over, and a serious injury from a fight can too.'],
            ['Momentum and comebacks', 'Knockdowns and clean hits swing momentum; fighters near defeat can awaken.'],
            ['Luck', 'Critical hits, how each exchange is read, and how hard each hit lands.'],
          ].map(([t, d]) => <div key={t}><strong>{t}</strong> <span className="faint">— {d}</span></div>)}
        </div>
        <h3 style={{ marginTop: 14 }}>Your corner</h3>
        <p className="muted">At big moments (a knockdown, a broken guard, a serious injury, a fighter barely standing, or a mid-fight check) the fight pauses and your corner gets the injury report: a body chart of where your fighter is hurt and how badly, plus their guard and stamina. You have 3 calls per fight:</p>
        <div className="grid grid-2" style={{ gap: 8, marginTop: 6 }}>
          {[
            ['🔥 Go all out', 'More attacks and +12% power for 4 actions; the guard drops.'],
            ['🛡️ Guard up', 'Rebuild the guard now and block far more for 4 actions.'],
            ['⚡ Use it NOW', 'Their strongest technique on the next turn.'],
            ['↩️ Call back / Fall back', 'Swap an injured fighter to the back line, or step back to recover in a duel.'],
            ['📣 Send backup', 'Once per fight, a benched teammate bursts in for one strike with their best move.'],
            ['Let them fight', 'Save your calls for later.'],
          ].map(([t, d]) => <div key={t}><strong>{t}</strong> <span className="faint">— {d}</span></div>)}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>Famous rivals (Naruto and Sasuke, Gojo and Sukuna, Goku and Vegeta, Jotaro and Dio...) trade words before the bell and their signature moves clash head-on. Partners from the same series on one team unlock named combos like Gogeta&apos;s Stardust Breaker. Computer players make their own calls.</p>
        <p className="muted" style={{ marginTop: 8 }}>Fighters trash-talk and psych themselves up, and it matters: hot-heads get fired up when mocked, cool heads ignore it, others get rattled. Eager bench fighters may beg to jump in when a teammate is in trouble; choose per fighter in preparation whether they never may, must ask you, or decide for themselves. When the moment is right, twists happen: avenging a fallen partner, a last stand, a second wind, a hidden technique, the arena breaking apart.</p>
        <p className="muted" style={{ marginTop: 8 }}>After each fight, the <b>coach review</b> replays every call you made against every other option from that exact moment, shows which was best, and gives you a coach IQ and titles.</p>
        <p className="faint" style={{ marginTop: 8 }}>After every battle, “What decided it” re-runs the identical matchup 60 times with different luck and shows how often each side wins, so you can tell an expected result from an upset.</p>
      </div>
      <div className="panel">
        <h3>Archetypes</h3>
        <div className="grid grid-2" style={{ gap: 8 }}>
          {Object.values(ARCHETYPES).map((a) => <div key={a.id}><strong>{a.id}</strong> <span className="faint">({a.role}, {a.reach}) — {a.description}</span></div>)}
        </div>
      </div>
      <div className="panel">
        <h3>Known synergies</h3>
        <p className="faint" style={{ marginBottom: 8 }}>Each requirement must be met by a different fighter in the battle. Some synergies are secret and only appear once discovered in battle.</p>
        <div className="grid grid-2" style={{ gap: 8 }}>
          {SYNERGIES.filter((s) => !s.hidden).map((s) => <div key={s.id}><strong>{s.name}</strong> <span className="faint">— {s.requires.map((r) => r.tag ?? r.archetype).join(' + ')}: {s.description}</span></div>)}
          <div className="faint">+ {SYNERGIES.filter((s) => s.hidden).length} hidden synergies waiting to be discovered.</div>
        </div>
      </div>
      <div className="panel">
        <h3>Keyboard</h3>
        <p className="muted">All controls are reachable with <kbd>Tab</kbd>; activate with <kbd>Enter</kbd> or <kbd>Space</kbd>; close dialogs with <kbd>Esc</kbd>. In battle, <kbd>Space</kbd> pauses and resumes.</p>
      </div>
    </div>
  );
}

function ApiKeyField() {
  const [saved, setSaved] = useState(() => !!getApiKey());
  const [value, setValue] = useState('');
  return (
    <div className="field">
      <span className="label">AI move writer (optional)</span>
      <span className="faint" style={{ fontSize: 12 }}>With your own Anthropic API key, Claude can write the real moves from the series and a canon-based stat sheet for any character you find (a few cents each). The key is kept only in this browser and sent only to Anthropic.</span>
      {saved ? (
        <div className="row" style={{ gap: 8 }}><span className="tag" style={{ color: 'var(--good)' }}>Key saved</span><button className="btn sm ghost" onClick={() => { setApiKey(''); setSaved(false); }}>Remove key</button></div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <input className="input" type="password" autoComplete="off" placeholder="sk-ant-..." value={value} onChange={(e) => setValue(e.target.value)} aria-label="Anthropic API key" style={{ flex: 1, minWidth: 180 }} />
          <button className="btn sm primary" disabled={!value.trim()} onClick={() => { setApiKey(value); setValue(''); setSaved(true); }}>Save key</button>
        </div>
      )}
    </div>
  );
}

export function SettingsScreen() {
  const s = useApp((x) => x.settings);
  const durable = useApp((x) => x.durable);
  return (
    <div className="col" style={{ gap: 18, maxWidth: 720 }}>
      <div><div className="eyebrow">Preferences</div><h1>Settings</h1></div>
      <div className="panel col">
        <div className="field">
          <span className="label">Narration speed</span>
          <Seg value={s.narrationSpeed} onChange={(v) => store.updateSettings({ narrationSpeed: v })} label="Narration speed"
            options={[{ v: 0.5, label: 'Slow' }, { v: 1, label: 'Normal' }, { v: 2, label: 'Fast' }, { v: 4, label: 'Very fast' }]} />
        </div>
        <ApiKeyField />
        <div className="field">
          <span className="label">Battle sounds</span>
          <Seg value={s.sound ? 'on' : 'off'} onChange={(v) => store.updateSettings({ sound: v === 'on' })} label="Battle sounds"
            options={[{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }]} />
        </div>
        <div className="field">
          <span className="label">Battle music</span>
          <Seg value={s.music ? 'on' : 'off'} onChange={(v) => store.updateSettings({ music: v === 'on' })} label="Battle music"
            options={[{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }]} />
          <span className="faint" style={{ fontSize: 12 }}>Each fight gets a battle theme that suits its fighters. To use a character&apos;s real theme, add a song you own on their card under &ldquo;Your sounds&rdquo; (for that character, or for everyone from their series).</span>
        </div>
        <div className="field">
          <span className="label">Voices</span>
          <Seg value={!s.voice ? 'off' : s.voiceQuality} onChange={(v) => store.updateSettings(v === 'off' ? { voice: false } : { voice: true, voiceQuality: v })} label="Voices"
            options={[{ v: 'off', label: 'Off' }, { v: 'system', label: 'Basic (built-in)' }, { v: 'natural', label: 'Natural (download)' }]} />
          <span className="faint" style={{ fontSize: 12 }}>Natural voices give every character their own original voice. They download once (about 300 MB with a graphics card, about 90 MB without) and run on this device.</span>
        </div>
        <div className="field">
          <span className="label">Battle view</span>
          <Seg value={s.battleView} onChange={(v) => store.updateSettings({ battleView: v })} label="Battle view"
            options={[{ v: 'comic', label: '📖 Comic' }, { v: 'arena', label: '🎬 Arena' }]} />
        </div>
        <div className="field">
          <span className="label">Comic drawings</span>
          <Seg value={s.aiDrawings ? 'on' : 'off'} onChange={(v) => store.updateSettings({ aiDrawings: v === 'on' })} label="Comic drawings"
            options={[{ v: 'on', label: 'Draw with the local AI' }, { v: 'off', label: 'Portraits only' }]} />
          <span className="faint" style={{ fontSize: 12 }}>Every battle is drawn as its own comic by a free anime drawing model running on this computer (ComfyUI, started by Start Game.bat). Nothing is sent online. Without it, panels use the characters&apos; portraits.{!RUNNING_LOCALLY && ' Playing on a website: turn this on only if you run the drawing app yourself; your browser will ask to let this page reach it.'}</span>
        </div>
        <div className="field">
          <span className="label">Comic length</span>
          <Seg value={s.comicLength} onChange={(v) => store.updateSettings({ comicLength: v })} label="Comic length"
            options={[{ v: 'short', label: 'Short (16 panels)' }, { v: 'full', label: 'Full (32)' }, { v: 'epic', label: 'Epic (50)' }]} />
          <span className="faint" style={{ fontSize: 12 }}>Longer comics take longer to draw before the fight starts: roughly 1½, 3 or 4½ minutes.</span>
        </div>
        <div className="field">
          <span className="label">Comic style</span>
          <Seg value={s.comicStyle} onChange={(v) => store.updateSettings({ comicStyle: v })} label="Comic style"
            options={[{ v: 'color', label: 'Colour anime' }, { v: 'manga', label: 'Black & white manga' }]} />
        </div>
        <div className="field">
          <span className="label">Reduced motion</span>
          <Seg value={s.reducedMotion} onChange={(v) => store.updateSettings({ reducedMotion: v })} label="Reduced motion"
            options={[{ v: 'system', label: 'Follow system' }, { v: 'on', label: 'Reduce' }, { v: 'off', label: 'Full motion' }]} />
        </div>
        <label className="toggle"><input type="checkbox" checked={s.useOnlineProvider} onChange={(e) => store.updateSettings({ useOnlineProvider: e.target.checked })} /> Allow online character search (AniList)</label>
        <label className="toggle"><input type="checkbox" checked={s.privacyDefault} onChange={(e) => store.updateSettings({ privacyDefault: e.target.checked })} /> Privacy hand-off screens on by default for new games</label>
      </div>
      <div className="panel col">
        <h3>Storage</h3>
        <p className="muted">{durable ? 'Games, battles and the Hall of Legends are stored in this browser (IndexedDB).' : 'IndexedDB is unavailable, so data is kept in memory only. Export your game to keep it.'}</p>
        <div className="row">
          <button className="btn" onClick={() => store.go('saves')}>Manage saves</button>
          <button className="btn danger" onClick={() => { if (confirm('Clear the Hall of Legends? This cannot be undone.')) void store.clearHall(); }}>Clear Hall of Legends</button>
        </div>
      </div>
    </div>
  );
}
