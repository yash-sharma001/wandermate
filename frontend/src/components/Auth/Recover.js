import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Users, ShieldCheck, Map } from 'lucide-react';
import { authAPI } from '../../utils/api';
import { Brand } from './Landing';
import { AuthAside } from './Login';
import './Auth.css';

const features = [
  { icon: Users, tone: 'amber', title: 'Meet travelers nearby', desc: 'See live meetups on the map and join in one tap.' },
  { icon: ShieldCheck, tone: 'pink', title: 'Travel safer', desc: 'Verified profiles, women-only events and hold-to-alert SOS.' },
  { icon: Map, tone: 'mint', title: 'Remember everything', desc: 'A private journal of every place you pinned.' },
];

// Shared page for both steps: `run` does the request and returns the success message
function Recover({ title, sub, submitLabel, run, children, valid }) {
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const problem = valid?.();
    if (problem) return setError(problem);
    setLoading(true);
    try {
      setDone(await run());
    } catch (err) {
      const d = err.response?.data;
      setError(d?.error || d?.errors?.[0]?.msg || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <AuthAside title="Your travel tribe awaits." features={features} />
      <main className="auth-main">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-top">
            <Link to="/login" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
            <Brand />
            <span style={{ width: 44 }} />
          </div>
          <h1>{title}</h1>
          <p className="sub">{done || sub}</p>
          {error && <div className="alert" role="alert"><CircleAlert size={18} />{error}</div>}
          {!done && <>
            {children}
            <button className="btn primary lg block" disabled={loading}>{loading ? 'Please wait…' : submitLabel}</button>
          </>}
          <p className="auth-foot"><Link to="/login"><b>Back to sign in</b></Link></p>
        </form>
      </main>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  return (
    <Recover title="Forgot your password?" sub="Enter your email and we'll send you a reset link." submitLabel="Send reset link"
      run={async () => (await authAPI.forgotPassword(email)).data.message}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" placeholder="you@example.com" required />
      </div>
    </Recover>
  );
}

export function ResetPassword() {
  const token = useSearchParams()[0].get('token') || '';
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const change = (e) => setPw({ ...pw, [e.target.name]: e.target.value });
  return (
    <Recover title="Choose a new password" sub="Pick something you haven't used before." submitLabel="Update password"
      valid={() => (pw.password !== pw.confirm ? 'Passwords do not match' : pw.password.length < 8 ? 'Password must be at least 8 characters' : '')}
      run={async () => (await authAPI.resetPassword(token, pw.password)).data.message}>
      {['password', 'confirm'].map((name) => (
        <div className="field" key={name}>
          <label htmlFor={name}>{name === 'password' ? 'New password' : 'Confirm'}</label>
          <input id={name} name={name} type="password" className="input" value={pw[name]} onChange={change}
            placeholder="Min 8 characters" autoComplete="new-password" required />
        </div>
      ))}
    </Recover>
  );
}
