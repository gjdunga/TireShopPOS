// ================================================================
// CustomFieldValues
// Reusable component that displays and edits custom field values
// for any entity type (customer, tire, vehicle, work_order).
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect } from 'react';
import api from '../api/client.js';

export default function CustomFieldValues({ entityType, entityId }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!entityId) return;
    Promise.all([
      api.get(`/custom-fields?entity_type=${entityType}`).catch(() => ({ fields: [] })),
      api.get(`/custom-field-values/${entityType}/${entityId}`).catch(() => ({ values: {} })),
    ]).then(([fData, vData]) => {
      const activeFields = (fData.fields || []).filter((f) => f.is_active);
      setFields(activeFields);
      const valMap = {};
      (Array.isArray(vData.values) ? vData.values : []).forEach((v) => {
        valMap[v.field_id] = v.field_value || '';
      });
      setValues(valMap);
    });
  }, [entityType, entityId]);

  if (fields.length === 0) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/custom-field-values/${entityType}/${entityId}`, { values });
      setMsg('Custom fields saved.');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fafafa', borderRadius: '6px', border: '1px solid #e8e8e8' }}>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Custom Fields</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
        {fields.map((f) => (
          <div key={f.field_id} className="form-field">
            <label className="label" style={{ fontSize: '0.75rem' }}>{f.field_label || f.field_name}</label>
            {f.field_type === 'select' ? (
              <select value={values[f.field_id] || ''} onChange={(e) => setValues((p) => ({ ...p, [f.field_id]: e.target.value }))}
                style={{ fontSize: '0.85rem' }}>
                <option value="">--</option>
                {(f.options || '').split(',').map((o) => <option key={o.trim()} value={o.trim()}>{o.trim()}</option>)}
              </select>
            ) : f.field_type === 'boolean' ? (
              <select value={values[f.field_id] || ''} onChange={(e) => setValues((p) => ({ ...p, [f.field_id]: e.target.value }))}
                style={{ fontSize: '0.85rem' }}>
                <option value="">--</option>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            ) : (
              <input type={f.field_type === 'number' ? 'number' : 'text'}
                value={values[f.field_id] || ''}
                onChange={(e) => setValues((p) => ({ ...p, [f.field_id]: e.target.value }))}
                style={{ fontSize: '0.85rem' }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={handleSave} disabled={saving} style={{ fontSize: '0.75rem' }}>
          {saving ? 'Saving...' : 'Save Custom Fields'}
        </button>
        {msg && <span style={{ fontSize: '0.75rem', color: msg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{msg}</span>}
      </div>
    </div>
  );
}
