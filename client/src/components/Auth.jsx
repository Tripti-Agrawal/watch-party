import React, { useState } from 'react';
import { setAuth } from '../socket.js';

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const body = mode === 'login' ? { identifier: email, password } : { username, email, password };
      const r = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Authentication failed');
      setAuth(data); onAuthenticated(data.user);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <main className="home auth-card">
    <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
    <p className="sub">Sign in before creating or joining a watch party.</p>
    <form onSubmit={submit} className="auth-form">
      {mode === 'register' && <label>Username<input value={username} onChange={e => setUsername(e.target.value)} maxLength={24} required placeholder="e.g. Tripti" /></label>}
      <label>{mode === 'login' ? 'Username or email' : 'Email'}<input type={mode === 'login' ? 'text' : 'email'} value={email} onChange={e => setEmail(e.target.value)} required placeholder={mode === 'login' ? 'username or email' : 'you@example.com'} /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required placeholder="At least 6 characters" /></label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Register'}</button>
    </form>
    <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}</button>
  </main>;
}
