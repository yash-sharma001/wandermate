import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { safetyAPI } from '../../utils/api';

const REASONS = ['Fraud / Scam', 'Harassment', 'Safety concern', 'Inappropriate content', 'Other'];

// Reports are filed against a person (reportedUserId) and optionally the thing they posted
function ReportModal({ reportedUserId, entityId, entityType = 'user', entityName, onClose }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await safetyAPI.reportFraud({
        reported_user_id: reportedUserId,
        entity_id: entityType === 'user' ? undefined : entityId,
        entity_type: entityType,
        reason,
        description,
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="sheet-head">
          <div className="row"><span className="icon-tile pink"><Flag size={20} /></span><h2>Report a concern</h2></div>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {done ? (
          <>
            <div className="alert success">Report submitted. Our safety team will look into it. Thank you for keeping WanderMates safe.</div>
            <button type="button" className="btn dark block" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <p className="muted">Tell us what's wrong with {entityName ? `“${entityName}”` : 'this'}.</p>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {REASONS.map((r) => (
                <button key={r} type="button" className={`chip ${reason === r ? 'active' : ''}`} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="report-text">Details</label>
              <textarea id="report-text" className="textarea" placeholder="Please share specifics to help us investigate…" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            {error && <div className="alert">{error}</div>}
            <button className="btn danger lg block" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit report'}</button>
            <p className="muted small center">Reports are confidential. Misuse may lead to account suspension.</p>
          </>
        )}
      </form>
    </div>
  );
}

export default ReportModal;
