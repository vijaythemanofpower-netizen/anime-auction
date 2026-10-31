// Play Online: sign in, pick a name, then create a room (and share its code)
// or join a friend's room with theirs. The host sets up the game in the lobby.
import { useEffect, useState } from 'react';
import { ONLINE_AVAILABLE, PUBLIC_SITE } from '../../online/client';
import { RUNNING_LOCALLY } from '../../store/persistence';
import { saveDisplayName, signInAsGuest, signOut, useAuth } from '../../online/auth';
import { openAccountDialog } from '../components/AccountMenu';
import { MAX_PLAYERS, createRoom, joinRoom, leaveRoom, listCloudSaves, resumeCloudSave, startOnlineGame, updateLobby, useRoom, type CloudSave } from '../../online/room';
import { matchOrder } from '../../engine/tournament';
import { store, useApp } from '../../store/store';
import { Seg } from '../components/common';

/** A code from a shared link (…?room=KX7P2Q), used once. */
export function codeFromLink(): string {
  const code = new URLSearchParams(location.search).get('room') ?? '';
  return /^[A-HJ-NP-Z2-9]{6}$/i.test(code) ? code.toUpperCase() : '';
}

export function OnlineScreen() {
  const a = useAuth();
  const room = useRoom();
  if (!ONLINE_AVAILABLE) return <Panel title="Online play isn't set up"><p className="muted">This copy of the game was built without an online service, so only local games are available.</p></Panel>;
  if (!a.ready) return <div className="empty"><div className="spinner" /></div>;
  if (!a.userId) return <SignIn />;
  if (!a.profile) return <PickName />;
  if (room) return <Lobby />;
  return <Rooms />;
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 18, maxWidth: 640, margin: '0 auto' }}>
      <div><div className="eyebrow">{eyebrow ?? 'Play online'}</div><h1>{title}</h1></div>
      <div className="panel col" style={{ gap: 12 }}>{children}</div>
    </div>
  );
}

/** Guests can attach an email and password to keep this same account, with its record. */
function KeepAccount() {
  return <button className="btn sm primary" onClick={() => openAccountDialog('create')}>Save this account (email + password)</button>;
}

function SignIn() {
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Sign in to play online" eyebrow="Online">
      <p>Sign in with your email and password so your wins follow you. No waiting for an email each time.</p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => openAccountDialog('signin')}>Sign in</button>
        <button className="btn" onClick={() => openAccountDialog('create')}>Create account</button>
        <button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); try { await signInAsGuest(); } catch (e) { store.toast((e as Error).message, 'error'); } finally { setBusy(false); } }}>Play as guest</button>
      </div>
      <span className="faint">Guest accounts stay in this browser only; you can save one with an email and password later.</span>
    </Panel>
  );
}

function PickName() {
  const a = useAuth();
  const [name, setName] = useState(a.email?.split('@')[0].slice(0, 24) ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Choose your player name">
      <p className="muted">This is what your friends see in rooms and on the scoreboard.</p>
      <form className="row" style={{ gap: 8 }} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { await saveDisplayName(name); } catch (err) { store.toast((err as Error).message, 'error'); } finally { setBusy(false); }
      }}>
        <input className="input" style={{ flex: 1 }} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} aria-label="Player name" required />
        <button className="btn primary" disabled={busy || !name.trim()}>Save</button>
      </form>
    </Panel>
  );
}

function Rooms() {
  const a = useAuth();
  const [code, setCode] = useState(codeFromLink());
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [saves, setSaves] = useState<CloudSave[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(a.profile!.display_name);
  useEffect(() => { void listCloudSaves().then(setSaves).catch(() => {}); }, []);
  const run = async (kind: 'create' | 'join', fn: () => Promise<unknown>) => {
    setBusy(kind);
    try { await fn(); if (codeFromLink()) history.replaceState(null, '', location.pathname); } catch (e) { store.toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };
  const p = a.profile!;
  return (
    <div className="col" style={{ gap: 18, maxWidth: 820, margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><div className="eyebrow">Play online</div><h1>Play with friends</h1></div>
        <div className="panel tight row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {renaming ? (
            <form className="row" style={{ gap: 6 }} onSubmit={async (e) => { e.preventDefault(); try { await saveDisplayName(name); setRenaming(false); } catch (err) { store.toast((err as Error).message, 'error'); } }}>
              <input className="input" style={{ minHeight: 32, width: 160 }} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} aria-label="Player name" />
              <button className="btn sm primary">Save</button>
            </form>
          ) : (
            <>
              <div><strong>{p.display_name}</strong>{a.guest && <span className="tag" style={{ marginLeft: 6 }} title="Guest accounts stay in this browser only">GUEST</span>}<div className="faint">{p.games_played} played · {p.wins} won{p.best_iq ? ` · best coach IQ ${p.best_iq}` : ''}</div></div>
              <button className="btn sm ghost" onClick={() => setRenaming(true)}>Rename</button>
              <button className="btn sm ghost" onClick={() => void signOut()}>Sign out</button>
            </>
          )}
          {a.guest && !renaming && <div style={{ flexBasis: '100%' }}><KeepAccount /></div>}
        </div>
      </div>
      <div className="grid grid-2">
        <div className="panel col" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>Host a game</h3>
          <p className="muted" style={{ margin: 0 }}>Create a room and share its code. You choose the rules and start when everyone is in.</p>
          <button className="btn primary lg" disabled={!!busy} onClick={() => run('create', createRoom)}>{busy === 'create' ? 'Creating…' : '✦ Create a room'}</button>
        </div>
        <form className="panel col" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (code.length === 6) void run('join', () => joinRoom(code)); }}>
          <h3 style={{ margin: 0 }}>Join a friend</h3>
          <p className="muted" style={{ margin: 0 }}>Type the 6-character code your friend shared.</p>
          <input className="input room-code-input" maxLength={6} placeholder="KX7P2Q" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} aria-label="Room code" autoCapitalize="characters" spellCheck={false} />
          <button className="btn primary lg" disabled={!!busy || code.length !== 6}>{busy === 'join' ? 'Joining…' : 'Join room'}</button>
        </form>
      </div>
      {saves.length > 0 && (
        <div className="panel col" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Your online games</h3>
          <p className="faint" style={{ margin: 0 }}>Games you host are saved to your account, so you can pick them up on any device. Your friends rejoin with the same code.</p>
          {saves.map((s) => (
            <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span><strong>{s.name}</strong> <span className="faint">· room {s.room_code} · {new Date(s.updated_at).toLocaleString()}</span></span>
              <button className="btn sm" onClick={() => run('create', () => resumeCloudSave(s.id))}>Resume</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Lobby() {
  const room = useRoom()!;
  const game = useApp((s) => s.game);
  const [starting, setStarting] = useState(false);
  const host = room.role === 'host';
  const s = room.settings;
  // A host playing from their own computer (localhost) still invites friends to the website.
  const link = `${RUNNING_LOCALLY ? PUBLIC_SITE : location.origin + location.pathname}?room=${room.code}`;
  const copy = (text: string, what: string) => { void navigator.clipboard?.writeText(text).then(() => store.toast(`${what} copied.`, 'success')).catch(() => {}); };
  const humans = room.members.length;
  const total = humans + Math.min(s.npcs, MAX_PLAYERS - humans);
  if (room.started && game) {
    return (
      <Panel title="Game in progress" eyebrow={`Room ${room.code}`}>
        <p>{host ? 'You are hosting this game. Keep this tab open: your friends play through it.' : 'You are playing in this room.'}</p>
        <Members />
        <div className="row">
          <button className="btn primary" onClick={() => store.go('game')}>Back to the game</button>
          <button className="btn ghost" onClick={() => { if (confirm(host ? 'Leave the room? Your friends will be disconnected until you resume it.' : 'Leave this game?')) void leaveRoom().then(() => store.go('online')); }}>Leave room</button>
        </div>
      </Panel>
    );
  }
  return (
    <div className="col" style={{ gap: 18, maxWidth: 820, margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><div className="eyebrow">{host ? 'Your room' : 'Lobby'}</div><h1>Room <span className="room-code">{room.code}</span></h1></div>
        <div className="row">
          <button className="btn sm" onClick={() => copy(room.code, 'Room code')}>Copy code</button>
          <button className="btn sm" onClick={() => copy(link, 'Invite link')}>Copy invite link</button>
        </div>
      </div>
      {!room.connected && <div className="panel" style={{ borderColor: 'var(--warn)' }}>Connecting to the room…</div>}
      {room.started && !game && <div className="panel"><div className="spinner" /> The game is starting…</div>}
      <div className="grid grid-2">
        <div className="panel col" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>Players ({humans}/{MAX_PLAYERS})</h3>
          <Members />
          {s.npcs > 0 && <div className="faint">+ {Math.min(s.npcs, MAX_PLAYERS - humans)} computer player{s.npcs > 1 ? 's' : ''}</div>}
          <p className="faint" style={{ margin: 0 }}>Share the code <strong>{room.code}</strong> or the invite link. Friends sign in (as a guest is fine) to join.</p>
          <p className="faint invite-link" style={{ margin: 0 }}>{link}</p>
        </div>
        <div className="panel col" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>Rules</h3>
          {host ? (
            <>
              <div className="field"><span className="label">Game mode</span><Seg value={s.focus ?? 'tournament'} onChange={(v) => updateLobby({ focus: v })} label="Game mode" options={[{ v: 'tournament', label: '🏆 Tournament' }, { v: 'raid', label: '⚔ Boss Raid' }]} />
                <span className="faint" style={{ fontSize: 12 }}>{(s.focus ?? 'tournament') === 'raid' ? 'After the auction everyone picks fighters and teams up against real anime villains. The tournament is still there too.' : 'Players fight each other in a tournament. Raid Boss is also in the hub after the auction.'}</span></div>
              <div className="field"><label htmlFor="lobby-name">Game name</label><input id="lobby-name" className="input" maxLength={40} value={s.name} onChange={(e) => updateLobby({ name: e.target.value })} /></div>
              <div className="field"><span className="label">Fighters each</span><Seg value={s.rosterSize} onChange={(v) => updateLobby({ rosterSize: v })} label="Roster size" options={[{ v: 3, label: '3' }, { v: 4, label: '4' }]} /></div>
              <div className="field"><span className="label">Computer players</span><Seg value={s.npcs} onChange={(v) => updateLobby({ npcs: v })} label="Computer players" options={[0, 1, 2, 3, 4].map((n) => ({ v: n, label: String(n) }))} /></div>
              <div className="field"><span className="label">Bid timer</span><Seg value={s.timerSeconds} onChange={(v) => updateLobby({ timerSeconds: v })} label="Bid timer" options={[10, 15, 20, 30].map((n) => ({ v: n, label: `${n}s` }))} /></div>
              <div className="field"><span className="label">Solo duel rounds</span><Seg value={s.soloRounds} onChange={(v) => updateLobby({ soloRounds: v })} label="Solo rounds" options={[1, 2, 3].map((n) => ({ v: n, label: String(n) }))} /></div>
              <label className="toggle"><input type="checkbox" checked={s.tagRound} onChange={(e) => updateLobby({ tagRound: e.target.checked })} /> Include a tag-team round</label>
            </>
          ) : (
            <div className="col" style={{ gap: 4 }}>
              <div><strong>{s.name}</strong></div>
              <div className="faint">{s.rosterSize} fighters each · {s.timerSeconds}s bid timer{s.npcs ? ` · ${s.npcs} computer player${s.npcs > 1 ? 's' : ''}` : ''}</div>
            </div>
          )}
          {total >= 2 && <div className="faint"><strong>Match order:</strong> {matchOrder(total, { soloRounds: s.soloRounds, tagRound: s.tagRound, persistentConditions: true, specialEvents: true }, s.rosterSize)}</div>}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn ghost" onClick={() => void leaveRoom()}>{host ? 'Close room' : 'Leave room'}</button>
        {host ? (
          <button className="btn primary lg" disabled={starting || total < 2 || !room.connected} onClick={async () => {
            setStarting(true);
            try { await startOnlineGame(); } catch (e) { store.toast((e as Error).message, 'error'); } finally { setStarting(false); }
          }}>{starting ? 'Starting…' : total < 2 ? 'Waiting for players…' : `Start game (${total} players)`}</button>
        ) : <span className="faint">Waiting for the host to start…</span>}
      </div>
    </div>
  );
}

function Members() {
  const room = useRoom()!;
  return (
    <div className="col" style={{ gap: 6 }}>
      {room.members.map((m) => (
        <div key={m.userId} className="row" style={{ gap: 8 }}>
          <span className={`presence${m.online ? ' on' : ''}`} title={m.online ? 'Online' : 'Offline'} />
          <strong>{m.name}</strong>
          {m.userId === room.hostId && <span className="tag">HOST</span>}
          {m.userId === room.userId && <span className="faint">(you)</span>}
        </div>
      ))}
      {!room.members.length && <div className="faint">Loading players…</div>}
    </div>
  );
}
