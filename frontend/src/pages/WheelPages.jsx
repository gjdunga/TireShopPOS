// ================================================================
// WheelSearch + WheelDetail (P3c)
// Wheel inventory management with fitment mapping
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../api/client.js';

// --- Wheel Search ---
export function WheelSearch() {
  const [filters, setFilters] = useState({ diameter: '', bolt_pattern: '', brand: '', material: '', condition: '' });
  const [data, setData] = useState({ rows: [], total: 0 });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 25;

  const search = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit, offset });
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
    api.get(`/wheels?${qs}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [filters, offset]);

  useEffect(() => { search(); }, [search]);

  const ch = (f) => (e) => { setFilters((p) => ({ ...p, [f]: e.target.value })); setOffset(0); };

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Wheels</h1>
        <Link to="/wheels/new" className="btn btn-primary">+ Add Wheel</Link>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="text" value={filters.diameter} onChange={ch('diameter')} placeholder="Diameter" style={{ width: 80 }} />
          <input type="text" value={filters.bolt_pattern} onChange={ch('bolt_pattern')} placeholder="Bolt pattern" style={{ width: 100 }} />
          <input type="text" value={filters.brand} onChange={ch('brand')} placeholder="Brand" style={{ width: 100 }} />
          <select value={filters.material} onChange={ch('material')} style={{ width: 100 }}>
            <option value="">Material</option>
            {['steel', 'alloy', 'forged', 'carbon'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filters.condition} onChange={ch('condition')} style={{ width: 100 }}>
            <option value="">Condition</option><option value="new">New</option><option value="used">Used</option>
          </select>
        </div>
      </div>
      <div className="card">
        {loading ? <div style={{ textAlign: 'center', padding: '2rem' }}><span className="spinner" /></div> :
        data.rows?.length === 0 ? <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>No wheels found.</p> : (
          <table className="entity-table">
            <thead><tr><th>Brand/Model</th><th>Size</th><th>Bolt</th><th>Material</th><th>Cond</th><th>Qty</th><th>Price</th><th></th></tr></thead>
            <tbody>
              {data.rows.map((w) => (
                <tr key={w.wheel_id}>
                  <td style={{ fontWeight: 500 }}>{[w.brand, w.model].filter(Boolean).join(' ') || '\u2014'}</td>
                  <td className="mono">{w.diameter}"{w.width ? ' x ' + w.width + '"' : ''}</td>
                  <td className="mono">{w.bolt_pattern || '\u2014'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{w.material}</td>
                  <td><span className={`badge ${w.condition === 'new' ? 'badge-green' : 'badge-orange'}`}>{w.condition}</span></td>
                  <td className="mono">{w.quantity}</td>
                  <td className="mono">{w.retail_price ? '$' + Number(w.retail_price).toFixed(2) : '\u2014'}</td>
                  <td><Link to={`/wheels/${w.wheel_id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- Wheel Detail / Create ---
export function WheelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [wheel, setWheel] = useState(null);
  const [form, setForm] = useState({
    brand: '', model: '', diameter: '', width: '', bolt_pattern: '', offset_mm: '',
    center_bore_mm: '', material: 'unknown', finish: '', condition: 'used',
    retail_price: '', cost: '', quantity: '0', bin_location: '', notes: '',
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    if (isNew) { setLoading(false); return; }
    setLoading(true);
    api.get(`/wheels/${id}`)
      .then((w) => { setWheel(w); setForm({
        brand: w.brand || '', model: w.model || '', diameter: w.diameter || '',
        width: w.width || '', bolt_pattern: w.bolt_pattern || '',
        offset_mm: w.offset_mm ?? '', center_bore_mm: w.center_bore_mm ?? '',
        material: w.material || 'unknown', finish: w.finish || '',
        condition: w.condition || 'used', retail_price: w.retail_price ?? '',
        cost: w.cost ?? '', quantity: w.quantity ?? '0',
        bin_location: w.bin_location || '', notes: w.notes || '',
      }); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const r = await api.post('/wheels', form);
        navigate(`/wheels/${r.wheel_id}`, { replace: true });
      } else {
        await api.patch(`/wheels/${id}`, form);
        setMsg('Saved.'); load();
      }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}><span className="spinner" /></div>;

  return (
    <div>
      <Link to="/wheels" className="text-muted" style={{ fontSize: '0.8125rem' }}>&larr; Back to Wheels</Link>
      <h1 style={{ fontSize: '1.5rem', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
        {isNew ? 'New Wheel' : `Wheel #${id}`}
      </h1>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      <div className="card">
        <div className="form-grid">
          <div className="form-field"><label className="label">Brand</label><input type="text" value={form.brand} onChange={ch('brand')} /></div>
          <div className="form-field"><label className="label">Model</label><input type="text" value={form.model} onChange={ch('model')} /></div>
          <div className="form-field"><label className="label">Diameter (in)</label><input type="number" step="0.5" value={form.diameter} onChange={ch('diameter')} /></div>
          <div className="form-field"><label className="label">Width (in)</label><input type="number" step="0.5" value={form.width} onChange={ch('width')} /></div>
          <div className="form-field"><label className="label">Bolt Pattern</label><input type="text" value={form.bolt_pattern} onChange={ch('bolt_pattern')} placeholder="e.g. 5x114.3" /></div>
          <div className="form-field"><label className="label">Offset (mm)</label><input type="number" value={form.offset_mm} onChange={ch('offset_mm')} /></div>
          <div className="form-field"><label className="label">Center Bore (mm)</label><input type="number" step="0.01" value={form.center_bore_mm} onChange={ch('center_bore_mm')} /></div>
          <div className="form-field"><label className="label">Material</label>
            <select value={form.material} onChange={ch('material')}>
              {['steel', 'alloy', 'forged', 'carbon', 'unknown'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select></div>
          <div className="form-field"><label className="label">Finish</label><input type="text" value={form.finish} onChange={ch('finish')} /></div>
          <div className="form-field"><label className="label">Condition</label>
            <select value={form.condition} onChange={ch('condition')}><option value="new">New</option><option value="used">Used</option></select></div>
          <div className="form-field"><label className="label">Retail Price</label><input type="number" step="0.01" value={form.retail_price} onChange={ch('retail_price')} /></div>
          <div className="form-field"><label className="label">Cost</label><input type="number" step="0.01" value={form.cost} onChange={ch('cost')} /></div>
          <div className="form-field"><label className="label">Qty On Hand</label><input type="number" value={form.quantity} onChange={ch('quantity')} /></div>
          <div className="form-field"><label className="label">BIN Location</label><input type="text" value={form.bin_location} onChange={ch('bin_location')} /></div>
          <div className="form-field" style={{ gridColumn: '1 / -1' }}><label className="label">Notes</label>
            <textarea rows={2} value={form.notes} onChange={ch('notes')}
              style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
                borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.9375rem' }} /></div>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: '1rem' }}>
          {saving ? <span className="spinner" /> : isNew ? 'Create Wheel' : 'Save'}
        </button>
      </div>

      {/* Fitments (only for existing wheels) */}
      {!isNew && wheel && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>Fitments</h2>
          <FitmentsPanel wheelId={wheel.wheel_id} fitments={wheel.fitments || []} onChanged={load} />
        </div>
      )}
    </div>
  );
}

function FitmentsPanel({ wheelId, fitments, onChanged }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ make: '', model: '', year_start: '', year_end: '', trim_level: '', is_oem: '0' });

  const handleAdd = async () => {
    try {
      await api.post(`/wheels/${wheelId}/fitments`, form);
      setForm({ make: '', model: '', year_start: '', year_end: '', trim_level: '', is_oem: '0' });
      setShow(false);
      onChanged();
    } catch {}
  };

  const handleRemove = async (id) => {
    try { await api.delete(`/wheels/fitments/${id}`); onChanged(); } catch {}
  };

  return (
    <div>
      {fitments.length > 0 && (
        <table className="entity-table" style={{ marginBottom: '0.75rem' }}>
          <thead><tr><th>Make</th><th>Model</th><th>Years</th><th>Trim</th><th>OEM</th><th></th></tr></thead>
          <tbody>
            {fitments.map((f) => (
              <tr key={f.fitment_id}>
                <td>{f.make}</td><td>{f.model}</td><td className="mono">{f.year_start}-{f.year_end}</td>
                <td>{f.trim_level || '\u2014'}</td>
                <td>{f.is_oem == 1 ? <span className="badge badge-blue">OEM</span> : 'Aftermarket'}</td>
                <td><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleRemove(f.fitment_id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {show ? (
        <div style={{ background: 'var(--lgray)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
          <div className="form-grid">
            <div className="form-field"><label className="label">Make</label><input type="text" value={form.make} onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))} /></div>
            <div className="form-field"><label className="label">Model</label><input type="text" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} /></div>
            <div className="form-field"><label className="label">Year Start</label><input type="number" value={form.year_start} onChange={(e) => setForm((p) => ({ ...p, year_start: e.target.value }))} /></div>
            <div className="form-field"><label className="label">Year End</label><input type="number" value={form.year_end} onChange={(e) => setForm((p) => ({ ...p, year_end: e.target.value }))} /></div>
            <div className="form-field"><label className="label">OEM?</label><select value={form.is_oem} onChange={(e) => setForm((p) => ({ ...p, is_oem: e.target.value }))}><option value="0">No</option><option value="1">Yes</option></select></div>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </div>
      ) : <button className="btn btn-ghost btn-sm" onClick={() => setShow(true)}>+ Add Fitment</button>}
    </div>
  );
}
