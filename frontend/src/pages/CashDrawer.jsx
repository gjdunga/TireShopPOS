// ================================================================
// CashDrawer (P2f)
// Open drawer, record transactions, close with variance.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import './SupportOps.css';

const TXN_TYPES = [
  { value: 'sale', label: 'Sale (Cash In)' },
  { value: 'refund', label: 'Refund (Cash Out)' },
  { value: 'payout', label: 'Payout (Cash Out)' },
  { value: 'drop', label: 'Safe Drop (Cash Out)' },
  { value: 'adjustment', label: 'Adjustment' },
];

export default function CashDrawer() {
  const { can } = useAuth();
  const [data, setData] = useState({ open: false, drawer: null, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/cash-drawer/today')
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Cash Drawer</h1>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      {!data.open ? (
        <OpenDrawerPanel onOpened={() => { setMsg('Drawer opened.'); load(); }} onError={setError} canOpen={can('CASH_DRAWER_OPEN')} />
      ) : (
        <div className="ops-two-col">
          {/* Left: drawer info + transactions */}
          <div>
            <DrawerInfo drawer={data.drawer} />
            <div className="card" style={{ marginTop: '1rem' }}>
              <SectionTitle>Transactions</SectionTitle>
              <TransactionList transactions={data.transactions} />
              <AddTransaction drawerId={data.drawer?.drawer_id} onAdded={() => { setMsg('Transaction recorded.'); load(); }} onError={setError} />
            </div>
          </div>

          {/* Right: close drawer */}
          <div>
            {can('CASH_DRAWER_CLOSE') && (
              <CloseDrawerPanel drawer={data.drawer}
                onClosed={() => { setMsg('Drawer closed.'); load(); }}
                onError={setError} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OpenDrawerPanel({ onOpened, onError, canOpen }) {
  const [balance, setBalance] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpen = async () => {
    if (!balance || Number(balance) < 0) { onError('Enter a valid opening balance.'); return; }
    setSaving(true);
    try {
      await api.post('/cash-drawer/open', { opening_balance: balance });
      onOpened();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  if (!canOpen) {
    return <div className="card"><p className="text-muted">No open cash drawer today. You do not have permission to open one.</p></div>;
  }

  return (
    <div className="card" style={{ maxWidth: 400 }}>
      <SectionTitle>Open Cash Drawer</SectionTitle>
      <p style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.75rem' }}>
        Count the cash in the drawer and enter the opening balance.
      </p>
      <div className="form-field">
        <label className="label">Opening Balance ($)</label>
        <input type="number" step="0.01" min="0" value={balance} onChange={(e) => setBalance(e.target.value)}
          placeholder="0.00" autoFocus />
      </div>
      <button className="btn btn-primary" onClick={handleOpen} disabled={saving || !balance} style={{ marginTop: '0.75rem' }}>
        {saving ? <span className="spinner" /> : 'Open Drawer'}
      </button>
    </div>
  );
}

function DrawerInfo({ drawer }) {
  if (!drawer) return null;
  return (
    <div className="card">
      <SectionTitle>Today's Drawer</SectionTitle>
      <div className="ops-stats">
        <div className="ops-stat">
          <div className="label">Opening Balance</div>
          <div className="ops-stat-val">${Number(drawer.opening_balance || 0).toFixed(2)}</div>
        </div>
        <div className="ops-stat">
          <div className="label">Status</div>
          <div className="ops-stat-val">
            <span className={`badge ${drawer.status === 'open' ? 'badge-green' : 'badge-gray'}`}>
              {drawer.status}
            </span>
          </div>
        </div>
        <div className="ops-stat">
          <div className="label">Opened At</div>
          <div className="ops-stat-val mono" style={{ fontSize: '0.875rem' }}>{drawer.opened_at?.slice(0, 16).replace('T', ' ')}</div>
        </div>
      </div>
    </div>
  );
}

function TransactionList({ transactions }) {
  if (!transactions || transactions.length === 0) {
    return <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>No transactions yet.</p>;
  }

  return (
    <table className="entity-table" style={{ marginBottom: '0.75rem' }}>
      <thead>
        <tr><th>Time</th><th>Type</th><th>Amount</th><th>Description</th><th>By</th></tr>
      </thead>
      <tbody>
        {transactions.map((t) => (
          <tr key={t.txn_id}>
            <td className="mono">{t.created_at?.slice(11, 16)}</td>
            <td style={{ textTransform: 'capitalize' }}>{(t.txn_type || '').replace(/_/g, ' ')}</td>
            <td className="mono" style={{ color: Number(t.amount) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
              {Number(t.amount) >= 0 ? '+' : ''}{Number(t.amount).toFixed(2)}
            </td>
            <td>{t.description || '\u2014'}</td>
            <td>{t.created_by_name || '\u2014'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddTransaction({ drawerId, onAdded, onError }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ txn_type: 'sale', amount: '', description: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.amount || Number(form.amount) === 0) { onError('Enter an amount.'); return; }
    setSaving(true);
    try {
      const amt = ['refund', 'payout', 'drop'].includes(form.txn_type)
        ? -Math.abs(Number(form.amount))
        : Number(form.amount);
      await api.post('/cash-drawer/transaction', { ...form, amount: amt });
      setForm({ txn_type: 'sale', amount: '', description: '' });
      setShow(false);
      onAdded();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  if (!show) {
    return <button className="btn btn-ghost btn-sm" onClick={() => setShow(true)}>+ Add Transaction</button>;
  }

  return (
    <div style={{ background: 'var(--lgray)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
      <div className="form-grid">
        <div className="form-field">
          <label className="label">Type</label>
          <select value={form.txn_type} onChange={(e) => setForm((p) => ({ ...p, txn_type: e.target.value }))}>
            {TXN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className="label">Amount ($)</label>
          <input type="number" step="0.01" min="0" value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
        </div>
      </div>
      <div className="form-field" style={{ marginTop: '0.5rem' }}>
        <label className="label">Description</label>
        <input type="text" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Record'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShow(false)}>Cancel</button>
      </div>
    </div>
  );
}

function CloseDrawerPanel({ drawer, onClosed, onError }) {
  const [closingCount, setClosingCount] = useState('');
  const [saving, setSaving] = useState(false);

  const handleClose = async () => {
    if (!closingCount || Number(closingCount) < 0) { onError('Enter the counted cash amount.'); return; }
    if (!confirm('Close the drawer? This cannot be undone.')) return;
    setSaving(true);
    try {
      await api.post('/cash-drawer/close', { closing_count: closingCount });
      onClosed();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
      <SectionTitle>Close Drawer</SectionTitle>
      <p style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.75rem' }}>
        Count all cash in the drawer and enter the total. The system will calculate the expected balance and any variance.
      </p>
      <div className="form-field">
        <label className="label">Counted Cash ($)</label>
        <input type="number" step="0.01" min="0" value={closingCount}
          onChange={(e) => setClosingCount(e.target.value)} placeholder="0.00" />
      </div>
      <button className="btn btn-primary" onClick={handleClose} disabled={saving || !closingCount} style={{ marginTop: '0.75rem' }}>
        {saving ? <span className="spinner" /> : 'Close Drawer'}
      </button>

      {drawer.status === 'closed' && drawer.variance !== null && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: Number(drawer.variance) === 0 ? 'var(--green-lt)' : '#FDE8E8',
          borderRadius: 'var(--radius-sm)' }}>
          <div className="ops-stats">
            <div className="ops-stat">
              <div className="label">Expected</div>
              <div className="ops-stat-val">${Number(drawer.expected_balance || 0).toFixed(2)}</div>
            </div>
            <div className="ops-stat">
              <div className="label">Counted</div>
              <div className="ops-stat-val">${Number(drawer.closing_count || 0).toFixed(2)}</div>
            </div>
            <div className="ops-stat">
              <div className="label">Variance</div>
              <div className="ops-stat-val" style={{ color: Number(drawer.variance) === 0 ? 'var(--green)' : 'var(--red)' }}>
                ${Number(drawer.variance || 0).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', fontWeight: 600,
      color: 'var(--navy)', marginBottom: '0.75rem', letterSpacing: '0.02em' }}>
      {children}
    </h2>
  );
}
