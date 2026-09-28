import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, X, Users, ChevronRight } from 'lucide-react';
import { groupsAPI } from '../../utils/api';
import { initials } from '../../utils/activityTypes';
import { money } from '../../utils/money';
import './Groups.css';

export const BalanceTag = ({ value }) => {
  if (Math.abs(value) < 0.005) return <span className="tag plain">All settled</span>;
  return value > 0
    ? <span className="tag mint">You're owed {money(value)}</span>
    : <span className="tag pink">You owe {money(value)}</span>;
};

export const Avatars = ({ members, max = 4 }) => (
  <span className="avatar-stack">
    {members.slice(0, max).map((m, i) => (
      m.profile_photo
        ? <img key={m.user_id} className="avatar sm" src={m.profile_photo} alt="" />
        : <span key={m.user_id} className={`avatar sm ${['', 'violet', 'amber', 'mint'][i % 4]}`} title={m.full_name}>{initials(m.full_name)}</span>
    ))}
    {members.length > max && <span className="avatar sm more">+{members.length - max}</span>}
  </span>
);

function NewGroupModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', members: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await groupsAPI.create(form);
      onCreated(res.data.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the group');
      setSaving(false);
    }
  };

  return (
    <div className="overlay sheet-bottom" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head"><h2>New group</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="field"><label htmlFor="gn">Group name</label><input id="gn" className="input" required minLength={2} maxLength={80} value={form.name} onChange={set('name')} placeholder="Kedarnath trek crew" /></div>
        <div className="field"><label htmlFor="gd">What's the plan? <span className="muted small">(optional)</span></label><input id="gd" className="input" value={form.description} onChange={set('description')} placeholder="5 days, 6 friends" /></div>
        <div className="field">
          <label htmlFor="gm">Add people by username</label>
          <input id="gm" className="input" value={form.members} onChange={set('members')} placeholder="@alexexplorer, priyawanders" />
          <span className="muted small">Comma separated. You can add more people later.</span>
        </div>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary lg block" disabled={saving}>{saving ? 'Creating…' : 'Create group'}</button>
      </form>
    </div>
  );
}

function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setGroups((await groupsAPI.list()).data.groups); } catch (err) { setError(err.response?.data?.error || 'Failed to load groups'); setGroups([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div><h1>Groups</h1><p>Travel together: chat, split costs and settle up.</p></div>
        <button className="btn primary" onClick={() => setShowNew(true)}><Plus size={16} /> New group</button>
      </div>
      {error && <div className="alert" style={{ marginBottom: 14 }}>{error}</div>}

      {groups === null ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : groups.length === 0 ? (
          <div className="card empty">
            <span className="icon-tile violet" style={{ margin: '0 auto 12px' }}><Users size={22} /></span>
            <h3>No groups yet</h3><p>Create one for your next trip and split the bills without the spreadsheet.</p>
            <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setShowNew(true)}>Create your first group</button>
          </div>
        ) : (
          <div className="group-grid">
            {groups.map((g) => (
              <Link key={g.id} to={`/groups/${g.id}`} className="card hover group-card">
                <div className="row between"><h3>{g.name}</h3><ChevronRight size={18} color="var(--muted)" /></div>
                {g.description && <p className="muted small">{g.description}</p>}
                <Avatars members={g.members} />
                <div className="row between wrap" style={{ marginTop: 'auto' }}>
                  <span><small className="muted">Total spent</small><b className="spent">{money(g.total_spent)}</b></span>
                  <BalanceTag value={g.my_balance} />
                </div>
              </Link>
            ))}
          </div>
        )}
      {showNew && <NewGroupModal onClose={() => setShowNew(false)} onCreated={(id) => navigate(`/groups/${id}`)} />}
    </>
  );
}

export default Groups;
