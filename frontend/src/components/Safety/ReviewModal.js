import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { safetyAPI } from '../../utils/api';

// Reviews always target a person (the host); entityType/entityId record what the review is about
function ReviewModal({ userId, entityId, entityType = 'user', entityName, onClose, onSuccess }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await safetyAPI.addReview({
        user_id: userId ?? entityId,
        entity_id: entityType === 'user' ? undefined : entityId,
        entity_type: entityType,
        rating,
        comment,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="sheet-head">
          <div><h2>Rate your experience</h2><p className="muted">How was your time with {entityName}?</p></div>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" className="link" onClick={() => setRating(s)} aria-label={`${s} stars`}>
              <Star size={36} fill={s <= rating ? 'var(--amber)' : 'none'} color={s <= rating ? 'var(--amber)' : 'var(--line)'} />
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="review-text">Your feedback</label>
          <textarea id="review-text" className="textarea" placeholder="Tell us more about your experience…" value={comment} onChange={(e) => setComment(e.target.value)} required />
        </div>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary lg block" disabled={submitting}>{submitting ? 'Submitting…' : 'Post review'}</button>
      </form>
    </div>
  );
}

export default ReviewModal;
