// Host Portal: admin tools for the online game (rooms, players, storage,
// admins). Every action calls an admin_* database function, which checks on
// the server that the caller is an admin; this page only shows the results.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../online/client';
import { initAuth, sendSignInLink, signOut, useAuth } from '../online/auth';

interface Overview {
  rooms_total: number; rooms_active_hour: number; rooms_playing: number;
  players_total: number; players_guest: number; players_new_week: number; players_banned: number;
  games_saved_day: number; panels: number; panel_bytes: number;
}
interface Room { code: string; host_id: string; host_name: string; status: string; players: number; names: string[]; panels: number; created_at: string; updated_at: string }
interface Member { user_id: string; display_name: string; joined_at: string }
interface Player { id: string; display_name: string; email: string | null; is_guest: boolean; games_played: number; wins: number; best_iq: number | null; banned: boolean; is_admin: boolean; joined_at: string; last_sign_in: string | null }
interface Admin { user_id: string; display_name: string | null; email: string | null; added_at: string }

const FREE_STORAGE = 1024 ** 3;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Deletes a room's shared comic panels from storage. */
async function removePanels(codes: string[]): Promise<number> {
  const sb = await supabase();
  let removed = 0;
  for (const code of codes) {
    const { data } = await sb.storage.from('comics').list(code, { limit: 1000 });
    if (data?.length) {
      await sb.storage.from('comics').remove(data.map((f) => `${code}/${f.name}`));
      removed += data.length;
    }
  }
  return removed;
}

const ago = (iso: string | null) => {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
const mb = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export function AdminApp() {
  const a = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => { void initAuth(); }, []);
  useEffect(() => {
    setIsAdmin(null);
    if (a.userId) void rpc<boolean>('is_admin').then(setIsAdmin).catch(() => setIsAdmin(false));
  }, [a.userId]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-name">Anime <em>Auction</em></span> <span className="tag" style={{ marginLeft: 8 }}>HOST PORTAL</span></div>
        <div className="spacer" />
        <nav className="row" style={{ gap: 6 }}>
          <a className="btn sm ghost" href="./">Open the game</a>
          {a.userId && <button className="btn sm ghost" onClick={() => void signOut()}>Sign out</button>}
        </nav>
      </header>
      <main className="main">
        {!a.ready ? <div className="empty"><div className="spinner" /></div>
          : !a.userId ? <SignIn />
            : isAdmin === null ? <div className="empty"><div className="spinner" /></div>
              : isAdmin ? <Portal />
                : a.guest ? <Gate title="Admins sign in with email">You&apos;re signed in as a guest. Sign out, then sign in with your email: admin accounts must work on every device.</Gate>
                  : <NotAdmin id={a.userId} email={a.email} />}
      </main>
    </div>
  );
}

function Gate({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="col" style={{ gap: 16, maxWidth: 560, margin: '40px auto' }}>
      <h1>{title}</h1>
      <div className="panel col" style={{ gap: 10 }}>{children}</div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  if (sent) return <Gate title="Check your email"><p>We sent a sign-in link to <strong>{email}</strong>. Open it on this device to come back here signed in.</p></Gate>;
  return (
    <Gate title="Host Portal sign in">
      <p className="muted" style={{ margin: 0 }}>For the game&apos;s admins. Sign in with your email; we send you a one-time link.</p>
      <form className="row" style={{ gap: 8 }} onSubmit={async (e) => {
        e.preventDefault(); setError('');
        try { await sendSignInLink(email); setSent(true); } catch (err) { setError((err as Error).message); }
      }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" required />
        <button className="btn primary" disabled={!email.includes('@')}>Email me a sign-in link</button>
      </form>
      {error && <div className="admin-error">{error}</div>}
    </Gate>
  );
}

function NotAdmin({ id, email }: { id: string; email: string | null }) {
  return (
    <Gate title="Not an admin yet">
      <p style={{ margin: 0 }}>You&apos;re signed in as <strong>{email}</strong>, but this account isn&apos;t an admin.</p>
      <p className="muted" style={{ margin: 0 }}>An existing admin can add you under Admins with this email. Your account ID:</p>
      <code className="admin-id">{id}</code>
    </Gate>
  );
}

type Tab = 'dashboard' | 'rooms' | 'players' | 'leaderboard' | 'games' | 'cleanup' | 'admins';

function Portal() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  // Live views refresh on their own.
  useEffect(() => { const t = setInterval(refresh, 15_000); return () => clearInterval(t); }, [refresh]);
  const say = (text: string, bad = false) => { setNotice({ text, bad }); setTimeout(() => setNotice(null), 4500); };
  const act = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); say(label); refresh(); } catch (e) { say((e as Error).message, true); }
  };
  const tabs: Array<[Tab, string]> = [['dashboard', 'Dashboard'], ['rooms', 'Rooms'], ['players', 'Players'], ['leaderboard', 'Leaderboard'], ['games', 'Games'], ['cleanup', 'Cleanup'], ['admins', 'Admins']];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row admin-tabs" role="tablist">
          {tabs.map(([t, label]) => <button key={t} role="tab" aria-selected={tab === t} className={`btn sm ${tab === t ? 'active' : 'ghost'}`} onClick={() => setTab(t)}>{label}</button>)}
        </div>
        <button className="btn sm" onClick={refresh}>↻ Refresh</button>
      </div>
      {notice && <div className={`admin-notice${notice.bad ? ' bad' : ''}`} role="status">{notice.text}</div>}
      {tab === 'dashboard' && <Dashboard tick={tick} />}
      {tab === 'rooms' && <Rooms tick={tick} act={act} />}
      {tab === 'players' && <Players tick={tick} act={act} />}
      {tab === 'leaderboard' && <Leaderboard tick={tick} />}
      {tab === 'games' && <Games tick={tick} />}
      {tab === 'cleanup' && <Cleanup act={act} />}
      {tab === 'admins' && <Admins tick={tick} act={act} />}
    </div>
  );
}

type Act = (label: string, fn: () => Promise<unknown>) => Promise<void>;

function useData<T>(fn: string, tick: number): { data: T | null; error: string } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void rpc<T>(fn).then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message)); }, [fn, tick]);
  return { data, error };
}

function Loading({ error }: { error: string }) {
  return error ? <div className="admin-error">{error}</div> : <div className="empty"><div className="spinner" /></div>;
}

function Dashboard({ tick }: { tick: number }) {
  const { data: o, error } = useData<Overview>('admin_overview', tick);
  if (!o) return <Loading error={error} />;
  const pct = Math.min(100, (o.panel_bytes / FREE_STORAGE) * 100);
  const cards: Array<[string, string | number, string]> = [
    ['Rooms active (last hour)', o.rooms_active_hour, `${o.rooms_playing} playing · ${o.rooms_total} rooms in total`],
    ['Players', o.players_total, `${o.players_guest} guests · ${o.players_new_week} new this week`],
    ['Online games saved today', o.games_saved_day, 'Games hosts saved in the last 24 hours'],
    ['Banned players', o.players_banned, 'Blocked from creating or joining rooms'],
  ];
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="admin-cards">
        {cards.map(([label, value, sub]) => (
          <div key={label} className="panel admin-card"><div className="label">{label}</div><div className="admin-big">{value}</div><div className="faint">{sub}</div></div>
        ))}
      </div>
      <Activity tick={tick} />
      <div className="panel col" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><strong>Comic panel storage</strong><span className="faint">{o.panels} panels · {mb(o.panel_bytes)} of 1 GB free plan</span></div>
        <div className="hp" style={{ height: 10 }}><span style={{ width: `${pct}%`, background: pct > 80 ? 'var(--bad, #ef4444)' : 'linear-gradient(90deg, #22d3ee, #a78bfa)' }} /></div>
        <div className="faint">Rooms delete their panels when the host closes them. Use Cleanup for rooms nobody closed.</div>
      </div>
    </div>
  );
}

interface Day { day: string; new_players: number; games: number; rooms: number }
/** The last 7 days: new players, games saved and rooms opened (needs supabase/admin-extra.sql). */
function Activity({ tick }: { tick: number }) {
  const { data, error } = useData<Day[]>('admin_activity', tick);
  if (error) return <div className="panel faint">Activity: run supabase/admin-extra.sql in the SQL Editor to turn this on.</div>;
  if (!data) return null;
  const top = Math.max(1, ...data.flatMap((d) => [d.new_players, d.games, d.rooms]));
  return (
    <div className="panel col" style={{ gap: 8 }}>
      <strong>Last 7 days</strong>
      <div className="activity">
        {data.map((d) => (
          <div key={d.day} className="activity-day" title={`${d.day}: ${d.new_players} new players, ${d.rooms} rooms, ${d.games} games`}>
            <div className="bars">
              <span className="b-players" style={{ height: `${(d.new_players / top) * 100}%` }} />
              <span className="b-rooms" style={{ height: `${(d.rooms / top) * 100}%` }} />
              <span className="b-games" style={{ height: `${(d.games / top) * 100}%` }} />
            </div>
            <span className="faint">{new Date(d.day).toLocaleDateString([], { weekday: 'short' })}</span>
          </div>
        ))}
      </div>
      <div className="row faint" style={{ gap: 14, fontSize: 12 }}><span><i className="key b-players" /> New players</span><span><i className="key b-rooms" /> Rooms</span><span><i className="key b-games" /> Games saved</span></div>
    </div>
  );
}

interface Leader { id: string; display_name: string; games_played: number; wins: number; win_rate: number; best_iq: number | null; last_sign_in: string | null }
function Leaderboard({ tick }: { tick: number }) {
  const { data, error } = useData<Leader[]>('admin_leaderboard', tick);
  if (!data) return <Loading error={error} />;
  if (!data.length) return <div className="panel empty">No finished online games yet.</div>;
  return (
    <div className="panel table-wrap">
      <table className="standings">
        <thead><tr><th>#</th><th>Player</th><th>Wins</th><th>Played</th><th>Win rate</th><th>Best coach IQ</th><th>Last seen</th></tr></thead>
        <tbody>{data.map((p, i) => <tr key={p.id}><td>{i + 1}</td><td><strong>{p.display_name}</strong></td><td>{p.wins}</td><td>{p.games_played}</td><td>{p.win_rate}%</td><td>{p.best_iq ?? '—'}</td><td className="faint">{p.last_sign_in ? new Date(p.last_sign_in).toLocaleString() : '—'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

interface SavedGame { id: string; name: string; room_code: string | null; host: string; updated_at: string; size_kb: number }
function Games({ tick }: { tick: number }) {
  const { data, error } = useData<SavedGame[]>('admin_games', tick);
  if (!data) return <Loading error={error} />;
  if (!data.length) return <div className="panel empty">No online games saved yet.</div>;
  return (
    <div className="panel table-wrap">
      <table className="standings">
        <thead><tr><th>Game</th><th>Host</th><th>Room</th><th>Last played</th><th>Size</th></tr></thead>
        <tbody>{data.map((g) => <tr key={g.id}><td><strong>{g.name}</strong></td><td>{g.host}</td><td>{g.room_code ?? '—'}</td><td className="faint">{new Date(g.updated_at).toLocaleString()}</td><td className="faint">{g.size_kb} KB</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Rooms({ tick, act }: { tick: number; act: Act }) {
  const { data, error } = useData<Room[]>('admin_rooms', tick);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;
  if (!data.length) return <div className="panel empty">No rooms right now.</div>;
  return (
    <div className="panel table-wrap">
      <table className="standings admin-table">
        <thead><tr><th>Code</th><th>Host</th><th>Status</th><th>Players</th><th>Panels</th><th>Last active</th><th /></tr></thead>
        <tbody>
          {data.map((r) => (
            <RoomRow key={r.code} r={r} open={open === r.code} onToggle={() => setOpen(open === r.code ? null : r.code)} act={act} tick={tick} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoomRow({ r, open, onToggle, act, tick }: { r: Room; open: boolean; onToggle: () => void; act: Act; tick: number }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  useEffect(() => { if (open) void rpc<Member[]>('admin_room_members', { p_code: r.code }).then(setMembers).catch(() => setMembers([])); }, [open, r.code, tick]);
  const live = Date.now() - new Date(r.updated_at).getTime() < 3_600_000;
  return (
    <>
      <tr>
        <td><strong className="room-code">{r.code}</strong></td>
        <td>{r.host_name}</td>
        <td><span className={`tag${live ? ' live' : ''}`}>{r.status}{live ? ' · live' : ''}</span></td>
        <td><button className="btn sm ghost" onClick={onToggle} aria-expanded={open}>{r.players} {open ? '▴' : '▾'}</button></td>
        <td>{r.panels}</td>
        <td className="faint">{ago(r.updated_at)}</td>
        <td><button className="btn sm danger" onClick={() => {
          if (confirm(`Close room ${r.code}? Everyone in it is disconnected and its comic panels are deleted.`)) {
            void act(`Room ${r.code} closed.`, async () => { await removePanels([r.code]); await rpc('admin_close_room', { p_code: r.code }); });
          }
        }}>Close room</button></td>
      </tr>
      {open && (
        <tr><td colSpan={7}>
          <div className="col" style={{ gap: 6, padding: '4px 0 8px' }}>
            {!members ? <span className="faint">Loading…</span> : members.map((m) => (
              <div key={m.user_id} className="row" style={{ gap: 10 }}>
                <strong>{m.display_name}</strong>{m.user_id === r.host_id && <span className="tag">HOST</span>}
                <span className="faint">joined {ago(m.joined_at)}</span>
                {m.user_id !== r.host_id && <button className="btn sm ghost" onClick={() => {
                  if (confirm(`Remove ${m.display_name} from room ${r.code}?`)) void act(`${m.display_name} removed from ${r.code}.`, () => rpc('admin_kick', { p_code: r.code, p_user: m.user_id }));
                }}>Remove</button>}
              </div>
            ))}
          </div>
        </td></tr>
      )}
    </>
  );
}

function Players({ tick, act }: { tick: number; act: Act }) {
  const { data, error } = useData<Player[]>('admin_players', tick);
  const [q, setQ] = useState('');
  if (!data) return <Loading error={error} />;
  const list = data.filter((p) => !q || p.display_name.toLowerCase().includes(q.toLowerCase()) || (p.email ?? '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="col" style={{ gap: 10 }}>
      <input className="input" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" style={{ maxWidth: 360 }} />
      <div className="panel table-wrap">
        <table className="standings admin-table">
          <thead><tr><th>Name</th><th>Account</th><th>Games</th><th>Wins</th><th>Joined</th><th>Last seen</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} style={{ opacity: p.banned ? 0.55 : 1 }}>
                <td><strong>{p.display_name}</strong>{p.is_admin && <span className="tag" style={{ marginLeft: 6 }}>ADMIN</span>}{p.banned && <span className="tag bad" style={{ marginLeft: 6 }}>BANNED</span>}</td>
                <td className="faint">{p.is_guest ? 'Guest' : p.email}</td>
                <td>{p.games_played}</td>
                <td>{p.wins}</td>
                <td className="faint">{ago(p.joined_at)}</td>
                <td className="faint">{ago(p.last_sign_in)}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => {
                      const name = prompt(`New name for ${p.display_name}:`, p.display_name);
                      if (name && name.trim() !== p.display_name) void act(`Renamed to ${name.trim()}.`, () => rpc('admin_rename', { p_user: p.id, p_name: name }));
                    }}>Rename</button>
                    {!p.is_admin && <button className={`btn sm ${p.banned ? '' : 'danger'}`} onClick={() => {
                      if (p.banned || confirm(`Ban ${p.display_name}? They're removed from every room and can't create or join rooms.`)) {
                        void act(p.banned ? `${p.display_name} unbanned.` : `${p.display_name} banned.`, () => rpc('admin_ban', { p_user: p.id, p_banned: !p.banned }));
                      }
                    }}>{p.banned ? 'Unban' : 'Ban'}</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="faint">No players match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cleanup({ act }: { act: Act }) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel col" style={{ gap: 12, maxWidth: 640 }}>
      <h3 style={{ margin: 0 }}>Delete old rooms</h3>
      <p className="muted" style={{ margin: 0 }}>Removes rooms nobody has played in for a while, with their comic panels and the hosts&apos; cloud saves of those games. Players and their records stay.</p>
      <div className="row" style={{ gap: 8 }}>
        <span>Not played for</span>
        <select className="input" style={{ width: 120 }} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days without play">
          {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
        </select>
        <button className="btn danger" disabled={busy} onClick={() => {
          if (!confirm(`Delete every room not played for ${days} day${days > 1 ? 's' : ''}? This can't be undone.`)) return;
          setBusy(true);
          void act('Cleanup finished.', async () => {
            const codes = await rpc<string[]>('admin_cleanup', { p_days: days });
            const panels = await removePanels(codes);
            if (!codes.length) throw new Error('Nothing to clean: every room was played recently.');
            return { codes, panels };
          }).finally(() => setBusy(false));
        }}>{busy ? 'Cleaning…' : 'Delete old rooms'}</button>
      </div>
    </div>
  );
}

function Admins({ tick, act }: { tick: number; act: Act }) {
  const { data, error } = useData<Admin[]>('admin_list', tick);
  const [email, setEmail] = useState('');
  if (!data) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 12, maxWidth: 720 }}>
      <div className="panel col" style={{ gap: 6 }}>
        {data.map((x) => (
          <div key={x.user_id} className="row" style={{ justifyContent: 'space-between' }}>
            <span><strong>{x.display_name ?? '(no player name yet)'}</strong> <span className="faint">{x.email} · admin since {new Date(x.added_at).toLocaleDateString()}</span></span>
            <button className="btn sm ghost" disabled={data.length <= 1} title={data.length <= 1 ? 'There must always be at least one admin' : undefined}
              onClick={() => { if (confirm(`Remove ${x.email} as an admin?`)) void act('Admin removed.', () => rpc('admin_remove', { p_user: x.user_id })); }}>Remove</button>
          </div>
        ))}
      </div>
      <form className="panel col" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void act(`${email} is now an admin.`, () => rpc('admin_add', { p_email: email })).then(() => setEmail('')); }}>
        <strong>Add an admin</strong>
        <span className="faint">They must have signed in to the game or this portal by email at least once.</span>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" style={{ flex: 1 }} type="email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Admin email" required />
          <button className="btn primary" disabled={!email.includes('@')}>Make admin</button>
        </div>
      </form>
    </div>
  );
}
