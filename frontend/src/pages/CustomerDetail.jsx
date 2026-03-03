// ================================================================
// CustomerDetail (P2d)
// View/edit customer. Linked vehicles with add/remove.
// Also used for creating new customers (path: /customers/new).
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client.js';
import './CustomerSearch.css';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

const EMPTY = {
  first_name: '', last_name: '', phone_primary: '', phone_secondary: '',
  email: '', address_line1: '', address_line2: '', city: '', state: '', zip: '',
  is_tax_exempt: 0, tax_exempt_id: '', notes: '',
};

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [form, setForm] = useState({ ...EMPTY });
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    if (isNew) return;
    setLoading(true);
    Promise.all([
      api.get(`/customers/${id}`),
      api.get(`/customers/${id}/vehicles`).catch(() => ({ vehicles: [] })),
    ])
      .then(([cust, veh]) => {
        setForm({ ...EMPTY, ...cust });
        setVehicles(veh.vehicles || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setError(null);

    try {
      if (isNew) {
        const result = await api.post('/customers', form);
        navigate(`/customers/${result.customer_id}`, { replace: true });
      } else {
        const result = await api.patch(`/customers/${id}`, form);
        setMsg(result.changed?.length ? `Updated: ${result.changed.join(', ')}` : 'No changes.');
        load();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;
  }

  return (
    <div>
      <Link to="/customers" className="text-muted" style={{ fontSize: '0.8125rem' }}>&larr; Back to Customers</Link>
      <h1 style={{ fontSize: '1.5rem', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
        {isNew ? 'New Customer' : `${form.first_name} ${form.last_name}`}
      </h1>

      <div className="detail-two-col">
        {/* Left: customer form */}
        <div className="card">
          <SectionTitle>{isNew ? 'Customer Information' : 'Edit Customer'}</SectionTitle>

          {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
          {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

          <form onSubmit={handleSave}>
            <div className="form-grid">
              <Field label="First Name" value={form.first_name} onChange={handleChange('first_name')} required autoFocus={isNew} />
              <Field label="Last Name" value={form.last_name} onChange={handleChange('last_name')} required />
              <Field label="Phone" value={form.phone_primary} onChange={handleChange('phone_primary')} type="tel" placeholder="(303) 555-1234" />
              <Field label="Alt Phone" value={form.phone_secondary} onChange={handleChange('phone_secondary')} type="tel" />
              <Field label="Email" value={form.email} onChange={handleChange('email')} type="email" />
              <Field label="Address" value={form.address_line1} onChange={handleChange('address_line1')} />
              <Field label="Address 2" value={form.address_line2} onChange={handleChange('address_line2')} />
              <Field label="City" value={form.city} onChange={handleChange('city')} />
              <div className="form-field">
                <label className="label">State</label>
                <select value={form.state || ''} onChange={handleChange('state')}>
                  <option value="">Select...</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Field label="ZIP" value={form.zip} onChange={handleChange('zip')} />
            </div>

            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}>
                <input type="checkbox" checked={!!form.is_tax_exempt} onChange={handleChange('is_tax_exempt')} />
                Tax Exempt
              </label>
              {!!form.is_tax_exempt && (
                <input type="text" placeholder="Exempt ID" value={form.tax_exempt_id || ''}
                  onChange={handleChange('tax_exempt_id')} style={{ maxWidth: 200 }} />
              )}
            </div>

            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label className="label">Notes</label>
              <textarea rows={3} value={form.notes || ''} onChange={handleChange('notes')}
                style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
                  borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.9375rem' }} />
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving || !form.first_name.trim() || !form.last_name.trim()}>
                {saving ? <span className="spinner" /> : (isNew ? 'Create Customer' : 'Save Changes')}
              </button>
              {isNew && <Link to="/customers" className="btn btn-ghost">Cancel</Link>}
            </div>
          </form>
        </div>

        {/* Right: linked vehicles */}
        {!isNew && (
          <div>
            <div className="card">
              <SectionTitle>Linked Vehicles</SectionTitle>
              <LinkedVehicles customerId={Number(id)} vehicles={vehicles} onChanged={load} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ---- Linked Vehicles Panel ----

function LinkedVehicles({ customerId, vehicles, onChanged }) {
  const [linking, setLinking] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (searchQ.trim().length < 2) return;
    setSearching(true);
    try {
      const data = await api.get(`/vehicles/search?q=${encodeURIComponent(searchQ.trim())}&limit=10`);
      setSearchResults(data.results || []);
    } catch (err) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleLink = async (vehicleId) => {
    try {
      await api.post(`/customers/${customerId}/vehicles/${vehicleId}`);
      setLinking(false);
      setSearchQ('');
      setSearchResults(null);
      onChanged();
    } catch (err) {
      alert('Link failed: ' + err.message);
    }
  };

  const handleUnlink = async (vehicleId) => {
    if (!confirm('Unlink this vehicle from the customer?')) return;
    try {
      await api.delete(`/customers/${customerId}/vehicles/${vehicleId}`);
      onChanged();
    } catch (err) {
      alert('Unlink failed: ' + err.message);
    }
  };

  return (
    <div>
      {vehicles.length > 0 ? (
        <ul className="linked-list">
          {vehicles.map((v) => (
            <li key={v.vehicle_id} className="linked-item">
              <Link to={`/vehicles/${v.vehicle_id}`} className="linked-item-info" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="linked-item-title">{v.year} {v.make} {v.model}</span>
                <span className="linked-item-sub">
                  {v.vin ? `VIN: ${v.vin}` : ''}{v.license_plate ? ` Plate: ${v.license_plate}` : ''}
                </span>
              </Link>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleUnlink(v.vehicle_id)}>
                Unlink
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>No vehicles linked.</p>
      )}

      {!linking ? (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setLinking(true)}>Link Existing Vehicle</button>
          <Link to="/vehicles/new" className="btn btn-ghost btn-sm">+ New Vehicle</Link>
        </div>
      ) : (
        <div style={{ marginTop: '0.75rem', background: 'var(--lgray)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input type="text" placeholder="Search vehicles..." value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={searching}>
              {searching ? <span className="spinner" /> : 'Search'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setLinking(false); setSearchResults(null); }}>Cancel</button>
          </div>
          {searchResults && searchResults.length > 0 && (
            <ul className="linked-list">
              {searchResults.map((v) => (
                <li key={v.vehicle_id} className="linked-item">
                  <span className="linked-item-info">
                    <span className="linked-item-title">{v.year} {v.make} {v.model}</span>
                    <span className="linked-item-sub">{v.vin || v.license_plate || ''}</span>
                  </span>
                  <button className="btn btn-primary btn-sm" onClick={() => handleLink(v.vehicle_id)}>Link</button>
                </li>
              ))}
            </ul>
          )}
          {searchResults && searchResults.length === 0 && (
            <p className="text-muted" style={{ fontSize: '0.8125rem' }}>No vehicles found.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', fontWeight: 600,
      color: 'var(--navy)', marginBottom: '0.75rem', letterSpacing: '0.02em' }}>
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
