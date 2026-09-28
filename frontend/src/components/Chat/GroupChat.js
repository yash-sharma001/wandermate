import React, { useState, useEffect, useRef } from 'react';
import { Send, ShieldCheck, Receipt, ArrowRightLeft } from 'lucide-react';
import { chatAPI } from '../../utils/api';
import { money, methodLabel } from '../../utils/money';
import { initials } from '../../utils/activityTypes';
import './GroupChat.css';

function GroupChat({ type, id, user }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [chatRoomId, setChatRoomId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  // Open the chat (members only), then stay subscribed: Hasura pushes the message list on every change
  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const chatId = await chatAPI.open(type, id);
        if (cancelled) return;
        setChatRoomId(chatId);
        unsubscribe = chatAPI.subscribe(chatId, setMessages, () => setError('Chat connection lost'));
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load chat');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; unsubscribe(); };
  }, [type, id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !chatRoomId) return;
    const body = text.trim();
    setText('');
    try {
      await chatAPI.send(chatRoomId, body);
    } catch (err) {
      setText(body);
      setError(err.response?.data?.error || 'Failed to send message');
    }
  };

  if (loading) return <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>;
  if (error && !chatRoomId) return <div className="alert">{error}</div>;

  return (
    <div className="chat card">
      <div className="chat-head"><ShieldCheck size={18} /> <b>Trip group chat</b> <span className="muted small">Only members can see this</span></div>
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="empty">No messages yet. Say hi to your fellow travelers!</p>
        ) : messages.map((m) => {
          const mine = m.sender_id === user.id;
          const time = new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          // Expenses and payments from the group's money tab show up here as cards
          if (m.kind === 'expense' || m.kind === 'settlement') {
            const e = m.meta || {};
            const who = (id, name) => (id === user.id ? 'You' : name);
            return (
              <div key={m.id} className={`event ${m.kind}`}>
                <span className="icon-tile">{m.kind === 'expense' ? <Receipt size={18} /> : <ArrowRightLeft size={18} />}</span>
                <div className="grow">
                  {m.kind === 'expense' ? (
                    <>
                      <small className="muted">{mine ? 'You' : m.sender_name} added an expense</small>
                      <b>{e.description}</b>
                      <span className="muted small">{who(e.paid_by, e.paid_by_name)} paid · {methodLabel(e.method)}</span>
                    </>
                  ) : (
                    <>
                      <small className="muted">Payment recorded</small>
                      <b>{who(e.from_user, e.from_name)} paid {e.to_user === user.id ? 'you' : e.to_name}</b>
                      <span className="muted small">{methodLabel(e.method)}{e.note ? ` · ${e.note}` : ''}</span>
                    </>
                  )}
                </div>
                <div className="amt"><b>{money(e.amount)}</b><small className="muted">{time}</small></div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              {!mine && (m.sender_photo
                ? <img className="avatar sm" src={m.sender_photo} alt="" />
                : <span className="avatar sm violet">{initials(m.sender_name)}</span>)}
              <div className="bubble">
                {!mine && <b>{m.sender_name}</b>}
                <p>{m.content}</p>
                <small>{new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
              </div>
            </div>
          );
        })}
      </div>
      {error && <div className="alert" style={{ margin: '0 14px 10px' }}>{error}</div>}
      <form className="chat-input" onSubmit={handleSend}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" maxLength={2000} />
        <button className="btn primary" disabled={!text.trim()} aria-label="Send"><Send size={18} /></button>
      </form>
    </div>
  );
}

export default GroupChat;
