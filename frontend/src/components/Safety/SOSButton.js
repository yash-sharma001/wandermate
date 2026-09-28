import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Shield, X, Phone, Check, MapPin } from 'lucide-react';
import { safetyAPI } from '../../utils/api';
import './SOS.css';

const HOLD_MS = 1500;
const RING = 2 * Math.PI * 120;

// variant "nav": compact desktop button; "fab": floating phone button.
// Press and hold to arm; a quick tap opens the "tap three times" fallback.
function SOSButton({ variant = 'fab' }) {
  const [mode, setMode] = useState(null); // null | 'hold' | 'tap' | 'sent'
  const [progress, setProgress] = useState(0);
  const [taps, setTaps] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [sent, setSent] = useState(null); // { message, latitude, longitude, at }
  const [error, setError] = useState('');
  const startedAt = useRef(0);
  const timer = useRef(null);
  const modeRef = useRef(null);
  modeRef.current = mode;

  const stopTimer = () => { clearInterval(timer.current); timer.current = null; };

  const close = useCallback(() => {
    stopTimer();
    setMode(null); setProgress(0); setTaps(0); setSent(null); setError('');
  }, []);

  const fire = useCallback(async () => {
    stopTimer();
    const locate = () => new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ latitude: 0, longitude: 0 });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => resolve({ latitude: 0, longitude: 0 }),
        { timeout: 4000, maximumAge: 30000 }
      );
    });
    setMode('sent');
    setSent(null);
    try {
      const pos = await locate();
      const res = await safetyAPI.triggerSOS(pos);
      setSent({ ...pos, message: res.data.message, at: new Date() });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send the alert. Call 112 directly.');
    }
  }, []);

  const loadContacts = () => safetyAPI.getContacts().then((r) => setContacts(r.data.contacts)).catch(() => {});

  const onPointerDown = (e) => {
    if (modeRef.current) return;
    e.preventDefault();
    loadContacts();
    startedAt.current = Date.now();
    setMode('hold');
    setProgress(0);
    timer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) fire();
    }, 30);
  };

  // Release anywhere: a long-enough hold already fired; a quick tap switches to tap-three mode; otherwise cancel
  useEffect(() => {
    const release = () => {
      if (modeRef.current !== 'hold') return;
      stopTimer();
      if (Date.now() - startedAt.current < 350) { setMode('tap'); setProgress(0); }
      else close();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); stopTimer(); };
  }, [close]);

  const tap = () => {
    const n = taps + 1;
    setTaps(n);
    if (n >= 3) fire();
  };

  const remaining = Math.max(0, (HOLD_MS * (1 - progress)) / 1000).toFixed(1);
  const count = contacts.length;

  const overlay = mode && createPortal(
    mode === 'sent' ? (
      <div className="sos-screen light" role="dialog" aria-label="SOS alert sent">
        <div className="sent-mark"><Check size={44} /></div>
        {error ? (
          <>
            <h1>Alert not sent</h1>
            <p className="muted center">{error}</p>
          </>
        ) : !sent ? (
          <>
            <h1>Sending alert…</h1>
            <p className="muted center">Getting your location and notifying your contacts.</p>
          </>
        ) : (
          <>
            <h1>Alert sent</h1>
            <p className="muted center">
              {count ? `Your emergency contacts have your live location as of ${sent.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'No emergency contacts are saved yet, add some in your profile.'} Stay where it's safe.
            </p>
            {count > 0 && (
              <div className="card contact-list">
                {contacts.map((c, i) => (
                  <div className="row" key={c.id || i}>
                    <span className={`avatar ${i % 2 ? 'violet' : ''}`}>{c.name?.[0]?.toUpperCase()}</span>
                    <div className="grow"><b>{c.name}</b><div className="muted small">SMS + WhatsApp</div></div>
                    <span className="tag violet"><Check size={12} /> Sent</span>
                  </div>
                ))}
              </div>
            )}
            <a className="card where" href={`https://www.google.com/maps?q=${sent.latitude},${sent.longitude}`} target="_blank" rel="noreferrer">
              <span className="icon-tile pink"><MapPin size={20} /></span>
              <div><b>{sent.latitude || sent.longitude ? `${sent.latitude.toFixed(4)}, ${sent.longitude.toFixed(4)}` : 'Location unavailable'}</b><div className="muted small">Open in maps</div></div>
            </a>
          </>
        )}
        <div className="grow" />
        <a className="btn danger lg block" href="tel:112"><Phone size={18} /> Call 112 · Emergency</a>
        <button className="btn outline-violet lg block" onClick={close}>{error ? 'Close' : "I'm safe — end alert"}</button>
      </div>
    ) : (
      <div className="sos-screen dark" role="dialog" aria-label="SOS">
        <button className="cancel" onClick={close}><X size={18} /> Cancel</button>
        <h1>{mode === 'hold' ? 'Keep holding' : `Tap ${3 - taps} more time${3 - taps === 1 ? '' : 's'}`}</h1>
        <p>{mode === 'hold' ? `Alert sends in ${remaining} s` : 'Tap the SOS button three times to send your alert'}</p>
        <button className="sos-ring-btn" onClick={mode === 'tap' ? tap : undefined} aria-label="SOS">
          <svg viewBox="0 0 260 260" width="260" height="260">
            <circle cx="130" cy="130" r="120" className="track" />
            <circle cx="130" cy="130" r="120" className="fill" strokeDasharray={RING}
              strokeDashoffset={RING * (1 - (mode === 'hold' ? progress : taps / 3))} transform="rotate(-90 130 130)" />
          </svg>
          <span className="core"><b>SOS</b><small>{mode === 'hold' ? 'Holding…' : `${taps} / 3`}</small></span>
        </button>
        <p className="hint">
          {mode === 'hold' ? 'Release to cancel. ' : ''}
          When it fills, your live location goes to your {count || ''} emergency contact{count === 1 ? '' : 's'}.
        </p>
        <div className="grow" />
        <a className="btn cream lg block" href="tel:112"><Phone size={18} /> Call 112 directly</a>
      </div>
    ),
    document.body
  );

  return (
    <>
      {variant === 'nav' ? (
        <button className="sos-nav" onPointerDown={onPointerDown} aria-label="SOS, press and hold">
          <Shield size={16} /> SOS · hold
        </button>
      ) : (
        <button className="sos-fab" onPointerDown={onPointerDown} aria-label="SOS, press and hold">SOS</button>
      )}
      {overlay}
    </>
  );
}

export default SOSButton;
