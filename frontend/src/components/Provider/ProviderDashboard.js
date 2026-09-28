import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { categoryIcon } from '../../utils/categoryIcons';
import { packagesAPI } from '../../utils/api';
import { initials } from '../../utils/activityTypes';
import '../Vendor/Partner.css';

const CATEGORIES = ['Adventure', 'Trekking', 'Wellness', 'Cultural', 'Wildlife', 'Beach', 'Pilgrimage'];
const TINT = { Trekking: 'mint', Adventure: 'sky', Wellness: 'pink', Cultural: 'peach', Wildlife: 'mint', Beach: 'sky', Pilgrimage: 'peach' };
const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const statusTone = { pending: 'amber', confirmed: 'violet', cancelled: 'plain' };
const asList = (v) => (Array.isArray(v) ? v : []);
const day = (d) => new Date(d).toISOString().slice(0, 10);

function PackageModal({ pkg, onClose, onSaved }) {
  const today = new Date();
  const [form, setForm] = useState({
    title: pkg?.title || '', destination: pkg?.destination || '', category: pkg?.category || 'Adventure', price: pkg?.price ?? '',
    duration_days: pkg?.duration_days ?? 3, max_travelers: pkg?.max_travelers ?? 12,
    available_from: pkg ? day(pkg.available_from) : day(today), available_to: pkg ? day(pkg.available_to) : day(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())),
    description: pkg?.description || '', includes: asList(pkg?.includes).join('\n'), departures: asList(pkg?.departure_dates).join(', '),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = {
        title: form.title, destination: form.destination, category: form.category, price: form.price,
        duration_days: parseInt(form.duration_days, 10), max_travelers: parseInt(form.max_travelers, 10),
        available_from: form.available_from, available_to: form.available_to, description: form.description,
        includes: form.includes.split('\n').map((s) => s.trim()).filter(Boolean),
        departure_dates: form.departures.split(/[,\s]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      };
      if (pkg) await packagesAPI.update(pkg.id, data); else await packagesAPI.create(data);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save trip');
      setSaving(false);
    }
  };

  return (
    <div className="overlay sheet-bottom" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head"><h2>{pkg ? 'Edit trip' : 'New trip'}</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="field"><label htmlFor="pt">Title</label><input id="pt" className="input" required minLength={3} value={form.title} onChange={set('title')} placeholder="Valley of Flowers trek" /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="pd">Destination</label><input id="pd" className="input" required value={form.destination} onChange={set('destination')} /></div>
          <div className="field"><label htmlFor="pc">Category</label><select id="pc" className="select" value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="pp">Price per person (₹)</label><input id="pp" className="input" type="number" min="0" required value={form.price} onChange={set('price')} /></div>
          <div className="field"><label htmlFor="pdd">Days</label><input id="pdd" className="input" type="number" min="1" max="90" required value={form.duration_days} onChange={set('duration_days')} /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="pf">Available from</label><input id="pf" className="input" type="date" required value={form.available_from} onChange={set('available_from')} /></div>
          <div className="field"><label htmlFor="pto">Available to</label><input id="pto" className="input" type="date" required value={form.available_to} onChange={set('available_to')} /></div>
        </div>
        <div className="field"><label htmlFor="pdep">Departure dates <span className="muted small">(YYYY-MM-DD, comma separated; optional)</span></label><input id="pdep" className="input" value={form.departures} onChange={set('departures')} placeholder="2026-10-05, 2026-10-19" /></div>
        <div className="field"><label htmlFor="pm">Max travelers</label><input id="pm" className="input" type="number" min="1" value={form.max_travelers} onChange={set('max_travelers')} /></div>
        <div className="field"><label htmlFor="pi">What's included <span className="muted small">(one per line)</span></label><textarea id="pi" className="textarea" value={form.includes} onChange={set('includes')} placeholder={'Guide\nMeals\nTransport'} /></div>
        <div className="field"><label htmlFor="pde">Description</label><textarea id="pde" className="textarea" value={form.description} onChange={set('description')} /></div>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary lg block" disabled={saving}>{saving ? 'Saving…' : pkg ? 'Save changes' : 'Publish trip'}</button>
      </form>
    </div>
  );
}

function ProviderDashboard({ user }) {
  const [packages, setPackages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    try {
      const [p, b] = await Promise.all([packagesAPI.getProviderPackages(), packagesAPI.getProviderBookings()]);
      setPackages(p.data.packages || []);
      setBookings(b.data.bookings || []);
    } catch (err) { console.error('Error:', err); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, status) => {
    try { await packagesAPI.updateBookingStatus(id, status); load(); } catch (err) { alert(err.response?.data?.error || 'Failed to update booking'); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this trip?')) return;
    try { await packagesAPI.delete(id); load(); } catch (err) { alert('Failed to delete'); }
  };

  if (loading) return <div className="empty"><div className="spinner" style={{ margin: '60px auto' }} /></div>;

  const pending = bookings.filter((b) => b.status === 'pending').length;
  const confirmed = bookings.filter((b) => b.status === 'confirmed');
  const revenue = confirmed.reduce((s, b) => s + Number(b.total_price || 0), 0);

  return (
    <div className="partner">
      <div className="page-head">
        <div><h1>{greeting()}, {user.full_name.split(' ')[0]}</h1><p>Your trips and traveler requests at a glance.</p></div>
        <button className="btn primary" onClick={() => setModal('new')}><Plus size={16} /> New trip</button>
      </div>

      <div className="stats4">
        <div className="stat4"><small>Trips</small><b>{packages.length}</b></div>
        <div className="stat4 alert-num"><small>Pending requests</small><b>{pending}</b></div>
        <div className="stat4"><small>Confirmed</small><b>{confirmed.length}</b></div>
        <div className="stat4"><small>Revenue</small><b>{inr(revenue)}</b></div>
      </div>

      <div className="cols">
        <section className="card">
          <h2 style={{ marginBottom: 6 }}>Traveler requests</h2>
          {bookings.length === 0 ? <p className="empty">No bookings yet.</p> : (
            <table>
              <thead><tr><th>Traveler</th><th>Trip</th><th>Date</th><th>Travelers</th><th>Action</th></tr></thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td><span className="who"><span className="avatar sm">{initials(b.booker_name)}</span>{b.booker_name}</span></td>
                    <td>{b.package_title}</td>
                    <td>{new Date(b.travel_date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                    <td>{b.travelers}</td>
                    <td>{b.status === 'pending'
                      ? <span className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn sm" onClick={() => decide(b.id, 'cancelled')}>Decline</button><button className="btn sm primary" onClick={() => decide(b.id, 'confirmed')}>Accept</button></span>
                      : <span className={`tag ${statusTone[b.status] || 'plain'}`}>{b.status === 'confirmed' ? 'Accepted' : b.status === 'cancelled' ? 'Declined' : b.status}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card stack">
          <h2>Your trips</h2>
          {packages.map((p) => (
            <div className="exp" key={p.id}>
              <span className={`ph ${TINT[p.category] || ''}`}>{p.image_url ? <img src={p.image_url} alt="" /> : React.createElement(categoryIcon(p.category), { size: 22 })}</span>
              <div className="grow"><b>{p.title}</b><div className="muted small">{p.category} · {inr(p.price)} · {p.duration_days}d</div></div>
              <button className="icon-btn sm" aria-label={`Edit ${p.title}`} onClick={() => setModal(p)}><Pencil size={14} /></button>
              <button className="icon-btn sm" aria-label={`Delete ${p.title}`} onClick={() => remove(p.id)}><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="add-dashed" onClick={() => setModal('new')}><Plus size={16} style={{ verticalAlign: '-3px' }} /> Add another trip</button>
        </section>
      </div>

      {modal && <PackageModal pkg={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

export default ProviderDashboard;
