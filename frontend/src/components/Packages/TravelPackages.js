import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Sparkles, ShieldCheck, Check, X, MapPin, Clock, Users, Minus, Plus, Search } from 'lucide-react';
import { categoryIcon } from '../../utils/categoryIcons';
import { packagesAPI } from '../../utils/api';
import './TravelPackages.css';

const CATEGORIES = ['All', 'Trekking', 'Adventure', 'Wellness', 'Cultural', 'Wildlife', 'Beach', 'Pilgrimage'];
const TINT = { Trekking: 'mint', Adventure: 'sky', Wellness: 'pink', Cultural: 'peach', Wildlife: 'mint', Beach: 'sky', Pilgrimage: 'peach' };
const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const asList = (v) => (Array.isArray(v) ? v : []);
const nice = (s, opts) => new Date(`${s}T00:00:00`).toLocaleDateString([], opts);

// A package runs on a date if it is one of its departure dates, or (with none listed) inside its availability window
const runsOn = (p, date) => {
  const deps = asList(p.departure_dates);
  return deps.length ? deps.includes(date) : date >= p.available_from && date <= p.available_to;
};

function TravelPackages({ userLocation }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(null);
  const [booking, setBooking] = useState({ loading: false, done: false, error: '' });
  const [form, setForm] = useState({ travelers: 1, travel_date: '' });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = {};
        if (category !== 'All') params.category = category;
        if (userLocation) Object.assign(params, { lat: userLocation.lat, lng: userLocation.lng, radius: 100000 });
        setPackages((await packagesAPI.getAll(params)).data.packages || []);
      } catch (err) {
        console.error('Error fetching packages:', err);
        setPackages([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [category, userLocation]);

  const today = iso(new Date());
  const days = useMemo(() => {
    const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)).filter((d) => iso(d) >= iso(new Date()));
  }, [month]);
  const hasTrip = (d) => packages.some((p) => runsOn(p, iso(d)));

  const shown = packages.filter((p) =>
    (!date || runsOn(p, date)) &&
    (!query || `${p.title} ${p.destination} ${p.provider_name || ''}`.toLowerCase().includes(query.toLowerCase())));

  const open = (p) => { setSelected(p); setBooking({ loading: false, done: false, error: '' }); setForm({ travelers: 1, travel_date: date || '' }); };

  const book = async () => {
    if (!form.travel_date) return setBooking({ loading: false, done: false, error: 'Please choose a travel date' });
    setBooking({ loading: true, done: false, error: '' });
    try {
      await packagesAPI.book(selected.id, { travelers: form.travelers, travel_date: form.travel_date });
      setBooking({ loading: false, done: true, error: '' });
    } catch (err) {
      setBooking({ loading: false, done: false, error: err.response?.data?.error || 'Failed to book package' });
    }
  };

  const includes = asList(selected?.includes);
  const itinerary = asList(selected?.itinerary);
  const departures = asList(selected?.departure_dates).filter((d) => d >= today).slice(0, 8);

  return (
    <>
      <div className="page-head"><div><h1>Trips</h1><p>Multi-day trips from verified operators.</p></div>
        <div className="input-icon trips-search"><Search size={18} /><input className="input" placeholder="Search trips or places" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      </div>

      <Link to="/itinerary" className="card row between" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 14 }}>
        <span className="row" style={{ gap: 12 }}><span className="icon-tile violet"><Sparkles size={20} /></span>
          <span><b>Plan your own trip</b><span className="muted small" style={{ display: 'block' }}>Get a day-by-day itinerary for any destination.</span></span></span>
        <ChevronRight size={18} />
      </Link>

      <div className="card cal">
        <div className="row between">
          <b style={{ fontFamily: 'var(--font-head)', fontSize: 19 }}>{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</b>
          <div className="row" style={{ gap: 8 }}>
            <button className="icon-btn sm" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
            <button className="icon-btn sm" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="days">
          {days.map((d) => {
            const s = iso(d);
            return (
              <button key={s} disabled={s < today} className={`day ${date === s ? 'on' : ''}`} onClick={() => setDate(date === s ? null : s)}>
                <small>{d.toLocaleDateString([], { weekday: 'short' })}</small>
                <b>{d.getDate()}</b>
                <i className={hasTrip(d) ? 'dot' : ''} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="chips" style={{ margin: '18px 0' }}>
        {CATEGORIES.map((c) => <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}
      </div>

      <div className="row between" style={{ marginBottom: 12 }}>
        <h2>{date ? `Departing ${nice(date, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'All upcoming trips'}</h2>
        <span className="muted small">{shown.length} trip{shown.length === 1 ? '' : 's'}</span>
      </div>

      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : shown.length === 0 ? <div className="card empty"><h3>No trips found</h3><p>Try another date, category or search.</p></div>
        : (
          <div className="trip-grid">
            {shown.map((p) => (
              <div key={p.id} className="card trip">
                <div className={`ph ${TINT[p.category] ?? ''} cover`}>
                  {p.image_url ? <img src={p.image_url} alt="" /> : React.createElement(categoryIcon(p.category), { size: 44, strokeWidth: 1.6 })}
                  <span className="tag mint cat">{p.category}</span>
                  {p.provider_verified === 1 && <span className="tag dark ver"><ShieldCheck size={12} /> Verified operator</span>}
                </div>
                <div className="stack" style={{ gap: 6, padding: '4px 4px 2px' }}>
                  <h3>{p.title}</h3>
                  <span className="muted small">{p.duration_days} day{p.duration_days > 1 ? 's' : ''} · {p.destination}{p.provider_name ? ` · ${p.provider_name}` : ''}</span>
                  <hr className="divider" style={{ margin: '6px 0' }} />
                  <div className="row between"><span><b className="price">{inr(p.price)}</b> <span className="muted small">/ person</span></span>
                    <button className="btn primary" onClick={() => open(p)}>View trip</button></div>
                </div>
              </div>
            ))}
          </div>
        )}

      {selected && (
        <div className="overlay sheet-bottom" onClick={() => setSelected(null)}>
          <div className="sheet stack" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className={`ph ${TINT[selected.category] ?? ''} sheet-cover`}>
              {selected.image_url ? <img src={selected.image_url} alt="" /> : React.createElement(categoryIcon(selected.category), { size: 48, strokeWidth: 1.6 })}
              <button className="icon-btn sm x" onClick={() => setSelected(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="row wrap" style={{ gap: 8 }}><span className="tag mint">{selected.category}</span>{selected.provider_verified === 1 && <span className="tag dark"><ShieldCheck size={12} /> Verified operator</span>}</div>
            <div><h2>{selected.title}</h2><p className="muted">by {selected.provider_name}</p></div>
            <div className="grid-2 facts">
              <span><MapPin size={16} /> {selected.destination}</span>
              <span><Clock size={16} /> {selected.duration_days} day{selected.duration_days > 1 ? 's' : ''}</span>
              <span><Users size={16} /> Max {selected.max_travelers}</span>
              <span><Check size={16} /> {selected.total_bookings} bookings</span>
            </div>
            <p>{selected.description}</p>
            {includes.length > 0 && <div><h3>What's included</h3><ul className="incl">{includes.map((i) => <li key={i}><Check size={15} /> {i}</li>)}</ul></div>}
            {itinerary.length > 0 && (
              <div><h3>Itinerary</h3>
                <ol className="itin">{itinerary.map((d, i) => <li key={i}><b>Day {d.day || i + 1} · {d.title}</b><p className="muted small">{d.desc}</p></li>)}</ol></div>
            )}
            {booking.done ? (
              <div className="alert success"><Check size={20} /><span><b>Booking placed!</b> The operator will confirm shortly.</span></div>
            ) : (
              <>
                {departures.length > 0 && (
                  <div><h3>Departures</h3>
                    <div className="chips" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                      {departures.map((d) => <button key={d} className={`chip ${form.travel_date === d ? 'active' : ''}`} onClick={() => setForm({ ...form, travel_date: d })}>{nice(d, { day: 'numeric', month: 'short' })}</button>)}
                    </div></div>
                )}
                <div className="grid-2">
                  <div className="field"><label>Travelers</label>
                    <div className="stepper"><button type="button" onClick={() => setForm({ ...form, travelers: Math.max(1, form.travelers - 1) })}><Minus size={16} /></button><b>{form.travelers}</b><button type="button" className="plus" onClick={() => setForm({ ...form, travelers: Math.min(selected.max_travelers || 20, form.travelers + 1) })}><Plus size={16} /></button></div></div>
                  <div className="field"><label htmlFor="tdate">Travel date</label><input id="tdate" type="date" className="input" min={today} value={form.travel_date} onChange={(e) => setForm({ ...form, travel_date: e.target.value })} /></div>
                </div>
                <div className="row between"><span className="muted">Total</span><b style={{ fontFamily: 'var(--font-head)', fontSize: 24 }}>{inr(selected.price * form.travelers)}</b></div>
                {booking.error && <div className="alert">{booking.error}</div>}
                <button className="btn primary lg block" disabled={booking.loading} onClick={book}>{booking.loading ? 'Booking…' : 'Book this trip'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default TravelPackages;
