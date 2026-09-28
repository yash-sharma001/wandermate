import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, Check, Flag, Minus, Plus } from 'lucide-react';
import { marketplaceAPI, bookingAPI } from '../../utils/api';
import { categoryIcon } from '../../utils/categoryIcons';
import ReportModal from '../Safety/ReportModal';
import './Marketplace.css';

const CATEGORIES = ['All', 'Yoga', 'Rafting', 'Stays', 'Camping', 'Cafe', 'Photography', 'Adventure'];
const TINT = { Yoga: 'mint', Rafting: 'sky', Stays: '', Camping: 'peach', Cafe: 'peach', Photography: 'pink', Adventure: 'mint' };
const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

const distanceKm = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

function Marketplace({ userLocation }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState(false);
  const [booking, setBooking] = useState({ loading: false, done: false, error: '' });
  const [form, setForm] = useState({ quantity: 1, booking_date: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (category !== 'All') params.category = category;
      if (userLocation) Object.assign(params, { lat: userLocation.lat, lng: userLocation.lng, radius: 50000 });
      setListings((await marketplaceAPI.getListings(params)).data.listings || []);
    } catch (err) {
      console.error('Error fetching listings:', err);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [category, userLocation]);
  useEffect(() => { load(); }, [load]);

  const shown = listings.filter((l) => !query || `${l.title} ${l.vendor_name || ''}`.toLowerCase().includes(query.toLowerCase()));

  const open = (l) => { setSelected(l); setBooking({ loading: false, done: false, error: '' }); setForm({ quantity: 1, booking_date: '' }); };

  const book = async () => {
    setBooking({ loading: true, done: false, error: '' });
    try {
      await bookingAPI.create({ listing_id: selected.id, quantity: form.quantity, booking_date: form.booking_date || undefined });
      setBooking({ loading: false, done: true, error: '' });
    } catch (err) {
      setBooking({ loading: false, done: false, error: err.response?.data?.error || 'Failed to create booking' });
    }
  };

  return (
    <>
      <div className="page-head"><div><h1>Shop local</h1><p>Experiences from vendors around you.</p></div></div>
      <div className="input-icon" style={{ marginBottom: 14 }}>
        <Search size={18} />
        <input className="input" placeholder="Search activities, stays, cafes…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="chips" style={{ marginBottom: 20 }}>
        {CATEGORIES.map((c) => <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}
      </div>

      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : shown.length === 0 ? <div className="card empty"><h3>Nothing here yet</h3><p>Try another category or clear the search.</p></div>
        : (
          <div className="shop-grid">
            {shown.map((l) => (
              <button key={l.id} className="card hover listing" onClick={() => open(l)}>
                <div className={`ph ${TINT[l.category] ?? ''} cover`}>
                  {l.image_url ? <img src={l.image_url} alt="" /> : React.createElement(categoryIcon(l.category), { size: 38, strokeWidth: 1.6 })}
                  <span className="tag cat">{l.category}</span>
                </div>
                <div className="body">
                  <b>{l.title}</b>
                  <span className="muted small">{l.vendor_name || 'Local guide'}</span>
                  <div className="row between" style={{ marginTop: 'auto' }}>
                    <b className="price">{inr(l.price)}</b>
                    <span className="muted small">{[l.duration, userLocation && l.latitude != null ? `${distanceKm(userLocation, { lat: l.latitude, lng: l.longitude }).toFixed(1)} km` : null].filter(Boolean).join(' · ')}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

      {selected && (
        <div className="overlay sheet-bottom" onClick={() => setSelected(null)}>
          <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
            <div className={`ph ${TINT[selected.category] ?? ''} sheet-cover`}>
              {selected.image_url ? <img src={selected.image_url} alt="" /> : React.createElement(categoryIcon(selected.category), { size: 44, strokeWidth: 1.6 })}
              <button className="icon-btn sm x" onClick={() => setSelected(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="row wrap" style={{ gap: 8 }}><span className="tag">{selected.category}</span>{selected.duration && <span className="tag plain">{selected.duration}</span>}</div>
            <div><h2>{selected.title}</h2><p className="muted">by {selected.vendor_name || 'a verified provider'}{selected.location_name ? ` · ${selected.location_name}` : ''}</p></div>
            <p>{selected.description || 'A local experience curated by our partners.'}</p>

            {booking.done ? (
              <div className="alert success"><Check size={20} /><span><b>Booking requested!</b> The vendor will confirm shortly. Track it in your profile.</span></div>
            ) : (
              <>
                <div className="grid-2">
                  <div className="field"><label>Quantity</label>
                    <div className="stepper"><button type="button" onClick={() => setForm({ ...form, quantity: Math.max(1, form.quantity - 1) })}><Minus size={16} /></button><b>{form.quantity}</b><button type="button" className="plus" onClick={() => setForm({ ...form, quantity: form.quantity + 1 })}><Plus size={16} /></button></div></div>
                  <div className="field"><label htmlFor="bdate">Date</label><input id="bdate" type="date" className="input" min={new Date().toISOString().slice(0, 10)} value={form.booking_date} onChange={(e) => setForm({ ...form, booking_date: e.target.value })} /></div>
                </div>
                <div className="row between"><span className="muted">Total</span><b style={{ fontFamily: 'var(--font-head)', fontSize: 24 }}>{inr(selected.price * form.quantity)}</b></div>
                {booking.error && <div className="alert">{booking.error}</div>}
                <button className="btn primary lg block" disabled={booking.loading} onClick={book}>{booking.loading ? 'Reserving…' : 'Request booking'}</button>
              </>
            )}
            <button className="link small center" onClick={() => setReport(true)}><Flag size={12} style={{ verticalAlign: '-1px' }} /> Report this listing</button>
          </div>
        </div>
      )}
      {report && selected && <ReportModal reportedUserId={selected.created_by} entityId={selected.id} entityType="listing" entityName={selected.title} onClose={() => setReport(false)} />}
    </>
  );
}

export default Marketplace;
