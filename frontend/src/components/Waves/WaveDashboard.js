import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, Search, Car, Check, Lock, ShieldCheck, Calendar, User } from 'lucide-react';
import { wavesAPI } from '../../utils/api';
import { initials } from '../../utils/activityTypes';
import HostWaveForm from './HostWaveForm';
import MyWaves from './MyWaves';
import './Waves.css';

const TABS = [['search', 'Find a ride'], ['host', 'Host a wave'], ['my-waves', 'My travels']];
const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const Route = ({ wave }) => (
  <div className="route">
    <span className="rail"><i className="from" /><i className="line" /><i className="to" /></span>
    <span className="stops"><b>{timeOf(wave.departure_time)} · {wave.origin_name}</b><b>{wave.destination_name}</b></span>
  </div>
);

function WaveCard({ wave, user, seats, onRequest, busy }) {
  const isHost = wave.host_id === user.id;
  const left = wave.capacity - wave.current_travelers;
  return (
    <div className="card wave-card">
      <Route wave={wave} />
      <div className="who">
        <span className="avatar violet">{initials(wave.host_name)}</span>
        <div>
          <b>{wave.host_name} <ShieldCheck size={14} color="var(--violet)" style={{ verticalAlign: '-2px' }} /></b>
          <div className="muted small">{[wave.car_model, wave.car_number].filter(Boolean).join(' · ') || 'Car details on request'}</div>
        </div>
      </div>
      <span className={`tag ${left <= 1 ? 'amber' : 'mint'}`}>{left} seat{left === 1 ? '' : 's'} left</span>
      <div className="price"><b>{inr(wave.price_per_seat)}</b><span className="muted small">per seat</span></div>
      {isHost ? <span className="tag plain">You're hosting</span> : (
        <button className="btn primary" disabled={left < seats || busy === wave.id} onClick={() => onRequest(wave.id)}>
          {busy === wave.id ? 'Sending…' : left < seats ? 'Not enough seats' : 'Request'}
        </button>
      )}
    </div>
  );
}

function WaveDashboard({ user }) {
  const [tab, setTab] = useState('search');
  const [params, setParams] = useState({ origin: '', destination: '', date: '', seats: 1 });
  const [waves, setWaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(null);

  const fetchWaves = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const res = await wavesAPI.getAll({ origin: p.origin, destination: p.destination, date: p.date });
      setWaves(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load waves');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWaves({}); }, [fetchWaves]);

  const request = async (id) => {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      await wavesAPI.join(id, { seats_requested: params.seats });
      setNotice('Request sent to the host. Track it under My travels.');
      fetchWaves(params);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to request join');
    } finally {
      setBusy(null);
    }
  };

  const verified = {
    email: user.email_verified === 1, phone: user.phone_verified === 1, id: user.aadhaar_status === 'verified',
  };
  const set = (patch) => setParams((p) => ({ ...p, ...patch }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}><h1>Waves</h1><span className="tag amber">ride-share</span></div>
          <p>Share rides with verified travelers and split the fare.</p>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
        </div>
      </div>

      {tab === 'search' && (
        <>
          <form className="card search-card" onSubmit={(e) => { e.preventDefault(); fetchWaves(params); }}>
            <label className="cell"><span className="dot from" /><small>From</small>
              <input value={params.origin} onChange={(e) => set({ origin: e.target.value })} placeholder="Tapovan, Rishikesh" /></label>
            <button type="button" className="icon-btn swap" aria-label="Swap" onClick={() => set({ origin: params.destination, destination: params.origin })}><ArrowUpDown size={16} /></button>
            <label className="cell"><span className="dot to" /><small>To</small>
              <input value={params.destination} onChange={(e) => set({ destination: e.target.value })} placeholder="Jolly Grant Airport, Dehradun" /></label>
            <label className="cell narrow"><Calendar size={15} /><small>Date</small>
              <input type="date" value={params.date} onChange={(e) => set({ date: e.target.value })} /></label>
            <label className="cell narrow"><User size={15} /><small>Seats</small>
              <input type="number" min="1" max="8" value={params.seats} onChange={(e) => set({ seats: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <button className="btn primary"><Search size={16} /> Search rides</button>
          </form>

          <div className="waves-layout">
            <section>
              <div className="row between" style={{ margin: '4px 0 12px' }}>
                <h2>Live waves</h2><span className="muted small">{waves.length} ride{waves.length === 1 ? '' : 's'}</span>
              </div>
              {notice && <div className="alert success" style={{ marginBottom: 12 }}><Check size={18} />{notice}</div>}
              {error && <div className="alert" style={{ marginBottom: 12 }}>{error}</div>}
              {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
                : waves.length === 0 ? <div className="card empty"><Car size={40} /><h3>No waves match yet</h3><p>Try other places or dates, or host one yourself.</p></div>
                : <div className="stack">{waves.map((w) => <WaveCard key={w.id} wave={w} user={user} seats={params.seats} onRequest={request} busy={busy} />)}</div>}
            </section>

            <aside className="promo">
              <span className="icon-tile amber"><Car size={22} /></span>
              <h2>Driving somewhere?</h2>
              <p>Host a wave and earn back your fuel. Hosting unlocks once your ID is verified.</p>
              <ul>
                <li className={verified.email ? 'ok' : ''}><Check size={16} /> Email verified</li>
                <li className={verified.phone ? 'ok' : ''}><Check size={16} /> Phone verified</li>
                <li className={verified.id ? 'ok' : 'todo'}>{verified.id ? <Check size={16} /> : <Lock size={16} />} Aadhaar ID {verified.id ? 'verified' : '— needed to host'}</li>
              </ul>
              {verified.id ? <button className="btn amber block" onClick={() => setTab('host')}>Host a wave</button>
                : <Link to="/profile" className="btn amber block">Verify my ID</Link>}
            </aside>
          </div>
        </>
      )}

      {tab === 'host' && <HostWaveForm user={user} onSuccess={() => setTab('my-waves')} />}
      {tab === 'my-waves' && <MyWaves user={user} />}
    </>
  );
}

export default WaveDashboard;
