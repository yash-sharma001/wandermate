import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Map, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Search, Map as MapIcon, Crosshair, Check, ChevronLeft, MapPin, Shield, Plus, Minus } from 'lucide-react';
import { activitiesAPI } from '../../utils/api';
import { ACTIVITY_TYPES } from '../../utils/activityTypes';
import './Activities.css';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const formatAddress = (feat) => {
  const p = feat?.properties;
  if (!p) return '';
  const city = p.city || p.district || p.town || '';
  return [p.name, city && city !== p.name ? city : '', p.country && p.country !== city && p.country !== p.name ? p.country : '']
    .filter(Boolean).join(', ');
};

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function CreateActivity() {
  const navigate = useNavigate();
  const soon = new Date(Date.now() + 3600e3);
  const [form, setForm] = useState({
    title: '', description: '', activity_type: 'Cafe', latitude: 30.0869, longitude: 78.2676, location_name: '',
    date: localDate(soon), time: `${pad(soon.getHours())}:00`, capacity: 6, gender_filter: 'all',
  });
  const [locationSet, setLocationSet] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState({ latitude: 30.0869, longitude: 78.2676, zoom: 13 });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const skipSearch = useRef(false);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(''); };

  const reverse = async (lat, lng) => {
    try {
      const res = await axios.get(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
      const name = formatAddress(res.data.features?.[0]);
      if (name) { skipSearch.current = true; set({ location_name: name }); setSearch(name); }
    } catch (err) { /* geocoder is optional */ }
  };

  const useMyLocation = () => navigator.geolocation?.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    set({ latitude: +latitude.toFixed(6), longitude: +longitude.toFixed(6) });
    setView((v) => ({ ...v, latitude, longitude }));
    setLocationSet(true);
    reverse(latitude, longitude);
  });

  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return undefined; }
    if (search.length < 3) { setResults([]); return undefined; }
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`https://photon.komoot.io/api/?q=${encodeURIComponent(search)}&limit=5`);
        setResults(res.data.features || []);
      } catch (err) { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const pickPlace = (feat) => {
    const [lon, lat] = feat.geometry.coordinates;
    const name = formatAddress(feat);
    skipSearch.current = true;
    set({ location_name: name, latitude: lat, longitude: lon });
    setView((v) => ({ ...v, latitude: lat, longitude: lon }));
    setSearch(name);
    setResults([]);
    setLocationSet(true);
  };

  const onMapClick = (e) => {
    const { lat, lng } = e.lngLat;
    set({ latitude: lat, longitude: lng });
    setLocationSet(true);
    reverse(lat, lng);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!locationSet) return setError('Please pick a meeting point');
    const start = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(start.getTime()) || start <= new Date()) return setError('Start time must be in the future');
    setLoading(true);
    try {
      await activitiesAPI.create({
        title: form.title,
        description: form.description,
        activity_type: form.activity_type,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        location_name: form.location_name || search,
        start_time: start.toISOString(),
        capacity: parseInt(form.capacity, 10),
        gender_filter: form.gender_filter,
      });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create activity');
    } finally {
      setLoading(false);
    }
  };

  if (pickerOpen) {
    return (
      <div className="picker-full">
        <div className="picker-head">
          <button type="button" className="icon-btn" onClick={() => setPickerOpen(false)} aria-label="Back"><ChevronLeft size={20} /></button>
          <div className="grow"><b>Pick on map</b><div className="muted small">{locationSet ? `${(+form.latitude).toFixed(4)}, ${(+form.longitude).toFixed(4)}` : 'Tap the map to set the meeting point'}</div></div>
          <button type="button" className="btn primary" disabled={!locationSet} onClick={() => setPickerOpen(false)}><Check size={16} /> Confirm</button>
        </div>
        <div className="picker-map">
          <Map {...view} onMove={(e) => setView(e.viewState)} mapStyle={MAP_STYLE} onClick={onMapClick} style={{ width: '100%', height: '100%' }}>
            {locationSet && (
              <Marker latitude={+form.latitude} longitude={+form.longitude} anchor="bottom"><MapPin size={40} fill="var(--pink)" color="#fff" /></Marker>
            )}
          </Map>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow-wrap" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="row between" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30 }}>Host an activity</h1>
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Close"><X size={20} /></button>
      </div>

      <form className="host-form" onSubmit={submit}>
        <div className="field">
          <label>What kind of activity?</label>
          <div className="type-grid">
            {ACTIVITY_TYPES.map(({ value, label, icon: Icon }) => (
              <button type="button" key={value} className={`type-card ${form.activity_type === value ? 'active' : ''}`} onClick={() => set({ activity_type: value })}>
                <Icon size={22} />{label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="row between"><label htmlFor="title">Title</label><span className="muted small">{form.title.length} / 60</span></div>
          <input id="title" className="input" value={form.title} maxLength={60} minLength={3} required placeholder="Sunrise hike to Kunjapuri Temple" onChange={(e) => set({ title: e.target.value })} />
        </div>

        <div className="field">
          <label htmlFor="place">Meeting point</label>
          <div className="input-icon">
            <Search size={18} />
            <input id="place" className="input" value={search} autoComplete="off" placeholder="Search for a place…" onChange={(e) => { setSearch(e.target.value); setLocationSet(false); }} />
          </div>
          {results.length > 0 && (
            <div className="place-results">
              {results.map((f, i) => (
                <button type="button" key={i} onClick={() => pickPlace(f)}><b>{f.properties.name}</b> <span className="muted">{[f.properties.city, f.properties.country].filter(Boolean).join(', ')}</span></button>
              ))}
            </div>
          )}
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => setPickerOpen(true)}><MapIcon size={16} /> Pick on map</button>
            <button type="button" className="btn" onClick={useMyLocation}><Crosshair size={16} /> Use my location</button>
          </div>
          {locationSet && <span className="small" style={{ color: 'var(--violet)', fontWeight: 700 }}><Check size={14} style={{ verticalAlign: '-2px' }} /> Location set on the map</span>}
        </div>

        <div className="grid-2">
          <div className="field"><label htmlFor="date">Date</label><input id="date" type="date" className="input" min={localDate(new Date())} value={form.date} required onChange={(e) => set({ date: e.target.value })} /></div>
          <div className="field"><label htmlFor="time">Start time</label><input id="time" type="time" className="input" value={form.time} required onChange={(e) => set({ time: e.target.value })} /></div>
        </div>

        <div className="row between">
          <div><b>Group size</b><div className="muted small">Including you</div></div>
          <div className="stepper">
            <button type="button" onClick={() => set({ capacity: Math.max(2, form.capacity - 1) })} aria-label="Fewer"><Minus size={16} /></button>
            <b>{form.capacity}</b>
            <button type="button" className="plus" onClick={() => set({ capacity: Math.min(50, form.capacity + 1) })} aria-label="More"><Plus size={16} /></button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="desc">Description</label>
          <textarea id="desc" className="textarea" value={form.description} placeholder="Tell people what to expect…" onChange={(e) => set({ description: e.target.value })} />
        </div>

        <div className="card toggle-row">
          <span className="icon-tile pink"><Shield size={20} /></span>
          <div className="grow"><b>Women-only event</b><div className="muted small">Only verified women travelers can see and join.</div></div>
          <button type="button" role="switch" aria-checked={form.gender_filter === 'female'} aria-label="Women-only event"
            className={`toggle ${form.gender_filter === 'female' ? 'on' : ''}`}
            onClick={() => set({ gender_filter: form.gender_filter === 'female' ? 'all' : 'female' })} />
        </div>

        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn primary lg block" disabled={loading}>{loading ? 'Publishing…' : 'Publish activity'}</button>
      </form>
    </div>
  );
}

export default CreateActivity;
