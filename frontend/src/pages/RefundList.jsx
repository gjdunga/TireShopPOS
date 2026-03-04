// ================================================================
// RefundList (P2f)
// Pending refunds with tiered approval, refund request form.
// Threshold: manager <=$60, owner >$60.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import './SupportOps.css';

const REFUND_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'check', label: 'Check' },
  { value: 'store_credit', label: 'Store Credit' },
  { value: 'other', label: 'Other' },
];

const STATUS_COLORS = {
  pending: 'badge-orange',
  approved: 'badge-green',
  processed: 'badge-blue',
  denied: 'badge-gray',
};

export default function RefundList() {
  const { can } = useAuth();
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showRequest, setShowRequest] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/refunds/pending')
      .then((data) => setRefunds(data.refunds || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (refundId) => {
    if (!confirm('Approve this refund?')) return;
    try {
      await api.post(`/refunds/${refundId}/approve`);
      setMsg('Refund approved.');
      load();
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Refunds</h1>
        {can('REFUND_REQUEST') && (
          <button className="btn btn-primary" onClick={() => setShowRequest(true)}>+ New Refund Request</button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      <div className="card">
        <SectionTitle>Pending Refunds</SectionTitle>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}><span className="spinner" /></div>
        ) : refunds.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>No pending refunds.</p>
        ) : (
          <table className="entity-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Invoice</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reason</th>
                <th>Requested By</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => {
                const isHigh = Number(r.amount) > 60;
                const canApprove = isHigh ? can('REFUND_APPROVE_HIGH') : can('REFUND_APPROVE');

                return (
                  <tr key={r.refund_id}>
                    <td className="mono">{r.refund_id}</td>
                    <td className="mono">{r.invoice_number || `INV #${r.invoice_id}`}</td>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--red)' }}>
                      ${Number(r.amount).toFixed(2)}
                      {isHigh && <span className="badge" style={{ marginLeft: '0.375rem', background: '#FDE8E8', color: 'var(--red)', fontSize: '0.625rem' }}>HIGH</span>}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{(r.refund_method || '').replace(/_/g, ' ')}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.reason}
                    </td>
                    <td>{r.requested_by_name || '\u2014'}</td>
                    <td><span className={`badge ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span></td>
                    <td>
                      {r.status === 'pending' && canApprove && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleApprove(r.refund_id)}>
                          Approve
                        </button>
                      )}
                      {r.status === 'pending' && !canApprove && (
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {isHigh ? 'Owner approval required' : 'Manager approval required'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Refund request modal */}
      {showRequest && (
        <RefundRequestModal
          onCreated={() => { setMsg('Refund requested.'); setShowRequest(false); load(); }}
          onClose={() => setShowRequest(false)}
          onError={setError}
        />
      )}
    </div>
  );
}

function RefundRequestModal({ onCreated, onClose, onError }) {
  const [form, setForm] = useState({
    invoice_id: '', amount: '', reason: '', refund_method: 'cash',
  });
  const [validation, setValidation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);

  const handleChange = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  // Validate before submission (anti-split check)
  const handleValidate = async () => {
    if (!form.invoice_id || !form.amount) { onError('Enter invoice ID and amount.'); return; }
    setValidating(true);
    try {
      const result = await api.post('/refunds/validate', {
        invoice_id: Number(form.invoice_id),
        amount: form.amount,
      });
      setValidation(result);
    } catch (err) { onError(err.message); }
    finally { setValidating(false); }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.post('/refunds', {
        invoice_id: Number(form.invoice_id),
        amount: form.amount,
        reason: form.reason,
        refund_method: form.refund_method,
      });
      onCreated();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">Request Refund</div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-field">
              <label className="label">Invoice ID</label>
              <input type="number" value={form.invoice_id} onChange={handleChange('invoice_id')} />
            </div>
            <div className="form-field">
              <label className="label">Amount ($)</label>
              <input type="number" step="0.01" min="0.01" value={form.amount} onChange={handleChange('amount')} />
            </div>
            <div className="form-field">
              <label className="label">Method</label>
              <select value={form.refund_method} onChange={handleChange('refund_method')}>
                {REFUND_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Reason</label>
              <textarea rows={2} value={form.reason} onChange={handleChange('reason')} required
                style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
                  borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.9375rem' }} />
            </div>
          </div>

          {/* Validation result */}
          {!validation && (
            <button className="btn btn-ghost" onClick={handleValidate} disabled={validating || !form.invoice_id || !form.amount}
              style={{ marginTop: '0.75rem' }}>
              {validating ? <span className="spinner" /> : 'Validate'}
            </button>
          )}

          {validation && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem',
              background: validation.valid ? 'var(--green-lt)' : '#FDE8E8',
              borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
              {validation.valid ? (
                <div>
                  <strong>Valid.</strong>
                  {' '}Requires {Number(form.amount) > 60 ? 'owner' : 'manager'} approval.
                  {validation.anti_split_warning && (
                    <div style={{ marginTop: '0.25rem', color: 'var(--orange)', fontWeight: 500 }}>
                      Warning: Multiple refund requests detected for this invoice (anti-split check).
                    </div>
                  )}
                </div>
              ) : (
                <div><strong>Invalid:</strong> {validation.reason || 'Refund cannot be processed.'}</div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}
            disabled={saving || !form.reason.trim() || !validation?.valid}>
            {saving ? <span className="spinner" /> : 'Submit Request'}
          </button>
        </div>
      </div>
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
