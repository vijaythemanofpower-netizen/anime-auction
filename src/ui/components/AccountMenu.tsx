// Top-right account button. Signed out: "Sign in" opens email + password sign-in or
// account creation (no link to wait for on each visit), or play as a guest. Signed in:
// your name, record, change password and sign out. Also handles the "new password"
// step after a reset link.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ONLINE_AVAILABLE } from '../../online/client';
import { createAccount, sendPasswordReset, setNewPassword, signInAsGuest, signInWithPassword, signOut, useAuth } from '../../online/auth';
import { store } from '../../store/store';
import { Modal } from './common';

type Mode = 'signin' | 'create' | 'forgot' | 'newpass';

// Lets other screens (the home page card) open the same sign-in window.
let opener: ((m: Mode) => void) | null = null;
export function openAccountDialog(mode: 'signin' | 'create' = 'signin') { opener?.(mode); }

export function AccountMenu() {
  const a = useAuth();
  const [mode, setMode] = useState<Mode | null>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => { opener = setMode; return () => { opener = null; }; }, []);
  // Arriving from a password-reset email: ask for the new password straight away.
  useEffect(() => { if (a.userId && a.recovery) setMode('newpass'); }, [a.userId, a.recovery]);
  if (!ONLINE_AVAILABLE || !a.ready) return null;

  const name = a.profile?.display_name ?? a.email?.split('@')[0] ?? 'Player';
  return (
    <div className="account-menu">
      {a.userId ? (
        <button className="btn sm account-chip" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu">
          <span className="avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          <span className="hide-phone">{name}</span>{a.guest && <span className="tag">GUEST</span>}
        </button>
      ) : (
        <button className="btn sm primary" onClick={() => setMode('signin')}>Sign in</button>
      )}
      {menu && a.userId && (
        <div className="account-pop" role="menu" onMouseLeave={() => setMenu(false)}>
          <div className="faint" style={{ fontSize: 12 }}>{a.email ?? 'Guest account (this browser only)'}</div>
          {a.profile && <div><strong>{a.profile.games_played}</strong> played · <strong>{a.profile.wins}</strong> won</div>}
          {a.guest
            ? <button className="btn sm primary" role="menuitem" onClick={() => { setMenu(false); setMode('create'); }}>Save this account</button>
            : <button className="btn sm" role="menuitem" onClick={() => { setMenu(false); setMode('newpass'); }}>Change password</button>}
          <button className="btn sm ghost" role="menuitem" onClick={() => { setMenu(false); store.go('online'); }}>Play online</button>
          <button className="btn sm ghost" role="menuitem" onClick={() => { setMenu(false); void signOut(); }}>Sign out</button>
        </div>
      )}
      {/* On the page body: the header's blur would otherwise trap the window inside the header. */}
      {mode && createPortal(<AuthDialog mode={mode} setMode={setMode} onClose={() => setMode(null)} guest={a.guest} />, document.body)}
    </div>
  );
}

function AuthDialog({ mode, setMode, onClose, guest }: { mode: Mode; setMode: (m: Mode) => void; onClose: () => void; guest: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setNote('');
    try { await fn(); } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  };
  const title = mode === 'signin' ? 'Sign in' : mode === 'create' ? (guest ? 'Save your guest account' : 'Create an account') : mode === 'forgot' ? 'Reset your password' : 'Choose a new password';

  return (
    <Modal title={title} onClose={onClose}>
      <form className="col auth-form" style={{ gap: 10 }} onSubmit={(e) => {
        e.preventDefault();
        if (mode === 'signin') void run(async () => { await signInWithPassword(email, password); store.toast('Signed in.', 'success'); onClose(); });
        if (mode === 'create') void run(async () => {
          const confirm = await createAccount(email, password, name);
          if (confirm) setNote(`Almost done: open the link we sent to ${email} once to confirm it. After that you just sign in with your password.`);
          else { store.toast('Account created.', 'success'); onClose(); }
        });
        if (mode === 'forgot') void run(async () => { await sendPasswordReset(email); setNote(`If ${email} has an account, a reset link is on its way.`); });
        if (mode === 'newpass') void run(async () => { await setNewPassword(password); store.toast('Password updated.', 'success'); onClose(); });
      }}>
        {mode === 'create' && <label className="field"><span className="label">Player name</span><input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="What others see" autoComplete="nickname" /></label>}
        {mode !== 'newpass' && <label className="field"><span className="label">Email</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>}
        {mode !== 'forgot' && (
          <label className="field"><span className="label">{mode === 'newpass' ? 'New password' : 'Password'}</span>
            <input className="input" type="password" required minLength={mode === 'signin' ? 1 : 8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            {mode !== 'signin' && <span className="faint" style={{ fontSize: 12 }}>At least 8 characters.</span>}
          </label>
        )}
        {note && <div className="auth-note" role="status">{note}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'create' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Save password'}</button>
        {mode === 'signin' && (
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm ghost" onClick={() => setMode('forgot')}>Forgot password?</button>
            <button type="button" className="btn sm ghost" onClick={() => setMode('create')}>New here? Create an account</button>
          </div>
        )}
        {(mode === 'create' || mode === 'forgot') && <button type="button" className="btn sm ghost" onClick={() => setMode('signin')}>Back to sign in</button>}
        {mode === 'signin' && <button type="button" className="btn sm" disabled={busy} onClick={() => void run(async () => { await signInAsGuest(); onClose(); store.go('online'); })}>Play as a guest instead</button>}
      </form>
    </Modal>
  );
}
