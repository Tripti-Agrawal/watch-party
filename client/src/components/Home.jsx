import React, { useState } from 'react';
import { clearAuth, emit, getUser } from '../socket.js';

export default function Home({ onEnter, onLogout }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const user = getUser();

  const create = async () => {
    setBusy(true); setError('');
    try { const r = await fetch('/api/rooms', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('wp_token')}` } }); const data = await r.json(); if (!r.ok) throw new Error(data.error); onEnter(data.roomId); }
    catch (e) { setError(e.message || 'Could not create a room'); }
    finally { setBusy(false); }
  };
  const join = async (e) => {
    e.preventDefault(); setError(''); const id = code.trim().toUpperCase(); if (!id) return setError('Enter a room code');
    const r = await fetch(`/api/rooms/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('wp_token')}` } });
    const data = await r.json(); r.ok ? onEnter(id) : setError(data.error || 'No room with that code');
  };
  const logout = async () => { try { await fetch('/api/auth/logout', { method:'POST', headers:{ Authorization:`Bearer ${localStorage.getItem('wp_token')}` } }); } finally { clearAuth(); onLogout(); } };

  return <main className="home">
    <div className="row" style={{justifyContent:'space-between'}}><span className="badge">Signed in as {user?.username}</span><button onClick={logout}>Logout</button></div>
    <h1>Watch together,<br />in the same second.</h1>
    <p className="sub">Start a room, share the code, and everyone's YouTube player plays, pauses and seeks as one.</p>
    <button className="primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create room'}</button>
    <div className="divider"><span>or join one</span></div>
    <form onSubmit={join} className="row"><input value={code} onChange={e => setCode(e.target.value)} maxLength={6} placeholder="Room code" aria-label="Room code" /><button type="submit">Join room</button></form>
    {error && <p className="error" role="alert">{error}</p>}
  </main>;
}
