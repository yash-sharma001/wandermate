import React, { useState, useEffect } from 'react';
import { ShieldCheck, Phone, Mail, Check, Clock, Camera, Plus, Trash2, Lock, Info } from 'lucide-react';
import { safetyAPI } from '../../utils/api';
import { initials } from '../../utils/activityTypes';

// Verification (email, phone, Aadhaar), emergency contacts and SOS help. `profile` comes from the parent; `onChanged` refreshes it.
function SafetyPanel({ profile, onChanged }) {
  const [contacts, setContacts] = useState([]);
  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', relationship: '', phone: '' });
  const [msg, setMsg] = useState(null); // { tone, text }
  const [emailCode, setEmailCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [phone, setPhone] = useState(profile.phone_number || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  const [aadhaar, setAadhaar] = useState({ number: '', name: profile.full_name || '', file: null, photo: null });
  const [busy, setBusy] = useState('');

  useEffect(() => { safetyAPI.getContacts().then((r) => setContacts(r.data.contacts)).catch(() => {}); }, []);

  const run = async (key, fn, ok) => {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fn();
      if (ok) setMsg({ tone: 'success', text: typeof ok === 'function' ? ok(res) : ok });
      return res;
    } catch (err) {
      setMsg({ tone: '', text: err.response?.data?.error || 'Something went wrong' });
      return null;
    } finally {
      setBusy('');
    }
  };

  const contactOk = profile.email_verified === 1 || profile.phone_verified === 1;

  const submitAadhaar = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('aadhaar_number', aadhaar.number);
    fd.append('aadhaar_name', aadhaar.name);
    fd.append('aadhaar_image', aadhaar.file);
    if (aadhaar.photo) fd.append('profile_photo', aadhaar.photo);
    const res = await run('aadhaar', () => safetyAPI.verifyAadhaar(fd), 'Submitted! We review IDs within 24 hours.');
    if (res) onChanged();
  };

  const addContact = async (e) => {
    e.preventDefault();
    const res = await run('contact', () => safetyAPI.addContact(newContact));
    if (res) { setContacts(res.data.contacts); setNewContact({ name: '', relationship: '', phone: '' }); setShowContactForm(false); }
  };
  const removeContact = async (id) => {
    if (!window.confirm('Remove this emergency contact?')) return;
    const res = await run('contact', () => safetyAPI.deleteContact(id));
    if (res) setContacts(res.data.contacts);
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      {msg && <div className={`alert ${msg.tone}`} role="status">{msg.text}</div>}

      <section className="card stack">
        <div className="row"><span className="icon-tile violet"><ShieldCheck size={20} /></span><div><h3>Aadhaar ID</h3><p className="muted small">Needed to host rides and activities.</p></div>
          <span className={`tag ${{ verified: 'mint', pending: 'amber', rejected: 'red' }[profile.aadhaar_status] || 'plain'}`} style={{ marginLeft: 'auto' }}>{(profile.aadhaar_status || 'unverified').toUpperCase()}</span></div>
        {profile.aadhaar_status === 'pending' && <div className="alert info"><Clock size={18} />Under review. This usually takes under 24 hours.</div>}
        {profile.aadhaar_status === 'verified' && <div className="alert success"><Check size={18} />Your identity is confirmed.</div>}
        {(profile.aadhaar_status === 'unverified' || profile.aadhaar_status === 'rejected') && (
          <form className="stack" onSubmit={submitAadhaar}>
            <ul className="muted small tips"><li>Name must match your profile exactly</li><li>Photograph the card flat, with all four corners visible</li></ul>
            <div className="field"><label htmlFor="an">Name on Aadhaar</label><input id="an" className="input" required value={aadhaar.name} onChange={(e) => setAadhaar({ ...aadhaar, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="ad">Aadhaar number (12 digits)</label><input id="ad" className="input" required inputMode="numeric" maxLength={12} placeholder="0000 0000 0000" value={aadhaar.number} onChange={(e) => setAadhaar({ ...aadhaar, number: e.target.value.replace(/\D/g, '') })} /></div>
            <div className="grid-2">
              <label className="btn"><Camera size={16} /> {aadhaar.file ? aadhaar.file.name.slice(0, 16) : 'Aadhaar photo'}<input type="file" accept="image/*" required hidden onChange={(e) => setAadhaar({ ...aadhaar, file: e.target.files[0] })} /></label>
              <label className="btn"><Camera size={16} /> {aadhaar.photo ? aadhaar.photo.name.slice(0, 16) : 'Selfie (optional)'}<input type="file" accept="image/*" hidden onChange={(e) => setAadhaar({ ...aadhaar, photo: e.target.files[0] })} /></label>
            </div>
            <button className="btn primary" disabled={busy === 'aadhaar' || aadhaar.number.length !== 12 || !aadhaar.file}>{busy === 'aadhaar' ? 'Submitting…' : 'Submit for verification'}</button>
            <p className="muted small"><Lock size={12} style={{ verticalAlign: '-1px' }} /> Only the last 4 digits are stored, for verification only.</p>
          </form>
        )}
      </section>

      <section className="card stack">
        <div className="row"><span className="icon-tile violet"><Mail size={20} /></span><div><h3>Email</h3><p className="muted small">{profile.email}</p></div>
          {profile.email_verified === 1 && <span className="tag mint" style={{ marginLeft: 'auto' }}><Check size={12} /> Secured</span>}</div>
        {profile.email_verified !== 1 && (
          <div className="stack">
            {!emailSent
              ? <button className="btn" disabled={busy === 'email'} onClick={async () => { if (await run('email', () => safetyAPI.sendEmailOTP(), 'Code sent, check your inbox.')) setEmailSent(true); }}>Send verification code</button>
              : (
                <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await run('email-v', () => safetyAPI.verifyEmailOTP({ code: emailCode }), 'Email verified!')) onChanged(); }}>
                  <input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))} required />
                  <button className="btn primary" disabled={emailCode.length !== 6}>Verify</button>
                </form>
              )}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="row"><span className="icon-tile violet"><Phone size={20} /></span><div><h3>Phone</h3><p className="muted small">{profile.phone_verified === 1 ? profile.phone_number : 'Verify by SMS code'}</p></div>
          {profile.phone_verified === 1 && <span className="tag mint" style={{ marginLeft: 'auto' }}><Check size={12} /> Secured</span>}</div>
        {profile.phone_verified !== 1 && (
          <div className="stack">
            <div className="row"><input className="input" type="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button className="btn" disabled={!phone || busy === 'phone'} onClick={async () => { if (await run('phone', () => safetyAPI.sendOTP({ phone }), (r) => r.data.message)) setPhoneSent(true); }}>Send code</button></div>
            {phoneSent && (
              <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await run('phone-v', () => safetyAPI.verifyOTP({ phone, code: phoneCode }), 'Phone verified!')) onChanged(); }}>
                <input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))} required />
                <button className="btn primary" disabled={phoneCode.length < 4}>Verify</button>
              </form>
            )}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="row between"><h3>Emergency contacts</h3>
          <button className="btn sm" onClick={() => setShowContactForm(!showContactForm)}>{showContactForm ? 'Cancel' : <><Plus size={14} /> Add</>}</button></div>
        {showContactForm && (
          <form className="stack" onSubmit={addContact}>
            <input className="input" placeholder="Full name" required value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
            <div className="grid-2">
              <input className="input" placeholder="Relationship" required value={newContact.relationship} onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })} />
              <input className="input" type="tel" placeholder="Phone number" required value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
            </div>
            <button className="btn primary" disabled={busy === 'contact'}>Save contact</button>
          </form>
        )}
        {contacts.length === 0 && !showContactForm && <p className="muted">No contacts yet. SOS alerts go to the people you add here.</p>}
        {contacts.map((c, i) => (
          <div className="row" key={c.id}>
            <span className={`avatar ${i % 2 ? 'violet' : ''}`}>{initials(c.name)}</span>
            <div className="grow"><b>{c.name}</b><div className="muted small">{c.relationship} · {c.phone_number}</div></div>
            <button className="icon-btn sm" aria-label={`Remove ${c.name}`} onClick={() => removeContact(c.id)}><Trash2 size={15} /></button>
          </div>
        ))}
      </section>

      <div className="alert info"><Info size={18} /><span><b>How SOS works.</b> Press and hold the red SOS button for 1.5 seconds (or tap it, then tap three times) to send your live location to your emergency contacts.</span></div>
      {!contactOk && <div className="muted small center">Tip: verify your email or phone to unlock trust level 2.</div>}
    </div>
  );
}

export default SafetyPanel;
