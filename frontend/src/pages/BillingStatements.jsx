// ================================================================
// BillingStatements (P5c)
// Monthly billing statements + AR tracking
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';

const STATUS_COLORS = { draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green', overdue: 'badge-orange', void: 'badge-gray' };

export default function BillingStatements() {
  const [stmts, setStmts] = useState({ rows: [], total: 0 });
  const [ar, setAr] = useState(null);
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const limit = 25;

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit, offset });
    if (status) qs.set('status', status);
    Promise.all([
      api.get(`/statements?${qs}`),
      api.get('/reports/ar-summary'),
    ]).then(([s, a]) => { setStmts(s); setAr(a); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, offset]);
  useEffect(() => { load(); }, [load]);

  const pages = Math.ceil((stmts.total || 0) / limit);

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Billing Statements</h1>
        <button className="btn btn-primary" onClick={() => setShowGenerate(true)}>Generate Statement</button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      {ar && (
        <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase' }}>Total AR</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy)', fontFamily: 'var(--font-heading)' }}>${Number(ar.total_ar).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div><div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase' }}>Overdue</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: ar.overdue > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-heading)' }}>${Number(ar.overdue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div><div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase' }}>Accounts</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy)', fontFamily: 'var(--font-heading)' }}>{ar.accounts}</div></div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem' }}>
        {['', 'draft', 'sent', 'paid', 'overdue'].map((s) => (
          <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setStatus(s); setOffset(0); }}>{s || 'All'}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <span className="spinner" /> : (
          <table className="entity-table">
            <thead><tr><th>#</th><th>Customer</th><th>Period</th><th>Charges</th><th>Payments</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(stmts.rows || []).map((s) => (
                <tr key={s.statement_id}>
                  <td className="mono">{s.statement_number}</td>
                  <td>{s.first_name} {s.last_name}</td>
                  <td className="mono" style={{ fontSize: '0.8125rem' }}>{s.period_start} to {s.period_end}</td>
                  <td className="mono">${Number(s.charges).toFixed(2)}</td>
                  <td className="mono">${Number(s.payments).toFixed(2)}</td>
                  <td className="mono" style={{ fontWeight: 600, color: Number(s.closing_balance) > 0 ? 'var(--red)' : 'var(--green)' }}>${Number(s.closing_balance).toFixed(2)}</td>
                  <td className="mono">{s.due_date}</td>
                  <td><span className={`badge ${STATUS_COLORS[s.status] || ''}`}>{s.status}</span></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => loadDetail(s.statement_id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
          <span className="text-muted">Page {Math.floor(offset / limit) + 1} of {pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={Math.floor(offset / limit) + 1 >= pages} onClick={() => setOffset(offset + limit)}>Next</button>
        </div>
      )}

      {showGenerate && <GenerateModal onCreated={(id) => { setShowGenerate(false); setMsg('Statement generated.'); load(); }} onCancel={() => setShowGenerate(false)} onError={setError} />}
      {detail && <DetailModal stmt={detail} onClose={() => setDetail(null)} />}
    </div>
  );

  async function loadDetail(id) {
    try { const s = await api.get(`/statements/${id}`); setDetail(s); }
    catch (e) { setError(e.message); }
  }
}

function GenerateModal({ onCreated, onCancel, onError }) {
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(firstOfMonth - 1);
  const [periodStart, setPeriodStart] = useState(new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(lastMonth.toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const handleSearch = async (q) => {
    setSearch(q);
    if (q.length < 2) { setCustomers([]); return; }
    try { const d = await api.get(`/customers/search?q=${encodeURIComponent(q)}&limit=10`); setCustomers(d.customers || []); }
    catch {}
  };

  const handleSave = async () => {
    if (!customerId) { onError('Select a customer.'); return; }
    setSaving(true);
    try {
      const r = await api.post('/statements/generate', { customer_id: Number(customerId), period_start: periodStart, period_end: periodEnd });
      onCreated(r.statement_id);
    } catch (e) { onError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content">
        <div className="modal-header">Generate Statement</div>
        <div className="modal-body">
          <div className="form-field" style={{ position: 'relative', marginBottom: '0.75rem' }}>
            <label className="label">Customer</label>
            <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Search..." />
            {customers.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--mgray)', borderRadius: 'var(--radius-sm)', zIndex: 50, maxHeight: 150, overflowY: 'auto' }}>
                {customers.map((c) => (
                  <div key={c.customer_id} style={{ padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}
                    onClick={() => { setCustomerId(c.customer_id); setSearch(`${c.first_name} ${c.last_name}`); setCustomers([]); }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--lgray)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                    {c.first_name} {c.last_name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="form-grid">
            <div className="form-field"><label className="label">Period Start</label><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
            <div className="form-field"><label className="label">Period End</label><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !customerId}>
            {saving ? <span className="spinner" /> : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ stmt, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: 700 }}>
        <div className="modal-header">{stmt.statement_number}</div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.875rem' }}>
            <div><strong>Customer:</strong> {stmt.first_name} {stmt.last_name}</div>
            <div><strong>Period:</strong> {stmt.period_start} to {stmt.period_end}</div>
            <div><strong>Due:</strong> {stmt.due_date}</div>
          </div>
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              <tr style={{ background: 'var(--lgray)' }}><td colSpan={4}><strong>Opening Balance</strong></td><td style={{ textAlign: 'right' }} className="mono">${Number(stmt.opening_balance).toFixed(2)}</td></tr>
              {(stmt.line_items || []).map((li) => (
                <tr key={li.line_id}>
                  <td className="mono">{li.line_date}</td>
                  <td style={{ textTransform: 'capitalize' }}>{li.line_type}</td>
                  <td className="mono">{li.reference || ''}</td>
                  <td>{li.description || ''}</td>
                  <td style={{ textAlign: 'right', color: Number(li.amount) < 0 ? 'var(--green)' : 'inherit' }} className="mono">${Number(li.amount).toFixed(2)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--lgray)', fontWeight: 700 }}><td colSpan={4}><strong>Closing Balance</strong></td>
                <td style={{ textAlign: 'right', color: Number(stmt.closing_balance) > 0 ? 'var(--red)' : 'var(--green)' }} className="mono">${Number(stmt.closing_balance).toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
