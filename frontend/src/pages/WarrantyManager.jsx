// ================================================================
// WarrantyManager (P3b)
// Warranty policies admin + claims lifecycle
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';

const CLAIM_STATUS_COLORS = {
  filed: 'badge-blue', reviewing: 'badge-orange', approved: 'badge-green',
  denied: 'badge-gray', paid: 'badge-green',
};

export default function WarrantyManager() {
  const [tab, setTab] = useState('policies');
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Warranty Management</h1>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', borderBottom: '1px solid var(--lgray)', paddingBottom: '0.75rem' }}>
        <button className={`btn btn-sm ${tab === 'policies' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('policies')}>Policies</button>
        <button className={`btn btn-sm ${tab === 'claims' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('claims')}>Claims</button>
      </div>
      {tab === 'policies' && <PoliciesTab />}
      {tab === 'claims' && <ClaimsTab />}
    </div>
  );
}

function PoliciesTab() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/warranty-policies?active_only=0').then((d) => setPolicies(d.policies || [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleToggle = async (id, active) => {
    try { await api.patch(`/warranty-policies/${id}`, { is_active: active ? 0 : 1 }); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ New Policy</button>
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>Code</th><th>Name</th><th>Coverage</th><th>Price</th><th>Max Claim</th><th>Deductible</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.policy_id}>
                <td className="mono">{p.policy_code}</td>
                <td style={{ fontWeight: 500 }}>{p.policy_name}</td>
                <td>{p.coverage_months} mo{p.coverage_miles ? ` / ${Number(p.coverage_miles).toLocaleString()} mi` : ''}</td>
                <td className="mono">${Number(p.price).toFixed(2)}{p.is_per_tire == 1 ? '/tire' : ''}</td>
                <td className="mono">{p.max_claim_amount ? '$' + Number(p.max_claim_amount).toFixed(2) : 'N/A'}</td>
                <td className="mono">${Number(p.deductible).toFixed(2)}</td>
                <td>{p.is_active == 1 ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => handleToggle(p.policy_id, p.is_active == 1)}>
                  {p.is_active == 1 ? 'Deactivate' : 'Activate'}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showAdd && <PolicyForm onCreated={() => { setShowAdd(false); setMsg('Policy created.'); load(); }}
        onCancel={() => setShowAdd(false)} onError={setError} />}
    </div>
  );
}

function PolicyForm({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({
    policy_name: '', policy_code: '', coverage_months: '12', coverage_miles: '',
    price: '', is_per_tire: '1', terms_text: '', exclusions_text: '',
    max_claim_amount: '', deductible: '0',
  });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/warranty-policies', { ...form,
        coverage_months: Number(form.coverage_months), coverage_miles: form.coverage_miles ? Number(form.coverage_miles) : null,
        is_per_tire: Number(form.is_per_tire), max_claim_amount: form.max_claim_amount || null });
      onCreated();
    } catch (e) { onError(e.message); } finally { setSaving(false); }
  };

  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const ta = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
    borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' };

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>New Warranty Policy</h3>
      <div className="form-grid">
        <div className="form-field"><label className="label">Policy Name</label><input type="text" value={form.policy_name} onChange={ch('policy_name')} /></div>
        <div className="form-field"><label className="label">Code (unique)</label><input type="text" value={form.policy_code} onChange={ch('policy_code')} /></div>
        <div className="form-field"><label className="label">Coverage (months)</label><input type="number" value={form.coverage_months} onChange={ch('coverage_months')} /></div>
        <div className="form-field"><label className="label">Coverage (miles)</label><input type="number" value={form.coverage_miles} onChange={ch('coverage_miles')} placeholder="Optional" /></div>
        <div className="form-field"><label className="label">Price</label><input type="number" step="0.01" value={form.price} onChange={ch('price')} /></div>
        <div className="form-field"><label className="label">Max Claim Amount</label><input type="number" step="0.01" value={form.max_claim_amount} onChange={ch('max_claim_amount')} /></div>
        <div className="form-field"><label className="label">Deductible</label><input type="number" step="0.01" value={form.deductible} onChange={ch('deductible')} /></div>
        <div className="form-field"><label className="label">Per Tire?</label>
          <select value={form.is_per_tire} onChange={ch('is_per_tire')}><option value="1">Yes</option><option value="0">No</option></select></div>
        <div className="form-field" style={{ gridColumn: '1 / -1' }}><label className="label">Terms</label>
          <textarea rows={4} value={form.terms_text} onChange={ch('terms_text')} style={ta} /></div>
        <div className="form-field" style={{ gridColumn: '1 / -1' }}><label className="label">Exclusions</label>
          <textarea rows={3} value={form.exclusions_text} onChange={ch('exclusions_text')} style={ta} /></div>
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Create'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ClaimsTab() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [claims, setClaims] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const limit = 25;

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit, offset });
    if (status) qs.set('status', status);
    api.get(`/warranty-claims?${qs}`).then(setClaims).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [status, offset]);
  useEffect(() => { load(); }, [load]);

  const handleReview = async (id, action, reason) => {
    try {
      await api.post(`/warranty-claims/${id}/review`, { action, reason });
      setMsg(`Claim ${action}d.`); load();
    } catch (e) { setError(e.message); }
  };

  const handlePay = async (id, amount) => {
    try {
      await api.post(`/warranty-claims/${id}/pay`, { amount });
      setMsg('Claim paid.'); load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem' }}>
        {['', 'filed', 'reviewing', 'approved', 'denied', 'paid'].map((s) => (
          <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setStatus(s); setOffset(0); }}>{s || 'All'}</button>
        ))}
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>ID</th><th>Customer</th><th>Policy</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(claims.rows || []).map((c) => (
              <tr key={c.claim_id}>
                <td className="mono">{c.claim_id}</td>
                <td>{c.first_name} {c.last_name}</td>
                <td>{c.policy_code}</td>
                <td className="mono">{c.claim_date}</td>
                <td className="mono" style={{ fontWeight: 600 }}>${Number(c.claim_amount).toFixed(2)}</td>
                <td><span className={`badge ${CLAIM_STATUS_COLORS[c.status] || ''}`}>{c.status}</span></td>
                <td>
                  {c.status === 'filed' && can('REFUND_APPROVE') && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleReview(c.claim_id, 'approve')}>Approve</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        const reason = prompt('Denial reason:');
                        if (reason) handleReview(c.claim_id, 'deny', reason);
                      }}>Deny</button>
                    </div>
                  )}
                  {c.status === 'approved' && can('REFUND_APPROVE') && (
                    <button className="btn btn-primary btn-sm" onClick={() => handlePay(c.claim_id, c.claim_amount)}>Pay</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
