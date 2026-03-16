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
  { key: 'notifications', label: 'Notifications' },
  { key: 'fields', label: 'Custom Fields' },
  { key: 'apikeys', label: 'API Keys' },
  { key: 'lookup', label: 'Vehicle Lookup' },
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
        {tab === 'notifications' && <NotificationsTab settings={settings} onSaved={(m) => { setMsg(m); load(); }} onError={setError} />}
        {tab === 'fields' && <CustomFieldsTab onError={setError} />}
        {tab === 'apikeys' && <ApiKeysTab onError={setError} />}
        {tab === 'lookup' && <VehicleLookupTab onSaved={(m) => { setMsg(m); }} onError={setError} />}
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

function NotificationsTab({ settings, onSaved, onError }) {
  const mailKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_encryption', 'smtp_from'];
  const smsKeys = ['sms_api_key', 'sms_api_secret', 'sms_from_number'];

  const [form, setForm] = useState(() => {
    const init = {};
    [...mailKeys, ...smsKeys].forEach((k) => { init[k] = settings[k]?.setting_value || ''; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = {};
      [...mailKeys, ...smsKeys].forEach((k) => { patch[k] = form[k]; });
      await api.patch('/settings', patch);
      onSaved('Notification settings saved.');
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  };

  const handleTest = async (type) => {
    setTesting(type);
    setTestResult(null);
    try {
      const result = await api.post(`/notifications/test-${type}`);
      setTestResult({ type, ...result });
    } catch (e) { setTestResult({ type, success: false, error: e.message }); }
    finally { setTesting(null); }
  };

  return (
    <div>
      <STitle>Email (SMTP)</STitle>
      <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.75rem' }}>
        Leave SMTP Host blank to use the server's built-in mail system (Postfix). Set it for external providers like Gmail, SendGrid, or Mailgun.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
        {mailKeys.map((k) => (
          <div key={k} className="form-field">
            <label className="label">{k.replace('smtp_', '').replace(/_/g, ' ')}</label>
            <input type={k === 'smtp_pass' ? 'password' : 'text'} value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => handleTest('email')} disabled={testing}>
          {testing === 'email' ? 'Sending...' : 'Send Test Email'}
        </button>
      </div>

      <STitle>SMS (Flowroute)</STitle>
      <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.75rem' }}>
        Requires a Flowroute account with SMS-enabled DID. API credentials are in the Flowroute portal under Preferences > API Control.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
        {smsKeys.map((k) => (
          <div key={k} className="form-field">
            <label className="label">{k.replace('sms_', '').replace(/_/g, ' ')}</label>
            <input type={k.includes('secret') ? 'password' : 'text'} value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => handleTest('sms')} disabled={testing}>
          {testing === 'sms' ? 'Sending...' : 'Send Test SMS'}
        </button>
      </div>

      {testResult && (
        <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '0.75rem' }}>
          {testResult.type === 'email' ? 'Email' : 'SMS'} test: {testResult.success ? 'Sent successfully' + (testResult.sent_to ? ` to ${testResult.sent_to}` : '') : testResult.error}
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Save Notification Settings'}
        </button>
      </div>
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

// ================================================================
// Vehicle Lookup Provider Setup
// ================================================================

function VehicleLookupTab({ onSaved, onError }) {
  const [providers, setProviders] = useState(null);
  const [current, setCurrent] = useState('autodev');
  const [apiKey, setApiKey] = useState('');
  const [keyPreview, setKeyPreview] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPlate, setTestPlate] = useState('');
  const [testState, setTestState] = useState('CO');
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/plate-providers'),
      api.get('/plate-providers/config'),
    ])
      .then(([catalog, config]) => {
        setProviders(catalog.providers || {});
        setCurrent(catalog.current || config.provider || 'autodev');
        setKeyPreview(config.api_key_preview || '');
      })
      .catch((err) => onError(err.message))
      .finally(() => setLoading(false));
  }, [onError]);

  const handleSave = () => {
    if (!apiKey && !keyPreview) {
      onError('API key is required.');
      return;
    }
    setSaving(true);
    api.patch('/plate-providers/config', {
      provider: current,
      api_key: apiKey || keyPreview.replace(/\*/g, ''),
    })
      .then((res) => {
        onSaved(res.message || 'Provider updated.');
        setKeyPreview(apiKey ? (apiKey.substring(0, 8) + '********') : keyPreview);
        setApiKey('');
        setShowKey(false);
      })
      .catch((err) => onError(err.message))
      .finally(() => setSaving(false));
  };

  const handleTest = () => {
    if (!testPlate || !testState) {
      onError('Enter a plate and state to test.');
      return;
    }
    setTesting(true);
    setTestResult(null);
    api.post('/plate-providers/test', {
      provider: current,
      api_key: apiKey || undefined,
      plate: testPlate,
      state: testState,
    })
      .then((res) => setTestResult(res))
      .catch((err) => setTestResult({ success: false, error: err.message }))
      .finally(() => setTesting(false));
  };

  if (loading || !providers) {
    return <div style={{ padding: '1rem' }}><span className="spinner" /></div>;
  }

  const meta = providers[current];
  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  ];

  return (
    <div>
      <STitle>Vehicle Lookup Provider</STitle>
      <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
        Configure which plate-to-VIN API provider to use for license plate lookups.
        All providers return VIN, year, make, and model. NHTSA enrichment (free) runs
        automatically after the plate lookup.
      </p>

      {/* Provider dropdown */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.85rem' }}>
          Provider
        </label>
        <select
          value={current}
          onChange={(e) => { setCurrent(e.target.value); setTestResult(null); }}
          style={{ width: '100%', maxWidth: '400px', padding: '0.5rem', borderRadius: '4px',
                   border: '1px solid #ccc', fontSize: '0.9rem' }}
        >
          {Object.values(providers).map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} ({p.pricing})
            </option>
          ))}
        </select>
      </div>

      {/* Provider info card */}
      {meta && (
        <div style={{ background: '#f0f5fa', border: '1px solid #d0dde8', borderRadius: '6px',
                      padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
          <div><strong>{meta.name}</strong></div>
          <div style={{ marginTop: '0.25rem' }}>Pricing: {meta.pricing}</div>
          <div>Auth: {meta.auth_header}</div>
          <div style={{ marginTop: '0.25rem' }}>
            <a href={meta.docs_url} target="_blank" rel="noopener noreferrer"
               style={{ color: '#2e75b6' }}>
              API Documentation
            </a>
            {' | '}
            <a href={meta.url} target="_blank" rel="noopener noreferrer"
               style={{ color: '#2e75b6' }}>
              {meta.url}
            </a>
          </div>
        </div>
      )}

      {/* API Key */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.85rem' }}>
          API Key
          {keyPreview && !apiKey && (
            <span style={{ fontWeight: 400, color: '#888', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
              (current: {keyPreview})
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '500px' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyPreview ? 'Enter new key to change' : 'Enter API key'}
            style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc',
                     fontSize: '0.9rem', fontFamily: 'monospace' }}
          />
          <button type="button" className="btn btn-sm btn-ghost"
            onClick={() => setShowKey(!showKey)} style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Save */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}
          style={{ marginRight: '0.5rem' }}>
          {saving ? 'Saving...' : 'Save Provider Settings'}
        </button>
      </div>

      {/* Test section */}
      <STitle>Test Connection</STitle>
      <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.75rem' }}>
        Enter a real plate to verify the provider is working. This makes a live API call.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap',
                    marginBottom: '0.75rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.15rem' }}>Plate</label>
          <input value={testPlate} onChange={(e) => setTestPlate(e.target.value.toUpperCase())}
            placeholder="ABC123" style={{ width: '120px', padding: '0.4rem', borderRadius: '4px',
            border: '1px solid #ccc', fontSize: '0.9rem', fontFamily: 'monospace' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.15rem' }}>State</label>
          <select value={testState} onChange={(e) => setTestState(e.target.value)}
            style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem' }}>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={handleTest} disabled={testing}
          style={{ marginBottom: '0.15rem' }}>
          {testing ? 'Testing...' : 'Test Lookup'}
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{
          background: testResult.success ? '#e8f5e9' : '#fdecea',
          border: '1px solid ' + (testResult.success ? '#a5d6a7' : '#ef9a9a'),
          borderRadius: '6px', padding: '0.75rem 1rem', fontSize: '0.82rem',
          maxWidth: '600px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
            {testResult.success ? 'Success' : 'Failed'}
            {testResult.provider && ` (${testResult.provider})`}
          </div>
          {testResult.error && <div style={{ color: '#c62828' }}>{testResult.error}</div>}
          {testResult.vehicle && (
            <div style={{ marginTop: '0.25rem' }}>
              <div>VIN: <code>{testResult.vehicle.vin || 'N/A'}</code></div>
              <div>{testResult.vehicle.year} {testResult.vehicle.make} {testResult.vehicle.model}
                {testResult.vehicle.trim_level ? ` ${testResult.vehicle.trim_level}` : ''}</div>
              {testResult.vehicle.engine && <div>Engine: {testResult.vehicle.engine}</div>}
              {testResult.vehicle.drive_type && <div>Drive: {testResult.vehicle.drive_type}</div>}
            </div>
          )}
          {testResult.log && testResult.log.length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#666' }}>
              {testResult.log.map((l, i) => (
                <div key={i}>
                  {l.prov}: HTTP {l.status} {l.ok ? 'OK' : 'FAIL'}
                  {l.ms != null ? ` (${l.ms}ms)` : ''}
                  {l.err ? ` ${l.err}` : ''}
                  {l.cost > 0 ? ` [$${(l.cost / 100).toFixed(2)}]` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function STitle({ children }) {
  return <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', fontWeight: 600,
    color: 'var(--navy)', marginBottom: '0.75rem', letterSpacing: '0.02em' }}>{children}</h2>;
}
