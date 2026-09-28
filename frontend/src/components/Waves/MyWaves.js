import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Star, Trash2, UserX, X, ChevronDown } from 'lucide-react';
import { wavesAPI } from '../../utils/api';
import { initials } from '../../utils/activityTypes';
import ReviewModal from '../Safety/ReviewModal';
import GroupChat from '../Chat/GroupChat';

const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const isPast = (iso) => new Date(iso) < new Date();
const tone = { pending: 'amber', approved: 'mint', rejected: 'red', cancelled: 'red' };

function CancelMemberModal({ member, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><h2>Remove traveler</h2><p className="muted">Removing {member.full_name} from your ride</p></div>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="field"><label htmlFor="why">Reason (shared with them)</label>
          <textarea id="why" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you removing this traveler?" /></div>
        <div className="grid-2"><button className="btn" onClick={onClose}>Keep</button>
          <button className="btn danger" disabled={!reason.trim()} onClick={() => onConfirm(reason)}>Remove</button></div>
      </div>
    </div>
  );
}

function HostedCard({ wave, user, onChanged, onCancelMember }) {
  const [requests, setRequests] = useState(null);
  const [panel, setPanel] = useState(null); // 'requests' | 'chat'
  const past = isPast(wave.departure_time);

  const loadRequests = async () => {
    try { setRequests((await wavesAPI.getRequests(wave.id)).data); } catch (e) { setRequests([]); }
  };
  const toggle = async (name) => {
    if (panel === name) return setPanel(null);
    if (name === 'requests') await loadRequests();
    setPanel(name);
  };
  const decide = async (id, status) => {
    try { await wavesAPI.processRequest(id, status); onChanged(); loadRequests(); } catch (err) { alert(err.response?.data?.error || 'Failed to update'); }
  };
  return (
    <div className="card stack">
      <div className="row between wrap">
        <div><b style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>{wave.origin_name} → {wave.destination_name}</b><div className="muted small">{when(wave.departure_time)}</div></div>
        <span className={`tag ${past ? 'plain' : wave.pending_requests > 0 ? 'amber' : 'mint'}`}>{past ? 'Journey ended' : wave.pending_requests > 0 ? 'Action needed' : 'Scheduled'}</span>
      </div>
      <div className="muted small">{wave.current_travelers} of {wave.capacity} seats filled · ₹{Math.round(wave.price_per_seat)} per seat</div>
      <div className="row wrap">
        {!past && <button className="btn sm" onClick={() => toggle('requests')}>Manage requests {wave.pending_requests > 0 && <span className="tag pink">{wave.pending_requests}</span>} <ChevronDown size={14} /></button>}
        <button className="btn sm" onClick={() => toggle('chat')}><MessageSquare size={14} /> Chat</button>
        {!past && <button className="btn sm danger" onClick={() => onCancelMember(wave, null)}><Trash2 size={14} /> Cancel ride</button>}
      </div>

      {panel === 'requests' && (
        <div className="stack">
          {requests?.length === 0 && <p className="muted small">No requests yet.</p>}
          {requests?.map((r) => (
            <div className="card flat row between wrap" key={r.id} style={{ padding: 12 }}>
              <div className="row"><span className="avatar sm">{initials(r.full_name)}</span><div><b>{r.full_name}</b><div className="muted small">{r.seats_requested} seat{r.seats_requested > 1 ? 's' : ''} · trust {r.trust_score}</div></div></div>
              {r.status === 'pending' ? (
                <div className="row"><button className="btn sm" onClick={() => decide(r.id, 'rejected')}>Decline</button><button className="btn sm primary" onClick={() => decide(r.id, 'approved')}>Accept</button></div>
              ) : (
                <div className="row"><span className={`tag ${tone[r.status] || 'plain'}`}>{r.status === 'approved' ? 'Member' : r.status}</span>
                  {r.status === 'approved' && !past && <button className="icon-btn sm" title="Remove member" onClick={() => onCancelMember(wave, r)}><UserX size={15} /></button>}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {panel === 'chat' && <GroupChat type="wave" id={wave.id} user={user} />}
    </div>
  );
}

function JoinedCard({ req, user, onReview }) {
  const [chat, setChat] = useState(false);
  const past = isPast(req.departure_time);
  return (
    <div className="card stack">
      <div className="row between wrap">
        <div><b style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>{req.origin_name} → {req.destination_name}</b><div className="muted small">{when(req.departure_time)} · host {req.host_name}</div></div>
        <span className={`tag ${past ? 'plain' : tone[req.status] || 'plain'}`}>{past ? 'Trip memories' : req.status === 'approved' ? 'Seat reserved' : req.status}</span>
      </div>
      {req.cancellation_reason && <div className="alert">Removed by host: {req.cancellation_reason}</div>}
      <div className="row wrap">
        {req.status === 'approved' && <button className="btn sm" onClick={() => setChat(!chat)}><MessageSquare size={14} /> {chat ? 'Hide chat' : 'Member chat'}</button>}
        {past && req.status === 'approved' && <button className="btn sm primary" onClick={onReview}><Star size={14} /> Review host</button>}
      </div>
      {chat && <GroupChat type="wave" id={req.wave_id} user={user} />}
    </div>
  );
}

function MyWaves({ user }) {
  const [data, setData] = useState({ hosted: [], requested: [] });
  const [loading, setLoading] = useState(true);
  const [when_, setWhen] = useState('upcoming');
  const [review, setReview] = useState(null);
  const [removing, setRemoving] = useState(null); // { wave, member }

  const load = useCallback(async () => {
    try { setData((await wavesAPI.getMyWaves()).data); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = (list, iso) => list.filter((x) => (when_ === 'upcoming') !== isPast(x[iso]));
  const hosted = pick(data.hosted, 'departure_time');
  const requested = pick(data.requested, 'departure_time');

  const confirmRemove = async (reason) => {
    try {
      if (removing.member) await wavesAPI.cancelMember(removing.member.id, reason);
      setRemoving(null);
      await load();
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
  };

  const cancelRide = async (wave, member) => {
    if (member) return setRemoving({ wave, member });
    if (!window.confirm('Cancel this entire ride? All passengers lose their seats.')) return;
    try { await wavesAPI.deleteWave(wave.id); load(); } catch (err) { alert(err.response?.data?.error || 'Failed to cancel ride'); }
  };

  if (loading) return <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="tabs" style={{ maxWidth: 360 }}>
        <button className={when_ === 'upcoming' ? 'active' : ''} onClick={() => setWhen('upcoming')}>Upcoming</button>
        <button className={when_ === 'past' ? 'active' : ''} onClick={() => setWhen('past')}>Past</button>
      </div>
      <section className="stack"><h2>Hosting</h2>
        {hosted.length === 0 ? <div className="card empty">No {when_} rides hosted.</div>
          : hosted.map((w) => <HostedCard key={w.id} wave={w} user={user} onChanged={load} onCancelMember={cancelRide} />)}
      </section>
      <section className="stack"><h2>Joined</h2>
        {requested.length === 0 ? <div className="card empty">No {when_} rides joined.</div>
          : requested.map((r) => <JoinedCard key={r.id} req={r} user={user} onReview={() => setReview(r)} />)}
      </section>
      {review && <ReviewModal userId={review.host_id} entityType="wave" entityId={review.wave_id} entityName={review.host_name} onClose={() => setReview(null)} />}
      {removing && <CancelMemberModal member={removing.member} onClose={() => setRemoving(null)} onConfirm={confirmRemove} />}
    </div>
  );
}

export default MyWaves;
