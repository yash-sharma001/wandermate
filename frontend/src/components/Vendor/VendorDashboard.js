import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { categoryIcon } from '../../utils/categoryIcons';
import { marketplaceAPI, bookingAPI } from '../../utils/api';
import { initials } from '../../utils/activityTypes';
import './Partner.css';

const CATEGORIES = ['Yoga', 'Rafting', 'Stays', 'Camping', 'Cafe', 'Photography', 'Adventure', 'Other'];
const TINT = { Yoga: 'mint', Rafting: 'sky', Camping: 'peach', Cafe: 'peach', Photography: 'pink', Adventure: 'mint' };
const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const statusTone = { pending: 'amber', confirmed: 'violet', cancelled: 'plain' };

function ListingModal({ user, listing, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: listing?.title || '', description: listing?.description || '', category: listing?.category || 'Yoga',
    price: listing?.price ?? '', duration: listing?.duration || '', location_name: listing?.location_name || '',
    vendor_name: listing?.vendor_name || user.full_name || '', contact_phone: listing?.contact_phone || '',
    contact_email: listing?.contact_email || user.email || '',
    latitude: listing?.latitude ?? 30.0869, longitude: listing?.longitude ?? 78.298,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = { ...form, price: parseFloat(form.price), latitude: parseFloat(form.latitude), longitude: parseFloat(form.longitude) };
      if (listing) await marketplaceAPI.update(listing.id, data); else await marketplaceAPI.create(data);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save listing');
      setSaving(false);
    }
  };

  return (
    <div className="overlay sheet-bottom" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head"><h2>{listing ? 'Edit listing' : 'New listing'}</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="field"><label htmlFor="lt">Title</label><input id="lt" className="input" required value={form.title} onChange={set('title')} placeholder="Shivpuri to Ram Jhula, 16 km run" /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="lc">Category</label><select id="lc" className="select" value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="lp">Price (₹)</label><input id="lp" className="input" type="number" min="0" step="1" required value={form.price} onChange={set('price')} /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="ld">Duration</label><input id="ld" className="input" value={form.duration} onChange={set('duration')} placeholder="3 hrs" /></div>
          <div className="field"><label htmlFor="ll">Location</label><input id="ll" className="input" required value={form.location_name} onChange={set('location_name')} placeholder="Shivpuri, Rishikesh" /></div>
        </div>
        <div className="field"><label htmlFor="lv">Business name</label><input id="lv" className="input" required value={form.vendor_name} onChange={set('vendor_name')} /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="lph">Contact phone</label><input id="lph" className="input" type="tel" value={form.contact_phone} onChange={set('contact_phone')} /></div>
          <div className="field"><label htmlFor="le">Contact email</label><input id="le" className="input" type="email" value={form.contact_email} onChange={set('contact_email')} /></div>
        </div>
        <div className="field"><label htmlFor="lds">Description</label><textarea id="lds" className="textarea" value={form.description} onChange={set('description')} /></div>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary lg block" disabled={saving}>{saving ? 'Saving…' : listing ? 'Save changes' : 'Publish listing'}</button>
      </form>
    </div>
  );
}

function VendorDashboard({ user }) {
  const [listings, setListings] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | listing

  const load = useCallback(async () => {
    try {
      const [l, b] = await Promise.all([marketplaceAPI.getMyListings(), bookingAPI.getVendorBookings()]);
      setListings(l.data.listings || []);
      setBookings(b.data.bookings || []);
    } catch (err) { console.error('Error fetching vendor data:', err); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, status) => {
    try { await bookingAPI.updateStatus(id, status); load(); } catch (err) { alert(err.response?.data?.error || 'Failed to update booking'); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this listing?')) return;
    try { await marketplaceAPI.delete(id); load(); } catch (err) { alert('Failed to delete listing'); }
  };

  if (loading) return <div className="empty"><div className="spinner" style={{ margin: '60px auto' }} /></div>;

  const pending = bookings.filter((b) => b.status === 'pending').length;
  const rated = listings.filter((l) => l.rating);
  const avg = rated.length ? (rated.reduce((s, l) => s + Number(l.rating), 0) / rated.length).toFixed(1) : '–';
  const guests = bookings.filter((b) => b.status === 'confirmed').reduce((s, b) => s + b.quantity, 0);

  return (
    <div className="partner">
      <div className="page-head">
        <div><h1>{greeting()}, {user.full_name.split(' ')[0]}</h1><p>Here's what's happening with your experiences.</p></div>
        <button className="btn primary" onClick={() => setModal('new')}><Plus size={16} /> New listing</button>
      </div>

      <div className="stats4">
        <div className="stat4"><small>Active listings</small><b>{listings.filter((l) => l.is_active).length}</b></div>
        <div className="stat4 alert-num"><small>Pending requests</small><b>{pending}</b></div>
        <div className="stat4"><small>Confirmed guests</small><b>{guests}</b></div>
        <div className="stat4"><small>Average rating</small><b>{avg}</b></div>
      </div>

      <div className="cols">
        <section className="card">
          <div className="row between" style={{ marginBottom: 6 }}><h2>Recent requests</h2></div>
          {bookings.length === 0 ? <p className="empty">No requests yet. When travelers book your experiences they'll appear here.</p> : (
            <table>
              <thead><tr><th>Traveler</th><th>Experience</th><th>Date</th><th>Guests</th><th>Action</th></tr></thead>
              <tbody>
                {bookings.slice(0, 12).map((b) => (
                  <tr key={b.id}>
                    <td><span className="who"><span className="avatar sm">{initials(b.booker_name)}</span>{b.booker_name}</span></td>
                    <td>{b.listing_title}</td>
                    <td>{b.booking_date ? new Date(b.booking_date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '–'}</td>
                    <td>{b.quantity}</td>
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
          <div className="row between"><h2>Your experiences</h2><Link to="/marketplace"><b>View shop</b></Link></div>
          {listings.map((l) => (
            <div className="exp" key={l.id}>
              <span className={`ph ${TINT[l.category] || ''}`}>{l.image_url ? <img src={l.image_url} alt="" /> : React.createElement(categoryIcon(l.category), { size: 22 })}</span>
              <div className="grow"><b>{l.title}</b><div className="muted small">{l.category} · {inr(l.price)}{l.duration ? ` · ${l.duration}` : ''}</div></div>
              <button className="icon-btn sm" aria-label={`Edit ${l.title}`} onClick={() => setModal(l)}><Pencil size={14} /></button>
              <button className="icon-btn sm" aria-label={`Delete ${l.title}`} onClick={() => remove(l.id)}><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="add-dashed" onClick={() => setModal('new')}><Plus size={16} style={{ verticalAlign: '-3px' }} /> Add another experience</button>
        </section>
      </div>

      {modal && <ListingModal user={user} listing={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

export default VendorDashboard;
