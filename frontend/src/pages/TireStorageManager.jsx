// ================================================================
// TireStorage (P5d)
// Customer tire storage management + billing
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

export default function TireStorage() {
  const [tab, setTab] = useState('stored');
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/tire-storage?status=${tab}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const handlePickup = async (id) => {
    if (!confirm('Record pickup for this storage?')) return;
    try { await api.post(`/tire-storage/${id}/pickup`); setMsg('Pickup recorded.'); load(); }
    catch (e) { setError(e.message); }
  };

  const handleGenerateBilling = async () => {
    try {
      const r = await api.post('/tire-storage/generate-billing', { billing_month: new Date().toISOString().slice(0, 8) + '01' });
      setMsg(`Billing generated: ${r.created} new charges.`); load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Tire Storage</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={handleGenerateBilling}>Generate Monthly Billing</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Store Tires</button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem' }}>
        {['stored', 'picked_up', 'abandoned'].map((s) => (
          <button key={s} className={`btn btn-sm ${tab === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(s)} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <span className="spinner" /> : (data.rows || []).length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>No items.</p>
        ) : (
          <table className="entity-table">
            <thead><tr><th>Customer</th><th>Description</th><th>Qty</th><th>Location</th><th>Stored</th><th>Rate</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.rows.map((s) => (
                <tr key={s.storage_id}>
                  <td style={{ fontWeight: 500 }}>{s.first_name} {s.last_name}</td>
                  <td>{s.description}</td>
                  <td className="mono">{s.quantity}</td>
                  <td className="mono">{s.location_code || '\u2014'}</td>
                  <td className="mono">{s.stored_at}</td>
                  <td className="mono">{Number(s.monthly_rate) > 0 ? '$' + Number(s.monthly_rate).toFixed(2) + '/mo' : 'Free'}</td>
                  <td><span className={`badge ${s.status === 'stored' ? 'badge-blue' : s.status === 'picked_up' ? 'badge-green' : 'badge-gray'}`}>{s.status.replace('_', ' ')}</span></td>
                  <td>{s.status === 'stored' && <button className="btn btn-ghost btn-sm" onClick={() => handlePickup(s.storage_id)}>Pickup</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddStorageModal onCreated={() => { setShowAdd(false); setMsg('Tires stored.'); load(); }} onCancel={() => setShowAdd(false)} onError={setError} />}
    </div>
  );
}

function AddStorageModal({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ customer_id: '', description: '', quantity: '4', location_code: '', monthly_rate: '0', notes: '' });
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const handleSearch = async (q) => {
    setSearch(q);
    if (q.length < 2) { setCustomers([]); return; }
    try { const d = await api.get(`/customers/search?q=${encodeURIComponent(q)}&limit=10`); setCustomers(d.customers || []); }
    catch {}
  };

  const handleSave = async () => {
    if (!form.customer_id || !form.description.trim()) { onError('Customer and description required.'); return; }
    setSaving(true);
    try { await api.post('/tire-storage', form); onCreated(); }
    catch (e) { onError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content">
        <div className="modal-header">Store Customer Tires</div>
        <div className="modal-body">
          <div className="form-field" style={{ position: 'relative', marginBottom: '0.75rem' }}>
            <label className="label">Customer</label>
            <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Search..." />
            {customers.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--mgray)', borderRadius: 'var(--radius-sm)', zIndex: 50, maxHeight: 150, overflowY: 'auto' }}>
                {customers.map((c) => (
                  <div key={c.customer_id} style={{ padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}
                    onClick={() => { setForm((p) => ({ ...p, customer_id: c.customer_id })); setSearch(`${c.first_name} ${c.last_name}`); setCustomers([]); }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--lgray)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                    {c.first_name} {c.last_name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="form-grid">
            <div className="form-field" style={{ gridColumn: '1 / -1' }}><label className="label">Description</label>
              <input type="text" value={form.description} onChange={ch('description')} placeholder="e.g. 4x Blizzak 225/65R17 winter tires" /></div>
            <div className="form-field"><label className="label">Quantity</label><input type="number" min="1" value={form.quantity} onChange={ch('quantity')} /></div>
            <div className="form-field"><label className="label">Location Code</label><input type="text" value={form.location_code} onChange={ch('location_code')} placeholder="e.g. Rack B-3" /></div>
            <div className="form-field"><label className="label">Monthly Rate ($)</label><input type="number" step="0.01" value={form.monthly_rate} onChange={ch('monthly_rate')} /></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Store'}</button>
        </div>
      </div>
    </div>
  );
}
