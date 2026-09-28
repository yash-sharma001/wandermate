import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Flag, Calendar, MapPin, ShieldCheck, Shield, Phone, Mail, Image as ImageIcon } from 'lucide-react';
import { activitiesAPI } from '../../utils/api';
import { typeIcon, typeLabel, initials } from '../../utils/activityTypes';
import ReviewModal from '../Safety/ReviewModal';
import ReportModal from '../Safety/ReportModal';
import GroupChat from '../Chat/GroupChat';
import './Activities.css';

function ActivityDetails({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('details');
  const [showReview, setShowReview] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const res = await activitiesAPI.getById(id);
      setActivity(res.data.activity);
      setAttendees(res.data.attendees);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const act = async (fn, failMsg) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (err) { setError(err.response?.data?.error || failMsg); } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this activity? Everyone who joined will lose it.')) return;
    try { await activitiesAPI.delete(id); navigate('/'); } catch (err) { setError(err.response?.data?.error || 'Failed to delete'); }
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) return navigator.share({ title: activity.title, url }).catch(() => {});
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="empty"><div className="spinner" style={{ margin: '80px auto' }} /></div>;
  if (!activity) return (
    <div className="empty"><h3>{error || 'Activity not found'}</h3><button className="btn primary" onClick={() => navigate('/')}>Back to map</button></div>
  );

  const Icon = typeIcon(activity.activity_type);
  const isHost = activity.host_id === user.id;
  const joined = activity.is_rsvped > 0;
  const spotsLeft = activity.capacity - activity.current_attendees;
  const start = new Date(activity.start_time);
  const isPast = start < new Date();
  const pct = Math.min(100, (activity.current_attendees / activity.capacity) * 100);
  const womenOnly = activity.gender_filter === 'female';
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${activity.latitude},${activity.longitude}`;

  const cta = isHost ? (
    <button className="btn danger lg block" onClick={handleDelete}>Delete activity</button>
  ) : isPast ? (
    joined
      ? <button className="btn primary lg block" onClick={() => setShowReview(true)}>Review {activity.host_name}</button>
      : <div className="tag plain">This meetup has ended</div>
  ) : joined ? (
    <button className="btn lg block" disabled={busy} onClick={() => act(() => activitiesAPI.cancelRSVP(id), 'Failed to cancel RSVP')}>{busy ? 'Working…' : 'Cancel RSVP'}</button>
  ) : spotsLeft <= 0 ? (
    <div className="tag plain">This meetup is full</div>
  ) : (
    <button className="btn primary lg block" disabled={busy} onClick={() => act(() => activitiesAPI.rsvp(id), 'Failed to join')}>{busy ? 'Joining…' : 'Join meetup · Free'}</button>
  );

  return (
    <div className="detail">
      <div className="cover ph">
        <button className="icon-btn back" onClick={() => navigate('/')} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="cover-actions">
          <button className="icon-btn" onClick={share} aria-label="Share"><Share2 size={18} /></button>
          {!isHost && <button className="icon-btn" onClick={() => setShowReport(true)} aria-label="Report"><Flag size={18} /></button>}
        </div>
        <span className="stack" style={{ alignItems: 'center', gap: 6, fontWeight: 700 }}><ImageIcon size={30} /> <small>{copied ? 'Link copied!' : 'Cover photo · host upload'}</small></span>
      </div>

      <div className="detail-body">
        <div className="detail-main stack">
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="tag"><Icon size={13} /> {typeLabel(activity.activity_type)}</span>
            {womenOnly && <span className="tag pink"><Shield size={12} /> Women-only</span>}
          </div>
          <h1>{activity.title}</h1>
          <div className="row">
            <span className="avatar lg">{initials(activity.host_name)}</span>
            <div>
              <b>Hosted by {activity.host_name}</b>
              <div className="muted small">
                {activity.host_verification === 'verified' && <span style={{ color: 'var(--violet)', fontWeight: 700 }}><ShieldCheck size={13} style={{ verticalAlign: '-2px' }} /> ID verified · </span>}
                Trust score {activity.host_trust_score}
              </div>
            </div>
          </div>

          {(joined || isHost) && <div className="tabs">
            <button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>Details</button>
            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Group chat</button>
          </div>}

          {error && <div className="alert">{error}</div>}

          {tab === 'chat' ? <GroupChat type="activity" id={id} user={user} /> : (
            <>
              {/* Facts card: inline on phones, sticky side card on desktop */}
              <div className="card facts side-mobile">
                <div className="row"><span className="icon-tile"><Calendar size={20} /></span><div><b>{start.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b>{activity.end_time && <div className="muted small">Until {new Date(activity.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>}</div></div>
                <hr className="divider" />
                <div className="row"><span className="icon-tile"><MapPin size={20} /></span><div className="grow"><b>{activity.location_name}</b></div><a href={directions} target="_blank" rel="noreferrer"><b>Directions</b></a></div>
                <hr className="divider" />
                <div className="row between"><b>{activity.current_attendees} of {activity.capacity} going</b><b style={{ color: 'var(--pink)' }}>{Math.max(0, spotsLeft)} spots left</b></div>
                <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${pct}%` }} /></div>
              </div>

              {womenOnly && (
                <div className="alert side-mobile"><Shield size={20} /><span><b>Women-only meetup.</b> Only women travelers with a verified phone can see and join this activity.</span></div>
              )}

              <section><h2>About</h2><p className="muted" style={{ marginTop: 8, fontSize: 16 }}>{activity.description || 'No description provided.'}</p></section>

              <section>
                <h2>Who's going</h2>
                <div className="row wrap" style={{ marginTop: 10 }}>
                  {attendees.length === 0 ? <span className="muted">Be the first to join.</span> : (
                    <span className="avatar-stack">
                      {attendees.slice(0, 6).map((a, i) => <span key={a.id} className={`avatar ${['', 'violet', 'amber', 'mint'][i % 4]}`} title={a.full_name}>{initials(a.full_name)}</span>)}
                      {attendees.length > 6 && <span className="avatar plain-more">+{attendees.length - 6}</span>}
                    </span>
                  )}
                </div>
              </section>

              {(joined || isHost) && (activity.host_phone || activity.host_email) && (
                <div className="alert success"><ShieldCheck size={20} />
                  <span><b>Host contact</b>
                    {activity.host_phone && <div><Phone size={13} style={{ verticalAlign: '-2px' }} /> {activity.host_phone}</div>}
                    {activity.host_email && <div><Mail size={13} style={{ verticalAlign: '-2px' }} /> {activity.host_email}</div>}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="detail-side">
          <div className="card stack sticky">
            <div className="row"><span className="icon-tile"><Calendar size={20} /></span><div><b>{start.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b></div></div>
            <div className="row"><span className="icon-tile"><MapPin size={20} /></span><div className="grow"><b>{activity.location_name}</b></div><a href={directions} target="_blank" rel="noreferrer"><b>Directions</b></a></div>
            <div><div className="row between"><b>{activity.current_attendees} of {activity.capacity} going</b><b style={{ color: 'var(--pink)' }}>{Math.max(0, spotsLeft)} spots left</b></div><div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${pct}%` }} /></div></div>
            {womenOnly && <div className="alert"><Shield size={18} /><span><b>Women-only.</b> Only women with a verified phone can join.</span></div>}
            {cta}
            <div className="grid-2">
              <button className="btn" onClick={share}><Share2 size={16} /> Share</button>
              {!isHost && <button className="btn" onClick={() => setShowReport(true)}><Flag size={16} /> Report</button>}
            </div>
          </div>
        </aside>
      </div>

      <div className="bottom-cta">
        <div><b style={{ fontFamily: 'var(--font-head)', fontSize: 19 }}>{spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}</b><div className="muted small">Free · you split any costs</div></div>
        <div style={{ minWidth: 170 }}>{cta}</div>
      </div>

      {showReview && <ReviewModal userId={activity.host_id} entityName={activity.host_name} onClose={() => setShowReview(false)} />}
      {showReport && <ReportModal reportedUserId={activity.host_id} entityId={activity.id} entityType="activity" entityName={activity.title} onClose={() => setShowReport(false)} />}
    </div>
  );
}

export default ActivityDetails;
