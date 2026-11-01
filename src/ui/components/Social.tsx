// Your profile window (career dashboard + friends), invite pop-ups, and the
// "Invite friends" list in a room lobby. Data: store/career.ts and online/friends.ts.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../online/auth';
import { acceptFriend, addFriend, dismissInvite, inviteFriend, removeFriend, searchPlayers, useFriends, type Invite } from '../../online/friends';
import { joinRoom, useRoom } from '../../online/room';
import { useCareer, type Career } from '../../store/career';
import { store } from '../../store/store';
import { Modal, Seg } from './common';

let opener: ((tab: 'stats' | 'friends') => void) | null = null;
export function openProfile(tab: 'stats' | 'friends' = 'stats') { opener?.(tab); }

/** Mounted once in the app: the profile window and incoming invites. */
export function SocialLayer() {
  const [tab, setTab] = useState<'stats' | 'friends' | null>(null);
  useEffect(() => { opener = setTab; return () => { opener = null; }; }, []);
  return (
    <>
      <InviteToasts />
      {tab && createPortal(
        <Modal title="Your profile" onClose={() => setTab(null)} wide>
          <Seg value={tab} onChange={setTab} label="Profile view" options={[{ v: 'stats', label: '📊 Career' }, { v: 'friends', label: '👥 Friends' }]} />
          <div style={{ marginTop: 12 }}>{tab === 'stats' ? <CareerDashboard /> : <FriendsPanel />}</div>
        </Modal>, document.body)}
    </>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

export function CareerDashboard() {
  const c: Career = useCareer();
  const a = useAuth();
  const badges = Object.entries(c.badges).sort((x, y) => y[1].count - x[1].count);
  const rivals = Object.entries(c.rivals).sort((x, y) => (y[1].w + y[1].l) - (x[1].w + x[1].l));
  const top = badges[0]?.[1];
  const tiles: Array<[string, string | number, string]> = [
    ['🏆', c.tournaments, `tournaments · ${c.titles} won`],
    ['⚔', c.fights, `fights · ${c.fightsWon} won (${pct(c.fightsWon, c.fights)})`],
    ['🐉', c.raids, `boss raids · ${c.raidsWon} won, ${c.raids - c.raidsWon} lost`],
    ['🤝', c.teamBattles, `team battles · ${c.teamWins} won`],
    ['👑', c.mvps, 'MVP awards'],
    [top?.icon ?? '🏷', top ? `${top.count}×` : '–', top ? `most received: ${top.name}` : 'no badges yet'],
  ];
  return (
    <div className="col" style={{ gap: 14 }}>
      <p className="faint" style={{ margin: 0 }}>{a.userId && !a.guest ? 'Saved to your account, so it follows you to any device.' : a.userId ? 'Saved on this browser. Save your guest account to keep it everywhere.' : 'Saved on this device. Sign in to keep it everywhere.'} Counted for your seat in online games, or when you are the only person playing a local game.</p>
      <div className="career-tiles">
        {tiles.map(([icon, n, label]) => <div key={label} className="career-tile"><span className="ct-icon">{icon}</span><b>{n}</b><span className="faint">{label}</span></div>)}
      </div>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <div className="panel col" style={{ gap: 6 }}>
          <strong>Badges</strong>
          {badges.length ? badges.map(([id, b]) => <div key={id} className="row" style={{ justifyContent: 'space-between' }}><span>{b.icon} {b.name}</span><span className="faint">{b.count}×</span></div>) : <span className="faint">Finish a tournament to earn some.</span>}
        </div>
        <div className="panel col" style={{ gap: 6 }}>
          <strong>Rivals</strong>
          {rivals.length ? rivals.map(([n, r]) => <div key={n} className="row" style={{ justifyContent: 'space-between' }}><span>{n}</span><span className="faint">{r.w + r.l} fights · {r.w}W {r.l}L</span></div>) : <span className="faint">Play tournament matches to build rivalries.</span>}
        </div>
      </div>
    </div>
  );
}

export function FriendsPanel() {
  const a = useAuth();
  const f = useFriends();
  const room = useRoom();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Array<{ id: string; name: string }>>([]);
  const [note, setNote] = useState('');
  useEffect(() => { const t = setTimeout(() => { void searchPlayers(q).then(setFound).catch(() => setFound([])); }, 300); return () => clearTimeout(t); }, [q]);
  const run = (fn: () => Promise<void>, ok?: string) => { setNote(''); fn().then(() => ok && setNote(ok)).catch((e: Error) => setNote(e.message)); };
  if (!a.userId) return <p className="faint">Sign in (a guest account works) to add friends.</p>;
  const friends = f.friends.filter((x) => x.status === 'accepted');
  const incoming = f.friends.filter((x) => x.status === 'incoming');
  const outgoing = f.friends.filter((x) => x.status === 'outgoing');
  return (
    <div className="col" style={{ gap: 12 }}>
      {f.error && <div className="panel" style={{ borderColor: 'var(--warn)' }}>{f.error}</div>}
      {note && <div className="faint">{note}</div>}
      {incoming.length > 0 && (
        <div className="panel col" style={{ gap: 6 }}>
          <strong>Friend requests</strong>
          {incoming.map((x) => <div key={x.id} className="row" style={{ justifyContent: 'space-between' }}><span>{x.name}</span><span className="row" style={{ gap: 6 }}><button className="btn sm primary" onClick={() => run(() => acceptFriend(x.id), `You and ${x.name} are friends now.`)}>Accept</button><button className="btn sm ghost" onClick={() => run(() => removeFriend(x.id))}>Decline</button></span></div>)}
        </div>
      )}
      <div className="panel col" style={{ gap: 6 }}>
        <strong>Friends ({friends.length})</strong>
        {friends.length ? friends.map((x) => (
          <div key={x.id} className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span>{x.name}</span>
            <span className="row" style={{ gap: 6 }}>
              {room?.connected && !room.started && <button className="btn sm primary" onClick={() => run(() => inviteFriend(x.id, room.code), `Invite sent to ${x.name}.`)}>Invite to room {room.code}</button>}
              <button className="btn sm ghost" onClick={() => run(() => removeFriend(x.id))}>Remove</button>
            </span>
          </div>
        )) : <span className="faint">No friends yet. Find people by name below, or add someone from a room you played in.</span>}
        {outgoing.length > 0 && <span className="faint">Waiting for: {outgoing.map((x) => x.name).join(', ')}</span>}
      </div>
      <div className="panel col" style={{ gap: 6 }}>
        <label htmlFor="friend-search"><strong>Add a friend</strong></label>
        <input id="friend-search" className="input" placeholder="Their player name" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.map((p) => {
          const known = f.friends.find((x) => x.id === p.id);
          return <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}><span>{p.name}</span>{known ? <span className="faint">{known.status === 'accepted' ? 'Friends' : known.status === 'outgoing' ? 'Request sent' : 'Wants to be friends'}</span> : <button className="btn sm" onClick={() => run(() => addFriend(p.id), `Request sent to ${p.name}.`)}>Add friend</button>}</div>;
        })}
      </div>
    </div>
  );
}

/** Lobby: invite friends straight into this room. */
export function InviteFriends() {
  const f = useFriends();
  const room = useRoom();
  const [sent, setSent] = useState<string[]>([]);
  const [err, setErr] = useState('');
  if (!room || room.started) return null;
  const friends = f.friends.filter((x) => x.status === 'accepted' && !room.members.some((m) => m.userId === x.id));
  return (
    <div className="col" style={{ gap: 6 }}>
      <strong>Invite friends</strong>
      {err && <span className="faint">{err}</span>}
      {friends.length ? friends.map((x) => (
        <div key={x.id} className="row" style={{ justifyContent: 'space-between' }}>
          <span>{x.name}</span>
          <button className="btn sm" disabled={sent.includes(x.id)} onClick={() => { setErr(''); inviteFriend(x.id, room.code).then(() => setSent((s) => [...s, x.id])).catch((e: Error) => setErr(e.message)); }}>{sent.includes(x.id) ? 'Invited ✓' : 'Invite'}</button>
        </div>
      )) : <span className="faint">No friends to invite yet. <button className="btn sm ghost" onClick={() => openProfile('friends')}>Add friends</button></span>}
    </div>
  );
}

/** Lobby: add someone you're playing with as a friend. */
export function AddFriendButton({ userId, name }: { userId: string; name: string }) {
  const a = useAuth();
  const f = useFriends();
  const [done, setDone] = useState(false);
  if (!a.userId || userId === a.userId) return null;
  const known = f.friends.find((x) => x.id === userId);
  if (known?.status === 'accepted') return <span className="faint" style={{ fontSize: 12 }}>friend</span>;
  return <button className="btn sm ghost" disabled={done || known?.status === 'outgoing'} title={`Send ${name} a friend request`} onClick={() => { addFriend(userId).then(() => setDone(true)).catch(() => setDone(false)); }}>{done || known?.status === 'outgoing' ? 'Requested' : known?.status === 'incoming' ? 'Accept friend' : '+ Friend'}</button>;
}

function InviteToasts() {
  const f = useFriends();
  const room = useRoom();
  const [err, setErr] = useState('');
  if (!f.invites.length) return null;
  const join = (inv: Invite) => {
    setErr('');
    joinRoom(inv.room).then(() => { void dismissInvite(inv); store.go('online'); }).catch((e: Error) => setErr(e.message));
  };
  return (
    <div className="invite-toasts" role="status" aria-live="polite">
      {f.invites.slice(-3).map((inv) => (
        <div key={inv.id} className="invite-toast">
          <span>🎮 <b>{inv.fromName}</b> invited you to room <b>{inv.room}</b></span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn sm primary" disabled={room?.code === inv.room} onClick={() => join(inv)}>{room?.code === inv.room ? 'Joined' : 'Join'}</button>
            <button className="btn sm ghost" onClick={() => void dismissInvite(inv)}>Dismiss</button>
          </span>
        </div>
      ))}
      {err && <div className="invite-toast faint">{err}</div>}
    </div>
  );
}
