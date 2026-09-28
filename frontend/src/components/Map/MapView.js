import React, { useState, useEffect, useRef, useMemo } from 'react';
import Map, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, X, Plus, Minus, Crosshair, MapPin, Clock, Users, ShieldCheck, List, Shield, Target } from 'lucide-react';
import { activitiesAPI, pinsAPI } from '../../utils/api';
import { ACTIVITY_TYPES, typeIcon, typeLabel, formatWhen, initials } from '../../utils/activityTypes';
import CreatePinModal from '../Journal/CreatePinModal';
import './MapView.css';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const RADIUS_KM = 50;

const formatAddress = (feat) => {
  const p = feat?.properties;
  if (!p) return '';
  const city = p.city || p.district || p.town || '';
  return [p.name, city && city !== p.name ? city : '', p.country && p.country !== city && p.country !== p.name ? p.country : '']
    .filter(Boolean).join(', ');
};

const km = (lat1, lon1, lat2, lon2) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const ActivityTags = ({ a }) => (
  <>
    <span className="tag">{React.createElement(typeIcon(a.activity_type), { size: 13 })} {typeLabel(a.activity_type)}</span>
    {a.gender_filter === 'female' && <span className="tag pink"><Shield size={12} /> Women-only</span>}
  </>
);

function MapView({ onLocationChange }) {
  const [viewState, setViewState] = useState({ latitude: 30.0869, longitude: 78.2676, zoom: 13 });
  const [activities, setActivities] = useState([]);
  const [pins, setPins] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [category, setCategory] = useState('All');
  const [locationName, setLocationName] = useState('Locating…');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pinning, setPinning] = useState(false);
  const [pinLocation, setPinLocation] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showList, setShowList] = useState(false);

  const mapRef = useRef();
  const navigate = useNavigate();
  const lastFetch = useRef({ lat: 0, lng: 0, at: 0 });

  const fetchData = async (lat, lng, force) => {
    if (!force && km(lat, lng, lastFetch.current.lat, lastFetch.current.lng) < 5 && Date.now() - lastFetch.current.at < 60000) return;
    lastFetch.current = { lat, lng, at: Date.now() };
    try {
      const [a, p] = await Promise.all([
        activitiesAPI.getNearby(lat, lng, RADIUS_KM * 1000),
        pinsAPI.getAll(lat, lng, RADIUS_KM * 1000),
      ]);
      setActivities(a.data.activities || []);
      setPins(p.data.pins || []);
    } catch (err) {
      console.error('Error fetching map data:', err);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchData(viewState.latitude, viewState.longitude), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.latitude, viewState.longitude]);

  const reverseGeocode = async (lat, lon) => {
    try {
      const res = await axios.get(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`);
      const feat = res.data.features?.[0];
      if (feat) setLocationName(formatAddress(feat));
    } catch (err) { /* offline geocoder is optional */ }
  };

  const goTo = (lat, lng, zoom = 14, duration = 1500) => {
    setViewState({ latitude: lat, longitude: lng, zoom });
    mapRef.current?.getMap().flyTo({ center: [lng, lat], zoom, duration });
  };

  const recenter = () => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      goTo(latitude, longitude);
      onLocationChange?.({ lat: latitude, lng: longitude });
      reverseGeocode(latitude, longitude);
    });
  };

  useEffect(() => {
    if (!navigator.geolocation) return setLocationName('Rishikesh');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setViewState({ latitude, longitude, zoom: 13 });
        onLocationChange?.({ lat: latitude, lng: longitude });
        reverseGeocode(latitude, longitude);
      },
      () => setLocationName('Rishikesh')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchTerm.length < 3) return setSearchResults([]);
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`https://photon.komoot.io/api/?q=${encodeURIComponent(searchTerm)}&limit=5`);
        setSearchResults(res.data.features || []);
      } catch (err) { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const pickPlace = (feat) => {
    const [lon, lat] = feat.geometry.coordinates;
    goTo(lat, lon, 14, 2000);
    onLocationChange?.({ lat, lng: lon });
    setLocationName(formatAddress(feat));
    setSearchTerm('');
    setSearchResults([]);
  };

  const visible = useMemo(
    () => activities.filter((a) => category === 'All' || a.activity_type === category),
    [activities, category]
  );

  // lets the phone SOS button lift above the bottom sheet
  useEffect(() => {
    document.body.classList.toggle('has-sheet', !!(selected || selectedPin));
    return () => document.body.classList.remove('has-sheet');
  }, [selected, selectedPin]);

  const select = (a) => {
    setSelected(a);
    setSelectedPin(null);
    setShowList(false);
    goTo(parseFloat(a.latitude), parseFloat(a.longitude), 15, 800);
  };

  const searchBox = (
    <div className="search-wrap">
      <div className="input-icon">
        <Search size={18} />
        <input className="input" placeholder="Where to next?" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>
      {searchResults.length > 0 && (
        <div className="card results">
          {searchResults.map((f, i) => (
            <button key={i} onClick={() => pickPlace(f)}>
              <MapPin size={16} />
              <span><b>{f.properties.name}</b><small>{[f.properties.city, f.properties.state, f.properties.country].filter(Boolean).join(', ')}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const chips = (
    <div className="chips">
      {['All', ...ACTIVITY_TYPES.map((t) => t.value)].map((c) => (
        <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
          {c === 'All' ? 'All' : typeLabel(c)}
        </button>
      ))}
    </div>
  );

  const list = (
    <div className="stack">
      {visible.length === 0 && <div className="empty"><h3>No meetups here yet</h3><p>Be the first, host one for this area.</p></div>}
      {visible.map((a) => {
        const Icon = typeIcon(a.activity_type);
        return (
          <button key={a.id} className={`card hover meetup ${selected?.id === a.id ? 'selected' : ''}`} onClick={() => select(a)}>
            <span className={`icon-tile ${selected?.id === a.id ? 'primary' : 'violet'}`}><Icon size={22} /></span>
            <span className="grow">
              <b>{a.title}</b>
              <span className="meta"><Clock size={13} /> {formatWhen(a.start_time)} <Users size={13} /> {a.current_attendees}/{a.capacity} going</span>
              <span className="row wrap" style={{ gap: 6, marginTop: 8 }}><ActivityTags a={a} /></span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const detail = selected && (
    <div className="card popup">
      <button className="icon-btn sm close" onClick={() => setSelected(null)} aria-label="Close"><X size={16} /></button>
      <div className="row wrap" style={{ gap: 6 }}><ActivityTags a={selected} />{selected.distance_meters != null && <span className="muted small grow right">{(selected.distance_meters / 1000).toFixed(1)} km</span>}</div>
      <h2>{selected.title}</h2>
      <p className="meta"><Clock size={14} /> {formatWhen(selected.start_time)} <Users size={14} /> {selected.current_attendees} of {selected.capacity} going</p>
      <div className="row">
        <span className="avatar">{initials(selected.host_name)}</span>
        <div className="grow"><b>{selected.host_name}</b>
          {selected.host_verification === 'verified' && <div className="tag violet" style={{ background: 'none', padding: 0 }}><ShieldCheck size={13} /> ID verified host</div>}
        </div>
      </div>
      <button className="btn primary block" onClick={() => navigate(`/activity/${selected.id}`)}>View details</button>
    </div>
  );

  const pinDetail = selectedPin && (
    <div className="card popup">
      <button className="icon-btn sm close" onClick={() => setSelectedPin(null)} aria-label="Close"><X size={16} /></button>
      <span className="tag pink"><Target size={12} /> Your memory</span>
      <h2>{selectedPin.title || 'Personal memory'}</h2>
      <p className="muted">{selectedPin.location_name} · {new Date(selectedPin.visit_date).toLocaleDateString()}</p>
      {selectedPin.note && <p>{selectedPin.note}</p>}
      <button className="btn dark block" onClick={() => navigate('/journal')}>Open in Journal</button>
    </div>
  );

  return (
    <div className="explore">
      {/* Desktop list panel */}
      <aside className="panel">
        <h1>Nearby meetups</h1>
        <p className="muted"><MapPin size={13} style={{ verticalAlign: '-2px' }} /> {locationName} · {activities.length} this week</p>
        {searchBox}
        {chips}
        {list}
      </aside>

      <div className="map-area">
        {/* Mobile search + chips overlay */}
        <div className="mobile-top">
          {searchBox}
          <div className="chips-row"><span className="chip active loc"><MapPin size={14} /> {locationName.split(',')[0]}</span>{chips}</div>
        </div>

        {pinning && <div className="pin-banner">Tap the map to drop a pin <button onClick={() => setPinning(false)}>Cancel</button></div>}

        <Map
          {...viewState}
          ref={mapRef}
          onMove={(e) => setViewState(e.viewState)}
          mapStyle={MAP_STYLE}
          attributionControl={false}
          style={{ width: '100%', height: '100%', cursor: pinning ? 'crosshair' : 'grab' }}
          onClick={(e) => {
            if (!pinning) return;
            setPinLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            setShowPinModal(true);
            setPinning(false);
          }}
        >
          {visible.map((a) => {
            const Icon = typeIcon(a.activity_type);
            return (
              <Marker key={a.id} latitude={parseFloat(a.latitude)} longitude={parseFloat(a.longitude)} anchor="bottom"
                onClick={(e) => { e.originalEvent.stopPropagation(); select(a); }}>
                <div className={`marker ${selected?.id === a.id ? 'on' : ''}`}><Icon size={22} /></div>
              </Marker>
            );
          })}
          {pins.map((p) => (
            <Marker key={`pin-${p.id}`} latitude={parseFloat(p.latitude)} longitude={parseFloat(p.longitude)}
              onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedPin(p); setSelected(null); }}>
              <div className="memory-dot" title={p.title || 'Memory'} />
            </Marker>
          ))}
        </Map>

        <div className="map-controls">
          <button className="icon-btn" onClick={() => mapRef.current?.getMap().zoomIn()} aria-label="Zoom in"><Plus size={18} /></button>
          <button className="icon-btn" onClick={() => mapRef.current?.getMap().zoomOut()} aria-label="Zoom out"><Minus size={18} /></button>
          <button className="icon-btn" onClick={recenter} aria-label="My location" style={{ color: 'var(--violet)' }}><Crosshair size={18} /></button>
          <button className="icon-btn show-mobile" onClick={() => setShowList(true)} aria-label="List"><List size={18} /></button>
        </div>

        <div className="map-actions">
          <button className="btn amber lg hide-mobile" onClick={() => navigate('/create-activity')}><Plus size={18} /> Host an activity</button>
          <button className="btn dark lg show-mobile" onClick={() => navigate('/create-activity')}><Plus size={18} /> Host</button>
          <button className="btn lg" style={{ color: 'var(--pink)' }} onClick={() => { setPinning(true); setSelected(null); }}><MapPin size={18} /> Drop a pin</button>
        </div>

        <div className="legend hide-mobile">
          <span><i style={{ background: 'var(--violet)' }} /> Meetups</span>
          <span><i className="ring" /> Your memories</span>
        </div>

        {(detail || pinDetail) && <div className="popup-slot">{detail || pinDetail}</div>}

        {showList && (
          <div className="overlay list-sheet" onClick={() => setShowList(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head"><h2>Nearby meetups</h2><button className="icon-btn sm" onClick={() => setShowList(false)}><X size={16} /></button></div>
              {list}
            </div>
          </div>
        )}
      </div>

      {showPinModal && (
        <CreatePinModal
          onClose={() => setShowPinModal(false)}
          onSuccess={() => fetchData(viewState.latitude, viewState.longitude, true)}
          initialLocation={pinLocation}
        />
      )}
    </div>
  );
}

export default MapView;
