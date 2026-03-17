// ================================================================
// TireDetail (P2c)
// View and edit a single tire. Photo upload/delete. BIN assignment.
// Shows DOT/TIN info, age warning, waiver detection.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import CustomFieldValues from './CustomFieldValues.jsx';
import './TireDetail.css';

export default function TireDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [tire, setTire] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTire = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/tires/${id}`),
      api.get(`/tires/${id}/photos`).catch(() => ({ photos: [] })),
    ])
      .then(([tireData, photoData]) => {
        setTire(tireData);
        setPhotos(photoData.photos || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadTire(); }, [loadTire]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <span className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem' }}>
        <div className="alert alert-error">{error}</div>
        <Link to="/tires" className="btn btn-ghost" style={{ marginTop: '1rem' }}>Back to Search</Link>
      </div>
    );
  }

  if (!tire) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/tires" className="text-muted" style={{ fontSize: '0.8125rem' }}>&larr; Back to Search</Link>
          <h1 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
            {tire.full_size_string || 'Tire'} #{tire.tire_id}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {can('INVENTORY_WRITE_OFF') && tire.status !== 'written_off' && (
            <WriteOffButton tireId={tire.tire_id} onDone={loadTire} />
          )}
        </div>
      </div>

      <div className="tire-detail-grid">
        {/* Main info card */}
        <div className="card">
          <SectionTitle>Tire Information</SectionTitle>
          {can('INVENTORY_EDIT') ? (
            <TireEditForm tire={tire} onSaved={loadTire} />
          ) : (
            <TireReadOnly tire={tire} />
          )}
        </div>

        {/* Photos card */}
        <div className="card">
          <SectionTitle>Photos</SectionTitle>
          <PhotoGallery
            photos={photos}
            tireId={tire.tire_id}
            canUpload={can('PHOTO_UPLOAD')}
            onChanged={loadTire}
          />
        </div>

        {/* DOT / Age card */}
        {tire.dot_tin && (
          <div className="card">
            <SectionTitle>DOT / TIN</SectionTitle>
            <DotInfo tireId={tire.tire_id} dotTin={tire.dot_tin} />
          </div>
        )}

        {/* Waiver detection */}
        <div className="card">
          <SectionTitle>Waiver Check</SectionTitle>
          <WaiverCheck tireId={tire.tire_id} />
        </div>

        <CustomFieldValues entityType="tire" entityId={tire.tire_id} />
      </div>
    </div>
  );
}


// ---- Tire Edit Form ----

function TireEditForm({ tire, onSaved }) {
  const [form, setForm] = useState({ ...tire });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    api.get('/lookups/brands')
      .then((d) => setBrands(d.brands || []))
      .catch(() => {});
  }, []);

  useEffect(() => { setForm({ ...tire }); }, [tire]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const result = await api.patch(`/tires/${tire.tire_id}`, form);
      setMsg({ type: 'success', text: result.changed?.length ? `Updated: ${result.changed.join(', ')}` : 'No changes.' });
      onSaved();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="detail-form">
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="form-grid">
        <Field label="Size String" value={form.full_size_string} onChange={handleChange('full_size_string')} />
        <div className="form-field">
          <label className="label">Brand</label>
          <select value={form.brand_id || ''} onChange={handleChange('brand_id')}>
            <option value="">Select...</option>
            {brands.map((b) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>)}
          </select>
        </div>
        <Field label="Model" value={form.model_name} onChange={handleChange('model_name')} />
        <div className="form-field">
          <label className="label">Condition</label>
          <select value={form.condition || ''} onChange={handleChange('condition')}>
            <option value="new">New</option>
            <option value="used">Used</option>
          </select>
        </div>
        <Field label="Tread Depth (32nds)" value={form.tread_depth_32nds} onChange={handleChange('tread_depth_32nds')} type="number" />
        <Field label="Retail Price" value={form.retail_price} onChange={handleChange('retail_price')} type="number" step="0.01" />
        <Field label="Cost" value={form.cost} onChange={handleChange('cost')} type="number" step="0.01" />
        <Field label="BIN Location" value={form.bin_location} onChange={handleChange('bin_location')} placeholder="e.g. R-A1-03" />
        <Field label="DOT/TIN" value={form.dot_tin} onChange={handleChange('dot_tin')} />
        <div className="form-field">
          <label className="label">Status</label>
          <select value={form.status || 'available'} onChange={handleChange('status')}>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="sold">Sold</option>
            <option value="written_off">Written Off</option>
          </select>
        </div>
      </div>

      <div className="form-field" style={{ gridColumn: '1 / -1' }}>
        <label className="label">Notes</label>
        <textarea rows={3} value={form.notes || ''} onChange={handleChange('notes')} />
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? <span className="spinner" /> : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}


// ---- Read-only view for users without INVENTORY_EDIT ----

function TireReadOnly({ tire }) {
  return (
    <div className="form-grid readonly">
      <ReadField label="Size" value={tire.full_size_string} />
      <ReadField label="Brand" value={tire.brand_name} />
      <ReadField label="Model" value={tire.model_name} />
      <ReadField label="Condition" value={tire.condition} />
      <ReadField label="Tread" value={tire.tread_depth_32nds != null ? `${tire.tread_depth_32nds}/32` : null} />
      <ReadField label="Price" value={tire.retail_price ? `$${Number(tire.retail_price).toFixed(2)}` : null} />
      <ReadField label="Cost" value={tire.cost ? `$${Number(tire.cost).toFixed(2)}` : null} />
      <ReadField label="BIN" value={tire.bin_location} />
      <ReadField label="DOT/TIN" value={tire.dot_tin} />
      <ReadField label="Status" value={tire.status} />
      {tire.notes && <ReadField label="Notes" value={tire.notes} wide />}
    </div>
  );
}


// ---- Photo Gallery ----

function PhotoGallery({ photos, tireId, canUpload, onChanged }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    const fd = new FormData();
    fd.append('photo', file);
    fd.append('is_primary', photos.length === 0 ? '1' : '0');

    try {
      await api.post(`/tires/${tireId}/photos`, fd);
      onChanged();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (photoId) => {
    if (!confirm('Delete this photo?')) return;
    try {
      await api.delete(`/tires/photos/${photoId}`);
      onChanged();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  return (
    <div>
      {uploadError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{uploadError}</div>}

      <div className="photo-grid">
        {photos.map((p) => (
          <div key={p.photo_id} className={`photo-item ${p.is_primary ? 'photo-primary' : ''}`}>
            <img
              src={`/storage/photos/${p.file_path}`}
              alt={p.caption || 'Tire photo'}
              className="photo-img"
              loading="lazy"
            />
            {p.is_primary && <span className="photo-badge">Primary</span>}
            {canUpload && (
              <button className="photo-delete" onClick={() => handleDelete(p.photo_id)} title="Delete">
                &times;
              </button>
            )}
          </div>
        ))}

        {photos.length === 0 && (
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>No photos uploaded.</p>
        )}
      </div>

      {canUpload && (
        <div style={{ marginTop: '0.75rem' }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            {uploading ? <span className="spinner" /> : '\u2795 Upload Photo'}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}
    </div>
  );
}


// ---- DOT/TIN Info ----

function DotInfo({ tireId, dotTin }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/tires/${tireId}/dot?tin=${encodeURIComponent(dotTin)}`)
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tireId, dotTin]);

  if (loading) return <span className="spinner" />;
  if (!info) return <p className="text-muted" style={{ fontSize: '0.875rem' }}>Could not parse DOT/TIN.</p>;

  return (
    <div className="form-grid readonly">
      <ReadField label="Plant Code" value={info.plant_code} />
      <ReadField label="Size Code" value={info.size_code} />
      <ReadField label="Mfg Week" value={info.mfg_week} />
      <ReadField label="Mfg Year" value={info.mfg_year} />
      <ReadField label="Age (years)" value={info.age_years != null ? info.age_years.toFixed(1) : null} />
      {info.is_aged && (
        <div className="form-field" style={{ gridColumn: '1 / -1' }}>
          <div className="alert alert-warning">
            This tire exceeds the maximum age threshold and requires an aged tire waiver.
          </div>
        </div>
      )}
    </div>
  );
}


// ---- Waiver Detection and Creation ----

function WaiverCheck({ tireId }) {
  const [waivers, setWaivers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [templateText, setTemplateText] = useState({});
  const [acknowledged, setAcknowledged] = useState({});
  const [saving, setSaving] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get(`/tires/${tireId}/waivers`)
      .then((d) => setWaivers(d.waivers_needed || []))
      .catch(() => setWaivers([]))
      .finally(() => setLoading(false));
  }, [tireId]);

  const viewTemplate = async (type) => {
    if (templateText[type]) { setTemplateText((p) => { const n = { ...p }; delete n[type]; return n; }); return; }
    try {
      const data = await api.get(`/waivers/template/${type}`);
      setTemplateText((p) => ({ ...p, [type]: data.text || data.statutory_text || 'No template text available.' }));
    } catch { setTemplateText((p) => ({ ...p, [type]: 'Error loading template.' })); }
  };

  const createWaiver = async (type) => {
    setSaving(type);
    try {
      await api.post('/waivers', { waiver_type: type, tire_id: tireId, customer_acknowledged: true });
      setAcknowledged((p) => ({ ...p, [type]: true }));
      setMsg('Waiver recorded.');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(null); }
  };

  if (loading) return <span className="spinner" />;

  if (waivers.length === 0) {
    return <p className="text-muted" style={{ fontSize: '0.875rem' }}>No waivers required for this tire.</p>;
  }

  return (
    <div>
      <div className="alert alert-warning" style={{ marginBottom: '0.5rem' }}>
        {waivers.length} waiver{waivers.length > 1 ? 's' : ''} required before sale:
      </div>
      {msg && <div className={`alert ${msg.startsWith('Error') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>{msg}</div>}
      {waivers.map((w, i) => (
        <div key={i} style={{ padding: '0.5rem', marginBottom: '0.5rem', background: acknowledged[w] ? '#d4edda' : '#fff3cd', borderRadius: '4px', border: '1px solid #ddd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{w.replace(/_/g, ' ')}</span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => viewTemplate(w)} style={{ fontSize: '0.7rem' }}>
                {templateText[w] ? 'Hide' : 'View Template'}
              </button>
              {!acknowledged[w] && (
                <button className="btn btn-primary btn-sm" onClick={() => createWaiver(w)}
                  disabled={saving === w} style={{ fontSize: '0.7rem' }}>
                  {saving === w ? '...' : 'Record Acknowledgment'}
                </button>
              )}
              {acknowledged[w] && <span style={{ fontSize: '0.7rem', color: 'var(--green)', fontWeight: 600 }}>Acknowledged</span>}
            </div>
          </div>
          {templateText[w] && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'white', borderRadius: '4px', fontSize: '0.8rem', whiteSpace: 'pre-wrap', color: '#333' }}>
              {templateText[w]}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ---- Write-off Button ----

function WriteOffButton({ tireId, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await api.post(`/tires/${tireId}/write-off`, { reason });
      setOpen(false);
      onDone();
    } catch (err) {
      alert('Write-off failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setOpen(true)}>
        Write Off
      </button>
    );
  }

  return (
    <div className="card" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, width: 300 }}>
      <div className="label">Reason for Write-off</div>
      <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: '0.5rem' }} />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving || !reason.trim()}>
          {saving ? <span className="spinner" /> : 'Confirm'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}


// ---- Shared Helpers ----

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', fontWeight: 600,
      color: 'var(--navy)', marginBottom: '0.75rem', letterSpacing: '0.02em',
    }}>
      {children}
    </h2>
  );
}

function Field({ label, value, onChange, type = 'text', ...props }) {
  return (
    <div className="form-field">
      <label className="label">{label}</label>
      <input type={type} value={value || ''} onChange={onChange} {...props} />
    </div>
  );
}

function ReadField({ label, value, wide }) {
  return (
    <div className="form-field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div className="label">{label}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9375rem', color: 'var(--dgray)' }}>
        {value ?? '\u2014'}
      </div>
    </div>
  );
}
