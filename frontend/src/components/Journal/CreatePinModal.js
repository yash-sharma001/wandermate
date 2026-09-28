import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon, MapPin, Navigation } from 'lucide-react';
import { pinsAPI } from '../../utils/api';
import { MOODS } from '../../utils/moods';
import './TravelJournal.css';

const pad = (n) => String(n).padStart(2, '0');
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const formatAddress = (feat) => {
  const p = feat?.properties;
  if (!p) return '';
  const city = p.city || p.district || p.town || '';
  return [p.name, city && city !== p.name ? city : '', p.country && p.country !== city && p.country !== p.name ? p.country : '']
    .filter(Boolean).join(', ');
};

function CreatePinModal({ onClose, onSuccess, initialLocation }) {
  const [form, setForm] = useState({
    title: '', note: '', location_name: '', mood_emoji: 'pin', visit_date: nowLocal(),
    latitude: initialLocation?.lat ?? '', longitude: initialLocation?.lng ?? '',
  });
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(''); };

  const locate = () => {
    if (!navigator.geolocation) return setError('Geolocation is not supported by this browser.');
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        set({ latitude, longitude });
        try {
          const feat = (await (await fetch(`https://photon.komoot.io/reverse?lon=${longitude}&lat=${latitude}`)).json()).features?.[0];
          const name = formatAddress(feat);
          if (name) set({ location_name: name });
        } catch (e) { /* the name can be typed */ }
      },
      () => setError('Could not get your location.')
    );
  };

  // Pinned from the map: prefill the place name; from the journal: use where the user is
  useEffect(() => {
    if (initialLocation) {
      (async () => {
        try {
          const feat = (await (await fetch(`https://photon.komoot.io/reverse?lon=${initialLocation.lng}&lat=${initialLocation.lat}`)).json()).features?.[0];
          const name = formatAddress(feat);
          if (name) setForm((f) => ({ ...f, location_name: f.location_name || name }));
        } catch (e) { /* optional */ }
      })();
    }
  }, [initialLocation]);

  const addImages = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + images.length > 5) return setError('You can add up to 5 photos per memory.');
    setImages([...images, ...files]);
    setPreviews([...previews, ...files.map((f) => URL.createObjectURL(f))]);
  };
  const removeImage = (i) => {
    URL.revokeObjectURL(previews[i]);
    setImages(images.filter((_, j) => j !== i));
    setPreviews(previews.filter((_, j) => j !== i));
  };
  const close = () => { previews.forEach((u) => URL.revokeObjectURL(u)); onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (form.latitude === '' || form.longitude === '') return setError('Set a location first: use “Use my location”, or drop a pin on the map.');
    setSubmitting(true);
    try {
      const data = new FormData();
      ['title', 'note', 'location_name', 'latitude', 'longitude', 'mood_emoji'].forEach((k) => data.append(k, form[k] ?? ''));
      data.append('visit_date', new Date(form.visit_date).toISOString());
      images.forEach((img) => data.append('images', img));
      await pinsAPI.create(data);
      onSuccess?.();
      close();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const located = form.latitude !== '' && form.longitude !== '';

  return (
    <div className="overlay sheet-bottom" onClick={close}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head"><h2>Capture a memory</h2><button type="button" className="icon-btn sm" onClick={close} aria-label="Close"><X size={16} /></button></div>

        <div className="row between card flat" style={{ padding: 12 }}>
          <span className="row"><MapPin size={16} color="var(--pink)" /> <b>{located ? `${(+form.latitude).toFixed(4)}, ${(+form.longitude).toFixed(4)}` : 'No location yet'}</b></span>
          <button type="button" className="btn sm" onClick={locate}><Navigation size={14} /> Use my location</button>
        </div>

        <div className="field">
          <label>Photos <span className="muted small">(up to 5)</span></label>
          <div className="photo-row">
            <label className="add-photo"><input type="file" multiple accept="image/*" onChange={addImages} hidden /><ImageIcon size={22} /><small>Add</small></label>
            {previews.map((src, i) => (
              <div className="thumb" key={src}><img src={src} alt="" /><button type="button" onClick={() => removeImage(i)} aria-label="Remove photo"><X size={12} /></button></div>
            ))}
          </div>
        </div>

        <div className="field"><label htmlFor="pt">Title</label><input id="pt" className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Evening aarti at Triveni Ghat" /></div>
        <div className="field"><label htmlFor="pl">Place *</label><input id="pl" className="input" required value={form.location_name} onChange={(e) => set({ location_name: e.target.value })} placeholder="Where was this?" /></div>
        <div className="field"><label htmlFor="pd">When *</label><input id="pd" type="datetime-local" className="input" required value={form.visit_date} onChange={(e) => set({ visit_date: e.target.value })} /></div>
        <div className="field">
          <div className="row between"><label htmlFor="pn">The story</label><span className="muted small">{form.note.length}/500</span></div>
          <textarea id="pn" className="textarea" maxLength={500} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Write something you want to remember…" />
        </div>
        <div className="field"><label>What was it like?</label>
          <div className="mood-grid">
            {MOODS.map(({ key, label, icon: Icon }) => (
              <button type="button" key={key} className={`mood ${form.mood_emoji === key ? 'active' : ''}`} onClick={() => set({ mood_emoji: key })}><Icon size={20} /><span>{label}</span></button>
            ))}
          </div>
        </div>

        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn primary lg block" disabled={submitting}>{submitting ? 'Saving…' : 'Save memory'}</button>
      </form>
    </div>
  );
}

export default CreatePinModal;
