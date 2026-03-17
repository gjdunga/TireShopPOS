// ================================================================
// TireCreate (P2c)
// Add a new tire to inventory. Auto-parses size string.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client.js';

export default function TireCreate() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState([]);
  const [tireTypes, setTireTypes] = useState([]);
  const [constructionTypes, setConstructionTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [parsedSize, setParsedSize] = useState(null);

  const [form, setForm] = useState({
    full_size_string: '',
    brand_id: '',
    model_name: '',
    tire_type: '',
    construction_type: '',
    condition: 'new',
    tread_depth_32nds: '',
    retail_price: '',
    cost: '',
    bin_location: '',
    dot_tin: '',
    notes: '',
  });

  useEffect(() => {
    Promise.all([
      api.get('/lookups/brands').catch(() => ({ brands: [] })),
      api.get('/lookups/tire-types').catch(() => ({ types: [] })),
      api.get('/lookups/construction-types').catch(() => ({ types: [] })),
    ]).then(([b, tt, ct]) => {
      setBrands(b.brands || []);
      setTireTypes(tt.types || []);
      setConstructionTypes(ct.types || []);
    });
  }, []);

  const handleChange = (field) => (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));

    // Auto-parse tire size
    if (field === 'full_size_string' && val.length >= 7) {
      api.get(`/tires/parse-size?size=${encodeURIComponent(val)}`)
        .then(setParsedSize)
        .catch(() => setParsedSize(null));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = { ...form };
    // Merge parsed size fields if available
    if (parsedSize) {
      payload.width_mm = parsedSize.width_mm;
      payload.aspect_ratio = parsedSize.aspect_ratio;
      payload.wheel_diameter = parsedSize.wheel_diameter;
    }
    // Convert numeric fields
    if (payload.tread_depth_32nds) payload.tread_depth_32nds = Number(payload.tread_depth_32nds);
    if (payload.brand_id) payload.brand_id = Number(payload.brand_id);

    try {
      const result = await api.post('/tires', payload);
      navigate(`/tires/${result.tire_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link to="/tires" className="text-muted" style={{ fontSize: '0.8125rem' }}>&larr; Back to Search</Link>
      <h1 style={{ fontSize: '1.5rem', marginTop: '0.25rem', marginBottom: '1.25rem' }}>Add New Tire</h1>

      <div className="card" style={{ maxWidth: 640 }}>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Size String</label>
              <input type="text" placeholder="e.g. 225/65R17" value={form.full_size_string}
                onChange={handleChange('full_size_string')} autoFocus />
              {parsedSize && (
                <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Parsed: {parsedSize.width_mm}/{parsedSize.aspect_ratio}R{parsedSize.wheel_diameter}
                  {parsedSize.construction ? ` (${parsedSize.construction})` : ''}
                </div>
              )}
            </div>

            <div className="form-field">
              <label className="label">Brand</label>
              <select value={form.brand_id} onChange={handleChange('brand_id')}>
                <option value="">Select...</option>
                {brands.map((b) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label className="label">Model</label>
              <input type="text" value={form.model_name} onChange={handleChange('model_name')} />
            </div>

            <div className="form-field">
              <label className="label">Tire Type</label>
              <select value={form.tire_type} onChange={handleChange('tire_type')}>
                <option value="">Select...</option>
                {tireTypes.map((t) => <option key={t.code || t} value={t.code || t}>{t.label || t.code || t}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label className="label">Construction</label>
              <select value={form.construction_type} onChange={handleChange('construction_type')}>
                <option value="">Select...</option>
                {constructionTypes.map((t) => <option key={t.code || t} value={t.code || t}>{t.label || t.code || t}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label className="label">Condition</label>
              <select value={form.condition} onChange={handleChange('condition')}>
                <option value="new">New</option>
                <option value="used">Used</option>
              </select>
            </div>

            <div className="form-field">
              <label className="label">Tread Depth (32nds)</label>
              <input type="number" min="0" max="32" value={form.tread_depth_32nds}
                onChange={handleChange('tread_depth_32nds')} />
            </div>

            <div className="form-field">
              <label className="label">Retail Price</label>
              <input type="number" min="0" step="0.01" value={form.retail_price}
                onChange={handleChange('retail_price')} />
            </div>

            <div className="form-field">
              <label className="label">Acquisition Cost</label>
              <input type="number" min="0" step="0.01" value={form.cost}
                onChange={handleChange('cost')} />
            </div>

            <div className="form-field">
              <label className="label">BIN Location</label>
              <input type="text" placeholder="e.g. R-A1-03" value={form.bin_location}
                onChange={handleChange('bin_location')} />
            </div>

            <div className="form-field">
              <label className="label">DOT/TIN</label>
              <input type="text" placeholder="e.g. DOT XXXX XXXX 2324" value={form.dot_tin}
                onChange={handleChange('dot_tin')} />
            </div>
          </div>

          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label className="label">Notes</label>
            <textarea rows={3} value={form.notes} onChange={handleChange('notes')}
              style={{
                display: 'block', width: '100%', padding: '0.5rem 0.75rem',
                border: '1px solid var(--mgray)', borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-body)', fontSize: '0.9375rem',
              }} />
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.full_size_string.trim()}>
              {saving ? <span className="spinner" /> : 'Add Tire'}
            </button>
            <Link to="/tires" className="btn btn-ghost">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
