export const money = (n) => {
  const v = Number(n) || 0;
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return `₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
};

// Who pays whom to settle everything: repeatedly match the biggest debtor with the biggest creditor.
// balances: [{ user_id, full_name, balance }] where balance > 0 means the group owes that person.
export const simplifyDebts = (balances) => {
  const eps = 0.005;
  const cr = balances.filter((b) => b.balance > eps).map((b) => ({ ...b })).sort((a, b) => b.balance - a.balance);
  const db = balances.filter((b) => b.balance < -eps).map((b) => ({ ...b, balance: -b.balance })).sort((a, b) => b.balance - a.balance);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < db.length && j < cr.length) {
    const amount = Math.min(db[i].balance, cr[j].balance);
    out.push({ from: db[i].user_id, from_name: db[i].full_name, to: cr[j].user_id, to_name: cr[j].full_name, amount: Math.round(amount * 100) / 100 });
    db[i].balance -= amount;
    cr[j].balance -= amount;
    if (db[i].balance < eps) i++;
    if (cr[j].balance < eps) j++;
  }
  return out;
};

export const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'app', label: 'In-app' },
  { value: 'other', label: 'Other' },
];
export const methodLabel = (m) => METHODS.find((x) => x.value === m)?.label || m;
