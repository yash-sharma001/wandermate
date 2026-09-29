import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Users, ShieldCheck, Map, Backpack, Store, Plane } from 'lucide-react';
import { authAPI } from '../../utils/api';
import { Brand } from './Landing';
import { AuthAside } from './Login';
import './Auth.css';

const features = [
  { icon: Users, tone: 'amber', title: 'Find your tribe', desc: 'Connect with travelers who share your vibe.' },
  { icon: ShieldCheck, tone: 'pink', title: 'Verified & safe', desc: 'ID verification, women-only events and SOS.' },
  { icon: Map, tone: 'mint', title: 'Live map', desc: "See what's happening near you, right now." },
];

const genders = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Private' },
];

const roles = [
  { value: 'traveler', icon: Backpack, label: 'Traveler', desc: 'Explore and connect with others' },
  { value: 'vendor', icon: Store, label: 'Vendor', desc: 'Offer local experiences and deals' },
  { value: 'provider', icon: Plane, label: 'Trip operator', desc: 'Sell curated multi-day trips' },
];

function Register({ onLogin }) {
  const [formData, setFormData] = useState({
    email: '', password: '', confirmPassword: '', full_name: '', username: '', gender: '', role: 'traveler',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (formData.password !== formData.confirmPassword) return setError('Passwords do not match');
    if (formData.password.length < 8) return setError('Password must be at least 8 characters');

    setLoading(true);
    try {
      const { confirmPassword, ...registerData } = formData;
      if (!registerData.gender) delete registerData.gender;
      const response = await authAPI.register(registerData);
      onLogin(response.data.user, response.data.token);
      const role = response.data.user.role;
      navigate(role === 'vendor' ? '/vendor/dashboard' : role === 'provider' ? '/provider/dashboard' : '/');
    } catch (err) {
      const d = err.response?.data;
      setError(d?.error || d?.errors?.[0]?.msg || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const input = (name, label, props = {}) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" value={formData[name]} onChange={handleChange} required {...props} />
    </div>
  );

  return (
    <div className="auth">
      <AuthAside title="Your next adventure starts here." features={features} />
      <main className="auth-main">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-top">
            <Link to="/welcome" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
            <Brand />
            <span style={{ width: 44 }} />
          </div>
          <h1>Create your account</h1>
          <p className="sub">Free forever. We'll email you a code to verify your address.</p>

          {error && <div className="alert" role="alert"><CircleAlert size={18} />{error}</div>}

          <div className="field">
            <label>I am a…</label>
            <div className="choice-grid three">
              {roles.map(({ value, icon: Icon, label, desc }) => (
                <button type="button" key={value} className={`choice role-choice ${formData.role === value ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, role: value })}>
                  <span className="icon-tile violet"><Icon size={20} /></span>
                  <span><b>{label}</b><span>{desc}</span></span>
                </button>
              ))}
            </div>
          </div>

          {input('full_name', 'Full name', { placeholder: 'Sarah Collins', autoComplete: 'name' })}
          {input('username', 'Username', { placeholder: 'sarah_wanders', autoComplete: 'username' })}
          {input('email', 'Email', { type: 'email', placeholder: 'you@example.com', autoComplete: 'email' })}

          <div className="field">
            <label>Gender <span className="muted small">(used for women-only meetups)</span></label>
            <div className="choice-grid">
              {genders.map((g) => (
                <button type="button" key={g.value} className={`choice ${formData.gender === g.value ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, gender: g.value })}>{g.label}</button>
              ))}
            </div>
          </div>

          <div className="grid-2">
            {input('password', 'Password', { type: 'password', placeholder: 'Min 8 characters', autoComplete: 'new-password' })}
            {input('confirmPassword', 'Confirm', { type: 'password', placeholder: 'Repeat password', autoComplete: 'new-password' })}
          </div>

          <button className="btn primary lg block" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
          <p className="auth-foot">Already have an account? <Link to="/login"><b>Sign in</b></Link></p>
        </form>
      </main>
    </div>
  );
}

export default Register;
