import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MapGL, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Lock, Maximize2, Plus, MapPin, Trash2, Navigation } from 'lucide-react';
import { pinsAPI } from '../../utils/api';
import CreatePinModal from './CreatePinModal';
import { MoodIcon, moodOf } from '../../utils/moods';
import './TravelJournal.css';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const TINTS = ['pink', 'peach', 'mint', 'sky'];
const asList = (v) => (Array.isArray(v) ? v : []);

function TravelJournal() {
  const navigate = useNavigate();
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState(null); // { name, lat, lng } when filtering to the current area
  const [nearOnly, setNearOnly] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [here, setHere] = useState(null);

  const fetchPins = async (lat, lng, radius) => {
    try {
      setLoading(true);
      setPins((await pinsAPI.getAll(lat, lng, radius)).data.pins || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Try to scope to where the user is; fall back to every memory
  useEffect(() => {
    if (!nearOnly) return void fetchPins();
    if (!navigator.geolocation) { setNearOnly(false); return undefined; }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        setHere({ lat: latitude, lng: longitude });
        let name = 'Nearby';
        try {
          const feat = (await (await fetch(`https://photon.komoot.io/reverse?lon=${longitude}&lat=${latitude}`)).json()).features?.[0];
          if (feat) name = feat.properties.city || feat.properties.town || feat.properties.district || feat.properties.name || name;
        } catch (e) { /* label only */ }
        setArea({ name, lat: latitude, lng: longitude });
        fetchPins(latitude, longitude, 50000);
      },
      () => setNearOnly(false)
    );
    return undefined;
  }, [nearOnly]);

  const remove = async (id) => {
    if (!window.confirm('Delete this memory?')) return;
    try { await pinsAPI.delete(id); setPins((p) => p.filter((x) => x.id !== id)); } catch (err) { alert('Failed to delete'); }
  };

  const groups = useMemo(() => {
    const byDay = new Map();
    pins.forEach((p) => {
      const key = new Date(p.visit_date).toDateString();
      byDay.set(key, [...(byDay.get(key) || []), p]);
    });
    return [...byDay.entries()];
  }, [pins]);

  const center = pins[0] ? { latitude: +pins[0].latitude, longitude: +pins[0].longitude } : area ? { latitude: area.lat, longitude: area.lng } : { latitude: 30.0869, longitude: 78.2676 };

  return (
    <div className="journal">
      <div className="page-head">
        <div><h1>Journal</h1><p>Your memories, on the map.</p></div>
        <span className="tag plain"><Lock size={13} /> Only you</span>
      </div>

      <div className="card mini-map">
        <MapGL key={`${center.latitude},${center.longitude}`} initialViewState={{ ...center, zoom: 11 }} mapStyle={MAP_STYLE} attributionControl={false} interactive={false} style={{ width: '100%', height: '100%' }}>
          {pins.map((p) => <Marker key={p.id} latitude={+p.latitude} longitude={+p.longitude}><div className="memory-dot" /></Marker>)}
        </MapGL>
        <button className="btn sm full" onClick={() => navigate('/')}><Maximize2 size={14} /> Full map</button>
      </div>

      <div className="chips" style={{ margin: '16px 0 22px' }}>
        <button className={`chip ${nearOnly ? 'active' : ''}`} onClick={() => setNearOnly(true)}><Navigation size={13} style={{ verticalAlign: '-2px' }} /> {area?.name || 'Nearby'}</button>
        <button className={`chip ${!nearOnly ? 'active' : ''}`} onClick={() => setNearOnly(false)}>All places</button>
      </div>

      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : pins.length === 0 ? <div className="card empty"><h3>No memories here yet</h3><p>Drop a pin on the map or capture one below.</p></div>
        : (
          <div className="timeline">
            {groups.map(([day, list]) => {
              const d = new Date(day);
              return (
                <div className="day-group" key={day}>
                  <div className="date"><small>{d.toLocaleDateString([], { month: 'short' }).toUpperCase()}</small><b>{d.getDate()}</b></div>
                  <div className="stack grow">
                    {list.map((p) => {
                      const photos = asList(p.photos);
                      return (
                        <article className="card memory" key={p.id}>
                          {photos.length > 0 && (
                            <div className={`shots n${Math.min(photos.length, 2)}`}>
                              {photos.slice(0, 2).map((src, i) => (
                                <div key={src} className={`ph ${TINTS[(p.id + i) % TINTS.length]}`}>
                                  <img src={src} alt="" />
                                  {i === 1 && photos.length > 2 && <span className="more">+{photos.length - 2}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="row between" style={{ alignItems: 'flex-start' }}>
                            <h3>{p.title || 'Untitled memory'}</h3>
                            <div className="row" style={{ gap: 8 }}>
                              {p.mood_emoji && <span className="tag pink"><MoodIcon mood={p.mood_emoji} size={13} /> {moodOf(p.mood_emoji)?.label}</span>}
                              <button className="icon-btn sm" onClick={() => remove(p.id)} aria-label="Delete memory"><Trash2 size={14} /></button>
                            </div>
                          </div>
                          <p className="muted small"><MapPin size={12} style={{ verticalAlign: '-1px' }} /> {p.location_name || 'Somewhere'} · {new Date(p.visit_date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                          {p.note && <p className="note">{p.note}</p>}
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <button className="btn dark lg capture" onClick={() => setShowCreate(true)}><Plus size={18} /> Capture a memory</button>
      {showCreate && <CreatePinModal initialLocation={here} onClose={() => setShowCreate(false)} onSuccess={() => (nearOnly && area ? fetchPins(area.lat, area.lng, 50000) : fetchPins())} />}
    </div>
  );
}

export default TravelJournal;

