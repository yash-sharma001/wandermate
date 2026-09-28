import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Trash2, UserPlus, Utensils, BedDouble, Car, Ticket, ShoppingBag, Receipt, ChevronLeft, ChevronRight, Copy, Check, ArrowRight, Smartphone, Link2, Share2, RefreshCw } from 'lucide-react';
import { groupsAPI } from '../../utils/api';
import { initials } from '../../utils/activityTypes';
import { money, simplifyDebts, METHODS, methodLabel } from '../../utils/money';
import { QRCodeSVG } from 'qrcode.react';
import GroupChat from '../Chat/GroupChat';
import { Avatars, BalanceTag } from './Groups';
import './Groups.css';

const CATEGORIES = [
  { value: 'Food', icon: Utensils }, { value: 'Stay', icon: BedDouble }, { value: 'Transport', icon: Car },
  { value: 'Activities', icon: Ticket }, { value: 'Shopping', icon: ShoppingBag }, { value: 'Other', icon: Receipt },
];
const catIcon = (c) => CATEGORIES.find((x) => x.value === c)?.icon || Receipt;
const today = () => new Date().toISOString().slice(0, 10);
const dayLabel = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const upiLink = (m, amount, note) => `upi://pay?pa=${encodeURIComponent(m.upi_id)}&pn=${encodeURIComponent(m.full_name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

function AddExpenseModal({ group, members, me, onClose, onSaved }) {
  const [f, setF] = useState({ amount: '', description: '', category: 'Food', method: 'cash', paid_by: me, date: today(), type: 'equal' });
  const [picked, setPicked] = useState(() => new Set(members.map((m) => m.user_id)));
  const [exact, setExact] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setError(''); };
  const amount = parseFloat(f.amount) || 0;

  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exactSum = [...picked].reduce((s, id) => s + (parseFloat(exact[id]) || 0), 0);
  const perHead = picked.size ? amount / picked.size : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!picked.size) return setError('Pick at least one person to split with');
    if (f.type === 'exact' && Math.abs(exactSum - amount) > 0.01) return setError(`The split adds up to ${money(exactSum)}, but the expense is ${money(amount)}`);
    setSaving(true);
    try {
      await groupsAPI.addExpense({
        group_id: group.id, amount, description: f.description, category: f.category, method: f.method, paid_by: f.paid_by, expense_date: f.date, split_type: f.type,
        splits: [...picked].map((id) => (f.type === 'exact' ? { user_id: id, amount: parseFloat(exact[id]) || 0 } : { user_id: id })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the expense');
      setSaving(false);
    }
  };

  return (
    <div className="overlay sheet-bottom" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head"><h2>Add expense</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>

        <div className="field"><label htmlFor="ea">Amount (₹)</label>
          <input id="ea" className="input big-amount" type="number" inputMode="decimal" min="0.01" step="0.01" required autoFocus value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0" /></div>
        <div className="field"><label htmlFor="ed">What was it for?</label><input id="ed" className="input" required maxLength={120} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Dinner at the beach shack" /></div>

        <div className="field"><label>Category</label>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {CATEGORIES.map(({ value, icon: Icon }) => <button type="button" key={value} className={`chip ${f.category === value ? 'active' : ''}`} onClick={() => set({ category: value })}><Icon size={14} style={{ verticalAlign: '-2px' }} /> {value}</button>)}
          </div></div>

        <div className="grid-2">
          <div className="field"><label htmlFor="ep">Paid by</label>
            <select id="ep" className="select" value={f.paid_by} onChange={(e) => set({ paid_by: Number(e.target.value) })}>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === me ? 'You' : m.full_name}</option>)}</select></div>
          <div className="field"><label htmlFor="edt">Date</label><input id="edt" type="date" className="input" max={today()} value={f.date} onChange={(e) => set({ date: e.target.value })} /></div>
        </div>

        <div className="field"><label>How was it paid?</label>
          <div className="chips">{METHODS.map((m) => <button type="button" key={m.value} className={`chip ${f.method === m.value ? 'active' : ''}`} onClick={() => set({ method: m.value })}>{m.label}</button>)}</div></div>

        <div className="field">
          <div className="row between"><label>Split between</label>
            <div className="tabs mini"><button type="button" className={f.type === 'equal' ? 'active' : ''} onClick={() => set({ type: 'equal' })}>Equally</button>
              <button type="button" className={f.type === 'exact' ? 'active' : ''} onClick={() => set({ type: 'exact' })}>Exact</button></div></div>
          <div className="stack" style={{ gap: 8 }}>
            {members.map((m) => (
              <div className="row split-row" key={m.user_id}>
                <label className="row grow" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={picked.has(m.user_id)} onChange={() => toggle(m.user_id)} />
                  <span className="avatar sm">{initials(m.full_name)}</span><b>{m.user_id === me ? 'You' : m.full_name}</b>
                </label>
                {picked.has(m.user_id) && (f.type === 'equal'
                  ? <span className="muted">{money(perHead)}</span>
                  : <input className="input amt" type="number" min="0" step="0.01" placeholder="0" value={exact[m.user_id] ?? ''} onChange={(e) => setExact({ ...exact, [m.user_id]: e.target.value })} />)}
              </div>
            ))}
          </div>
          {f.type === 'exact' && (
            <div className="row between small"><span className={Math.abs(exactSum - amount) < 0.01 ? '' : 'over'}>{money(exactSum)} of {money(amount)}</span>
              <button type="button" className="link" onClick={() => { const share = (amount / (picked.size || 1)).toFixed(2); setExact(Object.fromEntries([...picked].map((id) => [id, share]))); }}>Fill equally</button></div>
          )}
        </div>

        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn primary lg block" disabled={saving}>{saving ? 'Saving…' : 'Save expense'}</button>
      </form>
    </div>
  );
}

// Records a payment between two members (cash handed over, UPI transfer, ...). Either side may log it.
function SettleModal({ group, members, me, transfer, onClose, onSaved }) {
  const payee = members.find((m) => m.user_id === transfer.to);
  const [amount, setAmount] = useState(String(transfer.amount));
  const [method, setMethod] = useState(transfer.from === me ? 'upi' : 'cash');
  const [note, setNote] = useState('');
  const [upiId, setUpiId] = useState(payee?.upi_id || ''); // can be typed if the payee hasn't saved one
  const [launched, setLaunched] = useState(false);
  const [asked, setAsked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const payLink = upiId && parseFloat(amount) > 0 ? upiLink({ ...payee, upi_id: upiId.trim() }, parseFloat(amount), group.name) : null;

  // Coming back from the UPI app: ask whether it went through (we can't see the bank's side, so the payer confirms)
  useEffect(() => {
    if (!launched) return undefined;
    const back = () => { if (document.visibilityState === 'visible') setAsked(true); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [launched]);

  const copyUpi = async () => {
    try { await navigator.clipboard.writeText(upiId.trim()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* clipboard blocked */ }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await groupsAPI.settle({ group_id: group.id, from_user: transfer.from, to_user: transfer.to, amount: parseFloat(amount), method, note });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not record the payment');
      setSaving(false);
    }
  };

  return (
    <div className="overlay sheet-bottom" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="sheet-head"><h2>Settle up</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <p className="settle-line"><b>{transfer.from === me ? 'You' : transfer.from_name}</b> <ArrowRight size={16} /> <b>{transfer.to === me ? 'you' : transfer.to_name}</b></p>
        <div className="field"><label htmlFor="sa">Amount (₹)</label><input id="sa" className="input big-amount" type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="field"><label>Paid via</label>
          <div className="chips">{METHODS.map((m) => <button type="button" key={m.value} className={`chip ${method === m.value ? 'active' : ''}`} onClick={() => setMethod(m.value)}>{m.label}</button>)}</div></div>
        {method === 'upi' && transfer.from === me && (
          <div className="upi-box stack">
            <div className="field"><label htmlFor="su">{transfer.to_name}'s UPI ID</label>
              <div className="row"><input id="su" className="input" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@okbank" />
                {upiId && <button type="button" className="btn" onClick={copyUpi}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>}</div>
              {!payee?.upi_id && <span className="muted small">They haven't saved one in their profile, so type it in.</span>}</div>
            {payLink ? (
              <>
                <a className="btn amber lg block" href={payLink} onClick={() => setLaunched(true)}><Smartphone size={18} /> Pay {money(amount)} in your UPI app</a>
                <div className="qr-row">
                  <span className="qr"><QRCodeSVG value={payLink} size={132} marginSize={2} /></span>
                  <p className="muted small">On a computer? Scan this with GPay, PhonePe, Paytm or any UPI app. The amount is filled in.</p>
                </div>
              </>
            ) : <div className="alert info">Enter their UPI ID and an amount to get the pay button and QR code.</div>}
            {asked && (
              <div className="alert success"><Check size={18} /><span><b>Did the payment go through?</b> If yes, tap “I paid, record it” below so everyone sees it.</span></div>
            )}
          </div>
        )}
        <div className="field"><label htmlFor="sn">{method === 'upi' ? 'UPI reference / note' : 'Note'} <span className="muted small">(optional)</span></label><input id="sn" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={method === 'upi' ? 'Transaction ID' : 'Paid back for the cab'} /></div>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary lg block" disabled={saving}>{saving ? 'Saving…' : transfer.from === me ? 'I paid, record it' : 'Mark as received'}</button>
      </form>
    </div>
  );
}

function AddMemberModal({ groupId, onClose, onSaved }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await groupsAPI.addMember(groupId, username); onSaved(); } catch (err) { setError(err.response?.data?.error || 'Could not add them'); setSaving(false); }
  };
  return (
    <div className="overlay sheet-bottom" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head"><h2>Add a traveler</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="field"><label htmlFor="mu">Username</label><input id="mu" className="input" required autoFocus value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }} placeholder="@alexexplorer" /></div>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary lg block" disabled={saving}>{saving ? 'Adding…' : 'Add to group'}</button>
      </form>
    </div>
  );
}

// Shown to the group's creator only (invite_code is null for everyone else)
function InviteCard({ group, onChanged }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = `${window.location.origin}/join/${group.invite_code}`;
  const text = `Join our trip group “${group.name}” on WanderMates: ${link}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { window.prompt('Copy this link', link); }
  };
  const share = () => (navigator.share
    ? navigator.share({ title: group.name, text, url: link }).catch(() => {})
    : window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'));
  const regenerate = async () => {
    if (!window.confirm('Create a new link? The old one will stop working.')) return;
    setBusy(true);
    try { await groupsAPI.regenerateInvite(group.id); await onChanged(); } catch (err) { alert(err.response?.data?.error || 'Could not change the link'); } finally { setBusy(false); }
  };

  return (
    <div className="card stack invite-card">
      <div className="row"><span className="icon-tile amber"><Link2 size={20} /></span>
        <div><b>Invite friends</b><div className="muted small">Anyone with this link can join after logging in.</div></div></div>
      <div className="row invite-row">
        <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <button className="btn" onClick={copy}>{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}</button>
        <button className="btn primary" onClick={share}><Share2 size={16} /> Share</button>
      </div>
      <button className="link small" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={regenerate}><RefreshCw size={12} style={{ verticalAlign: '-1px' }} /> Reset link</button>
    </div>
  );
}

function ExpensesTab({ data, me, onAdd, onChanged }) {
  const [open, setOpen] = useState(null);
  const remove = async (e) => {
    if (!window.confirm(`Delete “${e.description}”? Balances will update.`)) return;
    try { await groupsAPI.deleteExpense(e.id); onChanged(); } catch (err) { alert(err.response?.data?.error || 'Could not delete'); }
  };
  const byDay = useMemo(() => {
    const m = new Map();
    data.expenses.forEach((e) => { const k = String(e.expense_date).slice(0, 10); m.set(k, [...(m.get(k) || []), e]); });
    return [...m.entries()];
  }, [data.expenses]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <button className="btn primary lg" onClick={onAdd}><Plus size={18} /> Add expense</button>
      {byDay.length === 0 && <div className="card empty"><h3>No expenses yet</h3><p>Add the first one: who paid, how much, and who shares it. Cash payments too.</p></div>}
      {byDay.map(([day, list]) => (
        <section key={day} className="stack" style={{ gap: 10 }}>
          <small className="day-label">{dayLabel(day)}</small>
          {list.map((e) => {
            const Icon = catIcon(e.category);
            const mine = e.splits.find((s) => s.user_id === me);
            return (
              <div key={e.id} className="card exp-card">
                <button className="exp-main" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <span className="icon-tile violet"><Icon size={20} /></span>
                  <span className="grow"><b>{e.description}</b>
                    <span className="muted small">{e.paid_by === me ? 'You' : e.payer_name} paid · <span className="tag plain">{methodLabel(e.method)}</span></span></span>
                  <span className="amt-col"><b>{money(e.amount)}</b>
                    <span className={`small ${e.paid_by === me ? 'pos' : mine ? 'neg' : 'muted'}`}>
                      {e.paid_by === me ? `you lent ${money(e.amount - (mine?.amount || 0))}` : mine ? `you owe ${money(mine.amount)}` : 'not involved'}</span></span>
                </button>
                {open === e.id && (
                  <div className="exp-detail">
                    <div className="small muted">Split {e.split_type === 'equal' ? 'equally' : 'by exact amounts'}</div>
                    {e.splits.map((s) => <div className="row between small" key={s.user_id}><span>{s.user_id === me ? 'You' : s.full_name}</span><b>{money(s.amount)}</b></div>)}
                    {(e.created_by === me || e.paid_by === me) && <button className="btn sm danger" onClick={() => remove(e)}><Trash2 size={14} /> Delete</button>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function BalancesTab({ data, me, onSettle }) {
  const transfers = useMemo(() => simplifyDebts(data.balances), [data.balances]);
  const max = Math.max(1, ...data.balances.map((b) => Math.abs(b.balance)));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card stack">
        <h3>Who owes what</h3>
        {data.balances.map((b) => (
          <div className="bal-row" key={b.user_id}>
            <span className="avatar sm">{initials(b.full_name)}</span>
            <b className="name">{b.user_id === me ? 'You' : b.full_name}</b>
            <span className="bar"><i className={b.balance >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(b.balance) / max) * 100}%` }} /></span>
            <b className={Math.abs(b.balance) < 0.005 ? 'muted' : b.balance > 0 ? 'pos' : 'neg'}>{Math.abs(b.balance) < 0.005 ? 'Settled' : `${b.balance > 0 ? '+' : '−'}${money(b.balance)}`}</b>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h3>Settle up</h3>
        {transfers.length === 0 ? <p className="muted">Everyone is square. Nice.</p> : transfers.map((t) => (
          <div className="row between wrap transfer" key={`${t.from}-${t.to}`}>
            <span className="settle-line"><b>{t.from === me ? 'You' : t.from_name}</b> <ArrowRight size={16} /> <b>{t.to === me ? 'you' : t.to_name}</b></span>
            <span className="row"><b>{money(t.amount)}</b>
              {(t.from === me || t.to === me)
                ? <button className="btn sm primary" onClick={() => onSettle(t)}>{t.from === me ? 'Pay' : 'Mark received'}</button>
                : <button className="btn sm" onClick={() => onSettle(t)}>Record</button>}</span>
          </div>
        ))}
        <p className="muted small">“Pay” opens your UPI app when the other person has added a UPI ID, or lets you log cash. Either side can record a payment.</p>
      </section>

      {data.settlements.length > 0 && (
        <section className="card stack">
          <h3>Payments made</h3>
          {data.settlements.map((s) => (
            <div className="row between" key={s.id}>
              <div><b>{s.from_user === me ? 'You' : s.from_name} paid {s.to_user === me ? 'you' : s.to_name}</b>
                <div className="muted small">{dayLabel(s.created_at)} · {methodLabel(s.method)}{s.note ? ` · ${s.note}` : ''}</div></div>
              <b>{money(s.amount)}</b>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function SummaryTab({ data, group, me }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [copied, setCopied] = useState(false);
  const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const label = month.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const list = data.expenses.filter((e) => String(e.expense_date).startsWith(key));
  const total = list.reduce((s, e) => s + Number(e.amount), 0);

  const people = data.members.map((m) => {
    const paidList = list.filter((e) => e.paid_by === m.user_id);
    const paid = paidList.reduce((s, e) => s + Number(e.amount), 0);
    const share = list.reduce((s, e) => s + Number(e.splits.find((x) => x.user_id === m.user_id)?.amount || 0), 0);
    return { ...m, paidList, paid, share, net: paid - share };
  });
  const cats = Object.entries(list.reduce((a, e) => ({ ...a, [e.category]: (a[e.category] || 0) + Number(e.amount) }), {})).sort((a, b) => b[1] - a[1]);

  const text = [
    `${group.name} · ${label}`, `Total spent: ${money(total)}`, '',
    ...people.filter((p) => p.paid > 0).flatMap((p) => [`${p.full_name} paid ${money(p.paid)}:`, ...p.paidList.map((e) => `  • ${e.description} ${money(e.amount)} (${dayLabel(e.expense_date)}, ${methodLabel(e.method)})`)]),
    '', 'Each person\'s share:', ...people.filter((p) => p.share > 0).map((p) => `  ${p.full_name}: ${money(p.share)}`),
  ].join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* clipboard blocked */ } };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between">
        <div className="row"><button className="icon-btn sm" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
          <h3>{label}</h3>
          <button className="icon-btn sm" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button></div>
        <button className="btn sm" onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy summary</>}</button>
      </div>

      <div className="stats">
        <div className="stat amber"><b>{money(total)}</b><span>Spent in {label.split(' ')[0]}</span></div>
        <div className="stat mint"><b>{list.length}</b><span>Expenses</span></div>
      </div>

      {list.length === 0 ? <div className="card empty">No expenses in {label}.</div> : (
        <>
          <section className="card stack">
            <h3>By person</h3>
            <div className="table-wrap">
              <table className="sum">
                <thead><tr><th>Person</th><th>Paid</th><th>Their share</th><th>Net</th></tr></thead>
                <tbody>{people.map((p) => (
                  <tr key={p.user_id}><td><b>{p.user_id === me ? 'You' : p.full_name}</b></td><td>{money(p.paid)}</td><td>{money(p.share)}</td>
                    <td className={Math.abs(p.net) < 0.005 ? 'muted' : p.net > 0 ? 'pos' : 'neg'}><b>{Math.abs(p.net) < 0.005 ? '–' : `${p.net > 0 ? '+' : '−'}${money(p.net)}`}</b></td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className="card stack">
            <h3>Where the money went</h3>
            {cats.map(([c, v]) => { const Icon = catIcon(c); return (
              <div className="bal-row" key={c}><span className="icon-tile violet sm"><Icon size={16} /></span><b className="name">{c}</b>
                <span className="bar"><i className="pos" style={{ width: `${(v / total) * 100}%`, background: 'var(--violet)' }} /></span><b>{money(v)}</b></div>
            ); })}
          </section>

          {people.filter((p) => p.paid > 0).map((p) => (
            <section className="card stack" key={p.user_id}>
              <div className="row between"><h3>{p.user_id === me ? 'You' : p.full_name} paid</h3><b>{money(p.paid)}</b></div>
              {p.paidList.map((e) => (
                <div className="row between" key={e.id}><div><b>{e.description}</b><div className="muted small">{dayLabel(e.expense_date)} · {e.category} · {methodLabel(e.method)}</div></div><b>{money(e.amount)}</b></div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function GroupDetail({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('expenses');
  const [modal, setModal] = useState(null); // 'expense' | 'member' | { transfer }
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData((await groupsAPI.get(id)).data); } catch (err) { setError(err.response?.data?.error || 'Failed to load the group'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="empty"><h3>{error}</h3><button className="btn primary" onClick={() => navigate('/groups')}>Back to groups</button></div>;
  if (!data) return <div className="empty"><div className="spinner" style={{ margin: '60px auto' }} /></div>;

  const { group, members } = data;
  const done = () => { setModal(null); load(); };

  return (
    <div className="group-page">
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => navigate('/groups')} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="grow"><h1 style={{ fontSize: 28 }}>{group.name}</h1>{group.description && <p className="muted">{group.description}</p>}</div>
      </div>

      <div className="card row between wrap group-head">
        <div className="row"><Avatars members={members} max={5} />
          <button className="btn sm" onClick={() => setModal('member')}><UserPlus size={14} /> Add</button></div>
        <div className="row" style={{ gap: 18 }}>
          <span><small className="muted">Total spent</small><b className="spent">{money(group.total_spent)}</b></span>
          <BalanceTag value={group.my_balance} />
        </div>
      </div>

      {group.invite_code && <div style={{ marginTop: 14 }}><InviteCard group={group} onChanged={load} /></div>}

      <div className="tabs" style={{ margin: '16px 0' }} role="tablist">
        {[['expenses', 'Expenses'], ['balances', 'Balances'], ['summary', 'Summary'], ['chat', 'Chat']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'expenses' && <ExpensesTab data={data} me={user.id} onAdd={() => setModal('expense')} onChanged={load} />}
      {tab === 'balances' && <BalancesTab data={data} me={user.id} onSettle={(t) => setModal({ transfer: t })} />}
      {tab === 'summary' && <SummaryTab data={data} group={group} me={user.id} />}
      {tab === 'chat' && <GroupChat type="group" id={group.id} user={user} />}

      {modal === 'expense' && <AddExpenseModal group={group} members={members} me={user.id} onClose={() => setModal(null)} onSaved={() => { done(); setTab('expenses'); }} />}
      {modal === 'member' && <AddMemberModal groupId={group.id} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.transfer && <SettleModal group={group} members={members} me={user.id} transfer={modal.transfer} onClose={() => setModal(null)} onSaved={() => { done(); setTab('balances'); }} />}
    </div>
  );
}

export default GroupDetail;
