// ================================================================
// DisposalLog: Tire disposal tracking (CDPHE compliance)
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect } from 'react';
import api from '../api/client.js';

export default function DisposalLog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ disposal_date: new Date().toISOString().slice(0, 10), quantity: '1', hauler_name: '', manifest_number: '', notes: '' });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => { api.get('/disposals').then(d => setItems(d.disposals || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, []);

  const handleAdd = async () => {
    try {
      await api.post('/disposals', { ...form, quantity: Number(form.quantity) });
      setMsg('Disposal logged.'); setAdding(false); load();
    } catch (e) { setMsg(e.message); }
  };

  const totalDisposed = items.reduce((sum, d) => sum + Number(d.quantity || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Tire Disposal Log</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>+ Log Disposal</button>
      </div>
      <p style={{ fontSize: '0.8125rem', color: '#666', marginBottom: '1rem' }}>
        Colorado CDPHE requires documentation of all waste tire disposals. Total disposed: <b>{totalDisposed}</b> tires.
      </p>
      {msg && <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#e8f5e9', borderRadius: '4px', fontSize: '0.85rem' }}>{msg}</div>}

      {adding && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-field" style={{ width: '120px' }}><label className="label">Date</label>
              <input type="date" value={form.disposal_date} onChange={e => setForm(p => ({ ...p, disposal_date: e.target.value }))} /></div>
            <div className="form-field" style={{ width: '60px' }}><label className="label">Qty</label>
              <input type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} /></div>
            <div className="form-field" style={{ flex: 1, minWidth: '130px' }}><label className="label">Hauler</label>
              <input value={form.hauler_name} onChange={e => setForm(p => ({ ...p, hauler_name: e.target.value }))} placeholder="Hauler company name" /></div>
            <div className="form-field" style={{ width: '130px' }}><label className="label">Manifest #</label>
              <input value={form.manifest_number} onChange={e => setForm(p => ({ ...p, manifest_number: e.target.value }))} /></div>
            <div className="form-field" style={{ flex: 1, minWidth: '130px' }}><label className="label">Notes</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>Log</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <p>Loading...</p> : (
        <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
          <thead><tr><th>Date</th><th>Qty</th><th>Hauler</th><th>Manifest #</th><th>Notes</th><th>Logged By</th></tr></thead>
          <tbody>
            {items.map(d => (
              <tr key={d.disposal_id}>
                <td>{d.disposal_date}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{d.quantity}</td>
                <td>{d.hauler_name || 'n/a'}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{d.manifest_number || 'n/a'}</td>
                <td>{d.notes || ''}</td>
                <td>{d.logged_by_name || 'System'}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} style={{ color: '#999' }}>No disposal records.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
