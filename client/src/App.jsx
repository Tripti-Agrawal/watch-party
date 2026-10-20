import React, { useEffect, useState } from 'react';
import Auth from './components/Auth.jsx';
import Home from './components/Home.jsx';
import Room from './components/Room.jsx';
import { clearAuth, getToken } from './socket.js';

const parse = () => (location.pathname.match(/^\/room\/([A-Za-z0-9]+)/) || [])[1]?.toUpperCase() || null;

export default function App() {
  const [roomId, setRoomId] = useState(parse());
  const [auth, setAuthState] = useState(Boolean(getToken()));
  const go = (id) => { history.pushState({}, '', id ? `/room/${id}` : '/'); setRoomId(id); };
  useEffect(() => { const onPop = () => setRoomId(parse()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  if (!auth) return <Auth onAuthenticated={() => setAuthState(true)} />;
  if (roomId) return <Room key={roomId} roomId={roomId} onExit={() => go(null)} onAuthExpired={() => { clearAuth(); setAuthState(false); go(null); }} />;
  return <Home onEnter={go} onLogout={() => setAuthState(false)} />;
}
