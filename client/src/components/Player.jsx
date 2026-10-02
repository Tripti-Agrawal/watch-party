import React, { useEffect, useRef, useState } from 'react';

let apiPromise;
const loadYT = () => (apiPromise ||= new Promise((resolve) => {
  if (window.YT?.Player) return resolve(window.YT);
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => resolve(window.YT);
}));

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Player is purely a *renderer* of server state. It never emits events from YouTube's own
 * state changes (that would cause feedback loops); only the custom controls emit.
 */
export default function Player({ state, canControl, onAction }) {
  const box = useRef(null);
  const player = useRef(null);
  const ready = useRef(false);
  const latest = useRef(state);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [scrub, setScrub] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [url, setUrl] = useState('');
  latest.current = state;

  // Server sends currentTime at updatedAt plus serverNow; add local time since receipt (no clock-skew issues)
  const target = (s) => (s.playState === 'playing' ? s.currentTime + (s.serverNow - s.updatedAt + (Date.now() - s.receivedAt)) / 1000 : s.currentTime);

  const apply = () => {
    const p = player.current, s = latest.current;
    if (!ready.current || !s) return;
    const t = target(s);
    const current = p.getVideoData?.().video_id;
    if (current !== s.videoId) {
      s.playState === 'playing' ? p.loadVideoById({ videoId: s.videoId, startSeconds: t }) : p.cueVideoById({ videoId: s.videoId, startSeconds: t });
    } else {
      if (Math.abs(p.getCurrentTime() - t) > 1.2) p.seekTo(t, true);
      s.playState === 'playing' ? p.playVideo() : p.pauseVideo();
    }
    setTimeout(() => { // autoplay policy check
      const st = p.getPlayerState?.();
      if (latest.current.playState === 'playing' && [-1, 2, 5].includes(st)) setBlocked(true); else setBlocked(false);
    }, 1500);
  };

  useEffect(() => {
    let dead = false;
    loadYT().then((YT) => {
      if (dead) return;
      player.current = new YT.Player(box.current, {
        videoId: state.videoId,
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1 },
        events: { onReady: () => { ready.current = true; player.current.playVideo?.(); apply(); } },
      });
    });
    const tick = setInterval(() => {
      const p = player.current;
      if (!ready.current || !p?.getCurrentTime) return;
      setTime(p.getCurrentTime()); setDur(p.getDuration() || 0);
    }, 500);
    return () => { dead = true; clearInterval(tick); player.current?.destroy?.(); ready.current = false; };
  }, []);

  useEffect(apply, [state]);

  const playing = state.playState === 'playing';
  const label = (v) => (canControl ? v : `Request ${v.toLowerCase()}`);
  const shown = scrub ?? time;

  return (
    <section className="player">
      <div className="frame">
        <div ref={box} />
        <div className="shield" /> {/* blocks clicks so nobody can desync by clicking the video */}
        {blocked && <button className="primary unblock" onClick={apply}>Tap to join playback</button>}
      </div>
      <div className="controls">
        <button className="primary" onClick={() => onAction(playing ? 'pause' : 'play')}>{playing ? label('Pause') : label('Play')}</button>
        <span className="time">{fmt(shown)}</span>
        <input type="range" min="0" max={dur || 1} step="1" value={Math.min(shown, dur || 1)} aria-label="Seek"
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={() => { if (scrub !== null) { onAction('seek', { time: scrub }); setScrub(null); } }}
          onKeyUp={() => { if (scrub !== null) { onAction('seek', { time: scrub }); setScrub(null); } }} />
        <span className="time">{fmt(dur)}</span>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (url.trim()) { onAction('change_video', { videoId: url.trim() }); setUrl(''); } }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a YouTube link to change the video" aria-label="YouTube URL" />
        <button type="submit">{canControl ? 'Change video' : 'Request change'}</button>
      </form>
      {!canControl && <p className="hint">You're watching. Controls send a request to the host or a moderator for approval.</p>}
    </section>
  );
}
