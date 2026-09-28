import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Link2Off } from 'lucide-react';
import { groupsAPI } from '../../utils/api';
import './Groups.css';

// Landing page for an invite link: shows which group it is, then joins on confirmation
function JoinGroup() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    groupsAPI.invitePreview(code).then((r) => setInvite(r.data)).catch((err) => setError(err.response?.data?.error || 'This invite link is no longer valid'));
  }, [code]);

  const join = async () => {
    setJoining(true);
    try {
      await groupsAPI.joinByCode(code);
      navigate(`/groups/${invite.group_id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not join the group');
      setJoining(false);
    }
  };

  if (!invite && !error) return <div className="empty"><div className="spinner" style={{ margin: '80px auto' }} /></div>;

  if (error && !invite) {
    return (
      <div className="card empty join-card">
        <span className="icon-tile pink" style={{ margin: '0 auto 12px' }}><Link2Off size={22} /></span>
        <h2>Invite link not valid</h2><p>{error}. Ask the group creator for a fresh link.</p>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={() => navigate('/groups')}>Go to my groups</button>
      </div>
    );
  }

  return (
    <div className="card stack join-card">
      <span className="icon-tile violet" style={{ margin: '0 auto' }}><Users size={24} /></span>
      <div className="center">
        <p className="muted">{invite.creator_name} invited you to join</p>
        <h1 style={{ fontSize: 30, margin: '4px 0' }}>{invite.name}</h1>
        {invite.description && <p className="muted">{invite.description}</p>}
        <p className="muted small" style={{ marginTop: 6 }}>{invite.member_count} {invite.member_count === 1 ? 'person' : 'people'} in the group</p>
      </div>
      <p className="muted small center">Members can chat, add expenses and split costs together.</p>
      {error && <div className="alert">{error}</div>}
      {invite.already_member
        ? <button className="btn primary lg block" onClick={() => navigate(`/groups/${invite.group_id}`, { replace: true })}>You're already in, open group</button>
        : <button className="btn primary lg block" disabled={joining} onClick={join}>{joining ? 'Joining…' : 'Join group'}</button>}
    </div>
  );
}

export default JoinGroup;
