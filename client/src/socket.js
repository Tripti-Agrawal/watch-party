import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SERVER_URL || undefined, { autoConnect: false });

export const emit = (event, payload = {}) =>
  new Promise((resolve, reject) =>
    socket.timeout(8000).emit(event, payload, (err, res) => (err ? reject(new Error('Server timed out')) : res?.ok === false ? reject(new Error(res.error)) : resolve(res)))
  );

export function getToken() { return localStorage.getItem('wp_token'); }
export function getUser() { try { return JSON.parse(localStorage.getItem('wp_user') || 'null'); } catch { return null; } }
export function setAuth(data) { localStorage.setItem('wp_token', data.token); localStorage.setItem('wp_user', JSON.stringify(data.user)); }
export function clearAuth() { localStorage.removeItem('wp_token'); localStorage.removeItem('wp_user'); }

export function connectSocket() {
  socket.auth = { token: getToken() };
  socket.connect();
}
