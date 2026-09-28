import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, Camera, X, Mountain, Car, Plus, Pencil } from 'lucide-react';
import { usersAPI, wavesAPI, bookingAPI, packagesAPI, safetyAPI } from '../../utils/api';
import { initials, formatWhen } from '../../utils/activityTypes';
import SafetyPanel from './SafetyPanel';
import './Profile.css';

const LEVELS = ['New traveler', 'Verified traveler', 'Trusted host'];

const TrustRing = ({ level }) => {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 110 110" width="104" height="104" aria-hidden="true">
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--cream-2)" strokeWidth="10" />
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--violet)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - level / 3)} transform="rotate(-90 55 55)" />
      <text x="55" y="56" textAnchor="middle" fontFamily="var(--font-head)" fontWeight="800" fontSize="30" fill="var(--ink)">{level}</text>
      <text x="55" y="74" textAnchor="middle" fontSize="11" fill="var(--muted)">of 3</text>
    </svg>
  );
};

function EditProfileModal({ profile, onSave, onClose }) {
  const [form, setForm] = useState({
    full_name: profile.full_name || '', home_location: profile.home_location || '', email: profile.email || '',
    phone_number: profile.phone_number || '', upi_id: profile.upi_id || '', bio: profile.bio || '',
  });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photo) fd.append('profile_photo', photo);
      await onSave(fd);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
      setSaving(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="overlay sheet-bottom" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head"><h2>Edit profile</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="row">
          {preview || profile.profile_photo ? <img className="avatar lg" src={preview || profile.profile_photo} alt="" /> : <span className="avatar lg violet">{initials(form.full_name)}</span>}
          <label className="btn sm"><Camera size={14} /> Change photo
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; if (f) { setPhoto(f); setPreview(URL.createObjectURL(f)); } }} /></label>
        </div>
        <div className="field"><label htmlFor="epn">Full name</label><input id="epn" className="input" required minLength={2} value={form.full_name} onChange={set('full_name')} /></div>
        <div className="field"><label htmlFor="eph">Home base</label><input id="eph" className="input" value={form.home_location} onChange={set('home_location')} placeholder="Bengaluru" /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="epe">Email</label><input id="epe" className="input" type="email" value={form.email} onChange={set('email')} /></div>
          <div className="field"><label htmlFor="epp">Phone</label><input id="epp" className="input" type="tel" value={form.phone_number} onChange={set('phone_number')} placeholder="+91 98765 43210" /></div>
        </div>
        <div className="field"><label htmlFor="epu">UPI ID <span className="muted small">(so friends can pay you back in group trips)</span></label><input id="epu" className="input" value={form.upi_id} onChange={set('upi_id')} placeholder="name@okbank" /></div>
        <p className="muted small">Changing your email or phone will require verifying it again.</p>
        <div className="field"><label htmlFor="epb">Bio</label><textarea id="epb" className="textarea" maxLength={500} value={form.bio} onChange={set('bio')} placeholder="Slow traveller, chai collector…" /></div>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary lg block" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </form>
    </div>
  );
}

function Profile({ user, setUser, onLogout }) {
  const [profile, setProfile] = useState(user);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [travels, setTravels] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const p = (await usersAPI.getProfile()).data.user;
      setProfile(p);
      const merged = { ...user, ...p };
      localStorage.setItem('user', JSON.stringify(merged));
      setUser?.(merged);
    } catch (err) { console.error('Profile fetch failed:', err); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
    safetyAPI.getContacts().then((r) => setContacts(r.data.contacts)).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (tab === 'overview' && travels) return;
    Promise.all([usersAPI.getMyActivities(), wavesAPI.getMyWaves(), bookingAPI.getMyBookings(), packagesAPI.getMyBookings()])
      .then(([a, w, b, p]) => setTravels({ activities: a.data, waves: w.data, bookings: b.data.bookings, trips: p.data.bookings }))
      .catch((err) => console.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const save = async (fd) => {
    const res = await usersAPI.updateProfile(fd);
    const merged = { ...user, ...res.data.user };
    localStorage.setItem('user', JSON.stringify(merged));
    setUser?.(merged);
    setProfile((p) => ({ ...p, ...res.data.user }));
    setEditing(false);
    refresh();
  };

  const contactOk = profile.email_verified === 1 || profile.phone_verified === 1;
  const idOk = profile.aadhaar_status === 'verified';
  const level = 1 + (contactOk ? 1 : 0) + (idOk ? 1 : 0);
  const now = new Date();

  const upcoming = travels ? [
    ...travels.activities.hosted.map((a) => ({ key: `ah${a.id}`, kind: 'activity', title: a.title, when: a.start_time, note: 'Hosting', to: `/activity/${a.id}` })),
    ...travels.activities.attending.map((a) => ({ key: `aa${a.id}`, kind: 'activity', title: a.title, when: a.start_time, note: `with ${a.host_name}`, to: `/activity/${a.id}` })),
    ...travels.waves.hosted.map((w) => ({ key: `wh${w.id}`, kind: 'wave', title: `Wave to ${w.destination_name}`, when: w.departure_time, note: 'Hosting', to: '/waves' })),
    ...travels.waves.requested.map((r) => ({ key: `wr${r.id}`, kind: 'wave', title: `Wave to ${r.destination_name}`, when: r.departure_time, note: r.status, to: '/waves' })),
  ].filter((x) => new Date(x.when) >= now).sort((a, b) => new Date(a.when) - new Date(b.when)) : [];

  const experiences = travels ? travels.bookings.length + travels.trips.length : 0;

  return (
    <div className="profile-grid">
      <aside className="card profile-card">
        <div className="banner" />
        {profile.profile_photo ? <img className="big-avatar" src={profile.profile_photo} alt="" /> : <span className="big-avatar">{initials(profile.full_name)}</span>}
        <h2>{profile.full_name}</h2>
        <p className="muted">@{profile.username}{profile.home_location ? ` · ${profile.home_location}` : ''}</p>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
          {profile.email_verified === 1 && <span className="tag"><Check size={12} /> Email</span>}
          {profile.phone_verified === 1 && <span className="tag"><Check size={12} /> Phone</span>}
          {idOk && <span className="tag mint"><Check size={12} /> ID</span>}
        </div>
        {profile.bio && <p className="bio">{profile.bio}</p>}
        <button className="btn block" onClick={() => setEditing(true)}><Pencil size={15} /> Edit profile</button>
        <button className="btn block" onClick={onLogout}>Sign out</button>
      </aside>

      <main className="stack" style={{ gap: 18, minWidth: 0 }}>
        <div className="tabs" role="tablist">
          {[['overview', 'Overview'], ['adventures', 'Adventures'], ['safety', 'Trust & safety']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="overview">
            <section className="card stack trust">
              <div className="row" style={{ gap: 18 }}>
                <TrustRing level={level} />
                <div>
                  <small className="eyebrow">TRUST LEVEL</small>
                  <h2>{LEVELS[level - 1]}</h2>
                  <p className="muted">{level === 3 ? 'You are at the top tier.' : idOk ? 'Verify email or phone to level up.' : 'Add ID to reach Level 3 and host rides.'}</p>
                </div>
              </div>
              <hr className="divider" />
              {[
                { ok: profile.email_verified === 1, label: 'Email', sub: profile.email },
                { ok: profile.phone_verified === 1, label: 'Phone', sub: profile.phone_number || 'Not added' },
                { ok: idOk, label: 'Aadhaar ID', sub: profile.aadhaar_status === 'pending' ? 'Under review' : 'Unlocks Level 3 and ride hosting' },
              ].map((r) => (
                <div className="row trust-row" key={r.label}>
                  <span className={`check ${r.ok ? 'on' : ''}`}>{r.ok && <Check size={14} />}</span>
                  <div className="grow"><b>{r.label}</b><div className="muted small">{r.sub}</div></div>
                  {r.ok ? <b className="secured">Secured</b> : <button className="btn amber sm" onClick={() => setTab('safety')}>Verify</button>}
                </div>
              ))}
            </section>

            <div className="side-col">
              <div className="stats">
                <div className="stat amber"><b>{experiences}</b><span>Experiences</span></div>
                <div className="stat mint"><b>{profile.connections_count || 0}</b><span>Connections</span></div>
              </div>
              <section className="card stack">
                <div className="row between"><h3>Emergency contacts</h3><button className="icon-btn sm" aria-label="Add contact" onClick={() => setTab('safety')}><Plus size={15} /></button></div>
                {contacts.length === 0 ? <p className="muted small">Add people who should hear from you if you press SOS.</p>
                  : contacts.slice(0, 3).map((c, i) => (
                    <div className="row" key={c.id}><span className={`avatar ${i % 2 ? 'violet' : ''}`}>{initials(c.name)}</span><div><b>{c.name}</b><div className="muted small">{c.relationship} · {c.phone_number}</div></div></div>
                  ))}
              </section>
            </div>

            <section className="card stack wide">
              <h3>Upcoming adventures</h3>
              {upcoming.length === 0 ? <p className="muted">Nothing planned yet. <Link to="/">Find a meetup</Link> or <Link to="/waves">share a ride</Link>.</p>
                : <div className="upcoming">{upcoming.slice(0, 4).map((u) => (
                  <Link key={u.key} to={u.to} className="card flat row up-item">
                    <span className={`icon-tile ${u.kind === 'wave' ? 'pink' : 'violet'}`}>{u.kind === 'wave' ? <Car size={20} /> : <Mountain size={20} />}</span>
                    <div><b>{u.title}</b><div className="muted small">{formatWhen(u.when)} · {u.note}</div></div>
                  </Link>))}</div>}
            </section>
          </div>
        )}

        {tab === 'adventures' && (
          <div className="stack" style={{ gap: 14 }}>
            {!travels ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
              <>
                <section className="card stack"><h3>Meetups & rides</h3>
                  {upcoming.length === 0 && <p className="muted">No upcoming meetups or rides.</p>}
                  {upcoming.map((u) => <Link key={u.key} to={u.to} className="row up-link"><span className={`icon-tile ${u.kind === 'wave' ? 'pink' : 'violet'}`}>{u.kind === 'wave' ? <Car size={20} /> : <Mountain size={20} />}</span><div><b>{u.title}</b><div className="muted small">{formatWhen(u.when)} · {u.note}</div></div></Link>)}
                </section>
                <section className="card stack"><h3>Shop bookings</h3>
                  {travels.bookings.length === 0 && <p className="muted">No bookings yet.</p>}
                  {travels.bookings.map((b) => <div className="row between" key={b.id}><div><b>{b.listing_title}</b><div className="muted small">{b.quantity} × · ₹{Math.round(b.total_price)}</div></div><span className={`tag ${b.status === 'confirmed' ? 'mint' : b.status === 'cancelled' ? 'red' : 'amber'}`}>{b.status}</span></div>)}
                </section>
                <section className="card stack"><h3>Trip bookings</h3>
                  {travels.trips.length === 0 && <p className="muted">No trips booked yet.</p>}
                  {travels.trips.map((b) => <div className="row between" key={b.id}><div><b>{b.package_title}</b><div className="muted small">{b.destination} · {new Date(b.travel_date).toLocaleDateString()} · ₹{Math.round(b.total_price)}</div></div><span className={`tag ${b.status === 'confirmed' ? 'mint' : b.status === 'cancelled' ? 'red' : 'amber'}`}>{b.status}</span></div>)}
                </section>
              </>
            )}
          </div>
        )}

        {tab === 'safety' && <SafetyPanel profile={profile} onChanged={refresh} />}
      </main>

      {editing && <EditProfileModal profile={profile} onSave={save} onClose={() => setEditing(false)} />}
    </div>
  );
}

export default Profile;
