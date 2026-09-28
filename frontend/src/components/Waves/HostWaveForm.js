import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { wavesAPI } from '../../utils/api';

const pad = (n) => String(n).padStart(2, '0');

function HostWaveForm({ onSuccess, user }) {
  const [form, setForm] = useState({
    origin_name: '', destination_name: '', date: '', time: '', capacity: 4, price_per_seat: '', description: '', car_model: '', car_number: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const verified = user?.aadhaar_status === 'verified' && (user?.phone_verified === 1 || user?.email_verified === 1);
  const set = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const departure = new Date(`${form.date}T${form.time}`);
      if (departure <= new Date()) throw Object.assign(new Error(), { response: { data: { error: 'Departure must be in the future' } } });
      await wavesAPI.create({
        origin_name: form.origin_name,
        destination_name: form.destination_name,
        departure_time: departure.toISOString(),
        capacity: parseInt(form.capacity, 10) || 1,
        price_per_seat: parseFloat(form.price_per_seat) || 0,
        description: form.description,
        car_model: form.car_model,
        car_number: form.car_number,
        // ponytail: fixed coordinates until the form gets a place picker (only names are searched today)
        origin_latitude: 30.1, origin_longitude: 78.3, destination_latitude: 28.6, destination_longitude: 77.2,
      });
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create wave.');
    } finally {
      setLoading(false);
    }
  };

  const price = parseFloat(form.price_per_seat) || 0;
  const field = (name, label, props = {}) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" value={form[name]} onChange={set} disabled={!verified} required {...props} />
    </div>
  );

  return (
    <form className="card stack host-wave" onSubmit={submit}>
      <h2>Host a wave</h2>
      {!verified && (
        <div className="alert"><Lock size={18} /><span><b>Verification required.</b> Verify your Aadhaar ID and a phone or email in your <Link to="/profile">profile</Link> to host rides.</span></div>
      )}
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="grid-2">
        {field('origin_name', 'Leaving from', { placeholder: 'Tapovan, Rishikesh' })}
        {field('destination_name', 'Going to', { placeholder: 'Jolly Grant Airport' })}
      </div>
      <div className="grid-2">
        {field('date', 'Date', { type: 'date', min: `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}` })}
        {field('time', 'Departure time', { type: 'time' })}
      </div>
      <div className="grid-2">
        {field('car_model', 'Car model', { placeholder: 'Swift Dzire' })}
        {field('car_number', 'Car number', { placeholder: 'UK07 AB 1234' })}
      </div>
      <div className="grid-2">
        {field('capacity', 'Seats (incl. you)', { type: 'number', min: 1, max: 8 })}
        {field('price_per_seat', 'Price per seat (₹, you earn)', { type: 'number', min: 0, step: '1', placeholder: '450' })}
      </div>
      {price > 0 && <p className="muted small">Passengers pay <b>₹{(price * 1.1).toFixed(0)}</b> per seat including the 10% service fee.</p>}
      <div className="field">
        <label htmlFor="description">Notes</label>
        <textarea id="description" name="description" className="textarea" value={form.description} onChange={set} disabled={!verified} placeholder="Luggage space, music, stops…" />
      </div>
      <button className="btn primary lg block" disabled={loading || !verified}>{loading ? 'Publishing…' : 'Publish wave'}</button>
    </form>
  );
}

export default HostWaveForm;
