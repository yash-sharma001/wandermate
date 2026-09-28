import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Users, ShieldCheck, Map } from 'lucide-react';
import { authAPI } from '../../utils/api';
import { Brand } from './Landing';
import './Auth.css';

export const AuthAside = ({ title, features }) => (
  <aside className="auth-aside">
    <Brand onDark />
    <h1>{title}</h1>
    {features.map(({ icon: Icon, tone, title: t, desc }) => (
      <div className="feature" key={t}>
        <span className={`icon-tile ${tone}`}><Icon size={20} /></span>
        <div><b>{t}</b><span>{desc}</span></div>
      </div>
    ))}
    <span className="dot amber" /><span className="dot violet" />
  </aside>
);

const features = [
  { icon: Users, tone: 'amber', title: 'Meet travelers nearby', desc: 'See live meetups on the map and join in one tap.' },
  { icon: ShieldCheck, tone: 'pink', title: 'Travel safer', desc: 'Verified profiles, women-only events and hold-to-alert SOS.' },
  { icon: Map, tone: 'mint', title: 'Remember everything', desc: 'A private journal of every place you pinned.' },
];

function Login({ onLogin }) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authAPI.login(formData);
      onLogin(response.data.user, response.data.token);
      const role = response.data.user.role;
      navigate(role === 'vendor' ? '/vendor/dashboard' : role === 'provider' ? '/provider/dashboard' : '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <AuthAside title="Your travel tribe awaits." features={features} />
      <main className="auth-main">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-top">
            <Link to="/welcome" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
            <Brand />
            <span style={{ width: 44 }} />
          </div>
          <h1>Welcome back</h1>
          <p className="sub">Sign in to see who's travelling near you.</p>

          {error && <div className="alert" role="alert"><CircleAlert size={18} />{error}</div>}

          <div className="field">
            <label htmlFor="email">Email or username</label>
            <input id="email" name="email" className="input" value={formData.email} onChange={handleChange}
              autoComplete="username" placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-wrap">
              <input id="password" name="password" className={`input ${error ? 'error' : ''}`}
                type={showPassword ? 'text' : 'password'} value={formData.password} onChange={handleChange}
                autoComplete="current-password" required />
              <button type="button" className="suffix" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <button className="btn primary lg block" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          <p className="auth-foot">New to WanderMates? <Link to="/register"><b>Create an account</b></Link></p>
        </form>
      </main>
    </div>
  );
}

export default Login;
