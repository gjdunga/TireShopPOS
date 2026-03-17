// ================================================================
// TireStorage: Seasonal tire storage tracking
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect } from 'react';
import api from '../api/client.js';

export default function TireStorage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ customer_id: '', description: 'Seasonal tire storage', quantity: '4', location_code: '', monthly_rate: '0', stored_at: new Date().toISOString().slice(0, 10) });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => { api.get('/tire-storage').then(d => setItems(d.storage || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, []);

  const handleAdd = async () => {
    try {
      await api.post('/tire-storage', { ...form, customer_id: Number(form.customer_id), quantity: Number(form.quantity), monthly_rate: Number(form.monthly_rate) });
      setMsg('Storage created.'); setAdding(false); load();
    } catch (e) { setMsg(e.message); }
  };

  const handlePickup = async (id) => {
    try {
      await api.patch(`/tire-storage/${id}`, { picked_up_at: new Date().toISOString().slice(0, 10) });
      setMsg('Marked as picked up.'); load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Tire Storage</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>+ New Storage</button>
      </div>
      {msg && <div className="msg" style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#e8f5e9', borderRadius: '4px', fontSize: '0.85rem' }}>{msg}</div>}

      {adding && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-field" style={{ width: '90px' }}><label className="label">Customer ID</label>
              <input type="number" value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))} /></div>
            <div className="form-field" style={{ flex: 1, minWidth: '140px' }}><label className="label">Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="form-field" style={{ width: '60px' }}><label className="label">Qty</label>
              <input type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} /></div>
            <div className="form-field" style={{ width: '90px' }}><label className="label">Location</label>
              <input value={form.location_code} onChange={e => setForm(p => ({ ...p, location_code: e.target.value }))} placeholder="A-3-2" /></div>
            <div className="form-field" style={{ width: '90px' }}><label className="label">$/month</label>
              <input type="number" step="0.01" min="0" value={form.monthly_rate} onChange={e => setForm(p => ({ ...p, monthly_rate: e.target.value }))} /></div>
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>Create</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <p>Loading...</p> : (
        <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
          <thead><tr><th>Customer</th><th>Description</th><th>Qty</th><th>Location</th><th>Stored</th><th>Rate</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map(s => (
              <tr key={s.storage_id}>
                <td>{s.first_name} {s.last_name}</td>
                <td>{s.description}</td>
                <td>{s.quantity}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{s.location_code || 'n/a'}</td>
                <td>{s.stored_at}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{Number(s.monthly_rate) > 0 ? `$${Number(s.monthly_rate).toFixed(2)}` : 'Free'}</td>
                <td>{s.picked_up_at ? <span style={{ color: 'var(--green)' }}>Picked up {s.picked_up_at}</span> : <span className="badge">Stored</span>}</td>
                <td>{!s.picked_up_at && <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.6875rem' }} onClick={() => handlePickup(s.storage_id)}>Mark Pickup</button>}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} style={{ color: '#999' }}>No tires in storage.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
