// ================================================================
// SettingsAdmin (P3a/P3e)
// Tabbed settings: Shop Info, Hours, Website, Branding, Custom Fields, API Keys
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';
import './Settings.css';

const TABS = [
  { key: 'info', label: 'Shop Info' },
  { key: 'hours', label: 'Hours' },
  { key: 'website', label: 'Website' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'fields', label: 'Custom Fields' },
  { key: 'apikeys', label: 'API Keys' },
];

export default function SettingsAdmin() {
  const [tab, setTab] = useState('info');
  const [settings, setSettings] = useState({});
  const [webConfig, setWebConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/settings'),
      api.get('/website-config'),
    ])
      .then(([s, w]) => {
        const sMap = {};
        (s.settings || []).forEach((r) => { sMap[r.setting_key] = r; });
        setSettings(sMap);
        const wMap = {};
        (w.configs || []).forEach((r) => { wMap[r.config_key] = r; });
        setWebConfig(wMap);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Settings</h1>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      <div className="settings-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setTab(t.key); setMsg(null); setError(null); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        {tab === 'info' && <InfoTab settings={settings} onSaved={(m) => { setMsg(m); load(); }} onError={setError} />}
        {tab === 'hours' && <HoursTab settings={settings} onSaved={(m) => { setMsg(m); load(); }} onError={setError} />}
        {tab === 'website' && <WebsiteTab settings={settings} webConfig={webConfig} onSaved={(m) => { setMsg(m); load(); }} onError={setError} />}
        {tab === 'appearance' && <AppearanceTab webConfig={webConfig} onSaved={(m) => { setMsg(m); load(); }} onError={setError} />}
        {tab === 'fields' && <CustomFieldsTab onError={setError} />}
        {tab === 'apikeys' && <ApiKeysTab onError={setError} />}
      </div>
    </div>
  );
}

function InfoTab({ settings, onSaved, onError }) {
  const keys = ['shop_name', 'shop_phone', 'shop_email', 'shop_address_line1', 'shop_address_line2',
    'shop_city', 'shop_state', 'shop_zip', 'shop_lat', 'shop_lng', 'shop_tagline', 'tax_rate'];
  const [form, setForm] = useState(() => {
    const init = {};
    keys.forEach((k) => { init[k] = settings[k]?.setting_value || ''; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await api.patch('/settings', form); onSaved('Shop info saved.'); }
    catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <STitle>Shop Information</STitle>
      <div className="form-grid">
        {keys.map((k) => (
          <div key={k} className="form-field" style={k === 'shop_tagline' ? { gridColumn: '1 / -1' } : {}}>
            <label className="label">{settings[k]?.label || k}</label>
            <input type="text" value={form[k] || ''} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
            {settings[k]?.description && <small className="text-muted">{settings[k].description}</small>}
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: '1rem' }}>
        {saving ? <span className="spinner" /> : 'Save'}
      </button>
    </div>
  );
}

function HoursTab({ settings, onSaved, onError }) {
  const raw = settings['shop_hours_json']?.setting_value || '{}';
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch {}
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const labels = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const [hours, setHours] = useState(parsed);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', { shop_hours_json: JSON.stringify(hours) });
      onSaved('Hours saved.');
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <STitle>Business Hours</STitle>
      <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
        Format: "8:00-17:00" or "Closed". Used for appointment slot generation.
      </p>
      {days.map((d) => (
        <div key={d} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <label style={{ width: 90, fontWeight: 500 }}>{labels[d]}</label>
          <input type="text" value={hours[d] || ''} onChange={(e) => setHours((p) => ({ ...p, [d]: e.target.value }))}
            style={{ width: 160 }} placeholder="8:00-17:00 or Closed" />
        </div>
      ))}
      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: '0.75rem' }}>
        {saving ? <span className="spinner" /> : 'Save Hours'}
      </button>
    </div>
  );
}

function WebsiteTab({ settings, webConfig, onSaved, onError }) {
  const toggleKeys = ['website_enabled', 'website_inventory_public', 'website_fitment_enabled',
    'website_appointment_enabled', 'website_show_prices', 'website_show_tread'];
  const schedKeys = ['appointment_slot_min', 'appointment_max_slot'];
  const [form, setForm] = useState(() => {
    const init = {};
    [...toggleKeys, ...schedKeys].forEach((k) => { init[k] = settings[k]?.setting_value || ''; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await api.patch('/settings', form); onSaved('Website settings saved.'); }
    catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <STitle>Website Settings</STitle>
      {toggleKeys.map((k) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input type="checkbox" checked={form[k] === '1'} id={k}
            onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.checked ? '1' : '0' }))} />
          <label htmlFor={k} style={{ fontWeight: 500 }}>{settings[k]?.label || k}</label>
        </div>
      ))}
      <div className="form-grid" style={{ marginTop: '1rem' }}>
        {schedKeys.map((k) => (
          <div key={k} className="form-field">
            <label className="label">{settings[k]?.label || k}</label>
            <input type="number" value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: '1rem' }}>
        {saving ? <span className="spinner" /> : 'Save'}
      </button>
    </div>
  );
}

function AppearanceTab({ webConfig, onSaved, onError }) {
  const keys = ['hero_title', 'hero_subtitle', 'hero_image_url', 'about_html', 'footer_html',
    'meta_title', 'meta_description', 'google_analytics_id', 'announcement_html', 'announcement_active'];
  const [form, setForm] = useState(() => {
    const init = {};
    keys.forEach((k) => { init[k] = webConfig[k]?.config_value || ''; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await api.patch('/website-config', form); onSaved('Appearance saved.'); }
    catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  const isTextarea = (k) => ['about_html', 'footer_html', 'announcement_html', 'meta_description'].includes(k);
  const isBool = (k) => k === 'announcement_active';

  return (
    <div>
      <STitle>Storefront Appearance</STitle>
      <div className="form-grid">
        {keys.map((k) => (
          <div key={k} className="form-field" style={isTextarea(k) ? { gridColumn: '1 / -1' } : {}}>
            <label className="label">{(k || '').replace(/_/g, ' ')}</label>
            {isBool(k) ? (
              <input type="checkbox" checked={form[k] === '1'}
                onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.checked ? '1' : '0' }))} />
            ) : isTextarea(k) ? (
              <textarea rows={3} value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
                style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
                  borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }} />
            ) : (
              <input type="text" value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: '1rem' }}>
        {saving ? <span className="spinner" /> : 'Save'}
      </button>
    </div>
  );
}

function CustomFieldsTab({ onError }) {
  const TYPES = ['tire', 'customer', 'vehicle', 'work_order'];
  const [entityType, setEntityType] = useState('tire');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/custom-fields?entity_type=${entityType}`)
      .then((d) => setFields(d.fields || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [entityType]);

  const handleToggle = async (fieldId, isActive) => {
    try {
      await api.patch(`/custom-fields/${fieldId}`, { is_active: isActive ? 0 : 1 });
      load();
    } catch (err) { onError(err.message); }
  };

  return (
    <div>
      <STitle>Custom Fields</STitle>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem' }}>
        {TYPES.map((t) => (
          <button key={t} className={`btn btn-sm ${entityType === t ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setEntityType(t)} style={{ textTransform: 'capitalize' }}>{t.replace('_', ' ')}</button>
        ))}
      </div>

      {loading ? <span className="spinner" /> : (
        <table className="entity-table" style={{ marginBottom: '0.75rem' }}>
          <thead><tr><th>Name</th><th>Label</th><th>Type</th><th>Required</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.field_id}>
                <td className="mono">{f.field_name}</td>
                <td>{f.field_label}</td>
                <td>{f.field_type}</td>
                <td>{f.is_required == 1 ? 'Yes' : 'No'}</td>
                <td>{f.is_active == 1 ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => handleToggle(f.field_id, f.is_active == 1)}>
                  {f.is_active == 1 ? 'Deactivate' : 'Activate'}
                </button></td>
              </tr>
            ))}
            {fields.length === 0 && <tr><td colSpan={6} className="text-muted" style={{ textAlign: 'center' }}>No custom fields.</td></tr>}
          </tbody>
        </table>
      )}

      {showAdd ? (
        <AddFieldForm entityType={entityType} onAdded={() => { setShowAdd(false); load(); }} onCancel={() => setShowAdd(false)} onError={onError} />
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(true)}>+ Add Custom Field</button>
      )}
    </div>
  );
}

function AddFieldForm({ entityType, onAdded, onCancel, onError }) {
  const [form, setForm] = useState({ field_name: '', field_label: '', field_type: 'text', is_required: 0, sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.field_name.trim() || !form.field_label.trim()) { onError('Name and label required.'); return; }
    setSaving(true);
    try {
      await api.post('/custom-fields', { ...form, entity_type: entityType });
      onAdded();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: 'var(--lgray)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
      <div className="form-grid">
        <div className="form-field"><label className="label">Field Name (snake_case)</label>
          <input type="text" value={form.field_name} onChange={(e) => setForm((p) => ({ ...p, field_name: e.target.value }))} /></div>
        <div className="form-field"><label className="label">Display Label</label>
          <input type="text" value={form.field_label} onChange={(e) => setForm((p) => ({ ...p, field_label: e.target.value }))} /></div>
        <div className="form-field"><label className="label">Type</label>
          <select value={form.field_type} onChange={(e) => setForm((p) => ({ ...p, field_type: e.target.value }))}>
            {['text', 'number', 'boolean', 'date', 'select'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div className="form-field"><label className="label">Sort Order</label>
          <input type="number" value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))} /></div>
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Add'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ApiKeysTab({ onError }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState(null);
  const [label, setLabel] = useState('');

  const load = () => {
    api.get('/api-keys').then((d) => setKeys(d.keys || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!label.trim()) { onError('Enter a label.'); return; }
    try {
      const result = await api.post('/api-keys', { label });
      setNewKey(result.key);
      setLabel('');
      load();
    } catch (err) { onError(err.message); }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Revoke this API key?')) return;
    try { await api.delete(`/api-keys/${id}`); load(); }
    catch (err) { onError(err.message); }
  };

  return (
    <div>
      <STitle>API Keys</STitle>
      {newKey && (
        <div className="alert alert-success" style={{ marginBottom: '0.75rem', wordBreak: 'break-all' }}>
          <strong>New key created. Copy it now:</strong><br />
          <code className="mono" style={{ fontSize: '0.875rem' }}>{newKey.api_key}</code>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Key label" style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={handleCreate}>Generate Key</button>
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>Prefix</th><th>Label</th><th>Requests</th><th>Last Used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.key_id}>
                <td className="mono">{k.key_prefix}...</td>
                <td>{k.label}</td>
                <td className="mono">{Number(k.request_count).toLocaleString()}</td>
                <td className="mono">{k.last_used_at?.slice(0, 16) || 'Never'}</td>
                <td>{k.is_active == 1 ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Revoked</span>}</td>
                <td>{k.is_active == 1 && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                  onClick={() => handleRevoke(k.key_id)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function STitle({ children }) {
  return <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', fontWeight: 600,
    color: 'var(--navy)', marginBottom: '0.75rem', letterSpacing: '0.02em' }}>{children}</h2>;
}
