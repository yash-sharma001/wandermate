import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { aiAPI } from '../../utils/api';

const BUDGETS = [
  { value: 'low', label: 'Budget' },
  { value: 'mid', label: 'Comfortable' },
  { value: 'high', label: 'Splurge' },
];

function Itinerary() {
  const [form, setForm] = useState({ destination: '', days: 3, budget: 'mid', interests: '' });
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const interests = form.interests.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
      const res = await aiAPI.itinerary({ destination: form.destination, days: Number(form.days), budget: form.budget, interests });
      setPlan(res.data);
    } catch (err) {
      const d = err.response?.data;
      setError(d?.error || d?.errors?.[0]?.msg || 'Could not build an itinerary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="narrow-wrap" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="row" style={{ gap: 12, marginBottom: 18 }}>
        <Link to="/packages" className="icon-btn" aria-label="Back"><ChevronLeft size={20} /></Link>
        <div><h1 style={{ fontSize: 30 }}>Plan a trip</h1><p className="muted">Tell us where and what you like; we'll sketch the days.</p></div>
      </div>

      <form className="host-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="destination">Destination</label>
          <input id="destination" className="input" value={form.destination} required minLength={2} maxLength={100}
            placeholder="Goa" onChange={(e) => set({ destination: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="days">Days</label>
            <input id="days" type="number" className="input" min={1} max={14} value={form.days} required onChange={(e) => set({ days: e.target.value })} />
          </div>
          <div className="field">
            <label>Budget</label>
            <div className="choice-grid three">
              {BUDGETS.map(({ value, label }) => (
                <button type="button" key={value} className={`choice ${form.budget === value ? 'active' : ''}`} onClick={() => set({ budget: value })}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="interests">Interests <span className="muted small">(comma separated, optional)</span></label>
          <input id="interests" className="input" value={form.interests} placeholder="beaches, street food, hiking" onChange={(e) => set({ interests: e.target.value })} />
        </div>

        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn primary lg block" disabled={loading}><Sparkles size={18} /> {loading ? 'Planning…' : 'Build itinerary'}</button>
      </form>

      {plan && (
        <section style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>{plan.destination}: {plan.days.length} day{plan.days.length > 1 ? 's' : ''}</h2>
          <p className="muted small">
            {plan.matches
              ? `Built from ${plan.matches} matching activit${plan.matches > 1 ? 'ies and trips' : 'y or trip'} already on WanderMates. Smarter day-by-day writing arrives when a language model is connected.`
              : 'Nothing on WanderMates matches this destination yet. Try a broader place or different interests.'}
          </p>
          {plan.days.map((d) => (
            <div className="card" key={d.day}>
              <h3 style={{ marginBottom: 8 }}>Day {d.day}</h3>
              {d.activities.map((a) => (
                <div className="row" style={{ gap: 12, padding: '4px 0', alignItems: 'baseline' }} key={a.time}>
                  <b style={{ minWidth: 90 }}>{a.time}</b>
                  {a.kind === 'free' ? <span className="muted">{a.title}</span> : (
                    <span>
                      <Link to={a.kind === 'activity' ? `/activity/${a.ref_id}` : '/packages'}>{a.title}</Link>
                      <span className="muted small" style={{ display: 'block' }}>
                        {a.kind === 'package' ? 'Trip' : 'Meetup'}{a.place ? ` · ${a.place}` : ''}{a.when ? ` · ${new Date(a.when).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
                      </span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default Itinerary;
