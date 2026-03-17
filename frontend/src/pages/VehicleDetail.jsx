// ================================================================
// VehicleDetail (P2d)
// View/edit vehicle. Plate lookup, VIN decode, torque spec display,
// service history, linked customers.
// Also used for creating new vehicles (path: /vehicles/new).
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import CustomFieldValues from './CustomFieldValues.jsx';
import './CustomerSearch.css';

const DRIVETRAINS = ['2WD', '4WD', 'AWD', 'FWD', 'RWD'];
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

const EMPTY = {
  year: '', make: '', model: '', trim_level: '', vin: '',
  license_plate: '', license_state: '', color: '', drivetrain: '',
  lug_count: '', lug_pattern: '', torque_spec_ftlbs: '',
  oem_tire_size: '', notes: '',
};

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const isNew = id === 'new';

  const [form, setForm] = useState({ ...EMPTY });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    if (isNew) return;
    setLoading(true);
    Promise.all([
      api.get(`/vehicles/${id}`),
      api.get(`/vehicles/${id}/history`).catch(() => ({ history: [] })),
    ])
      .then(([veh, hist]) => {
        setForm({ ...EMPTY, ...veh });
        setHistory(hist.history || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setError(null);

    try {
      if (isNew) {
        const result = await api.post('/vehicles', form);
        navigate(`/vehicles/${result.vehicle_id}`, { replace: true });
      } else {
        const result = await api.patch(`/vehicles/${id}`, form);
        setMsg(result.changed?.length ? `Updated: ${result.changed.join(', ')}` : 'No changes.');
        load();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Accept lookup results and merge into form
  const applyLookup = (vehicle) => {
    setForm((prev) => ({
      ...prev,
      year: vehicle.year || prev.year,
      make: vehicle.make || prev.make,
      model: vehicle.model || prev.model,
      trim_level: vehicle.trim_level || prev.trim_level,
      vin: vehicle.vin || prev.vin,
      color: vehicle.color || prev.color,
      drivetrain: vehicle.drive_type || prev.drivetrain,
    }));
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;
  }

  return (
    <div>
      <Link to="/vehicles" className="text-muted" style={{ fontSize: '0.8125rem' }}>&larr; Back to Vehicles</Link>
      <h1 style={{ fontSize: '1.5rem', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
        {isNew ? 'New Vehicle' : `${form.year} ${form.make} ${form.model}`}
      </h1>

      <div className="detail-two-col">
        {/* Left column: Vehicle form */}
        <div>
          {/* Lookup panel (only for new or editable vehicles) */}
          {can('VEHICLE_MANAGE') && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <SectionTitle>Vehicle Lookup</SectionTitle>
              <VehicleLookupPanel onResult={applyLookup} />
            </div>
          )}

          <div className="card">
            <SectionTitle>{isNew ? 'Vehicle Information' : 'Edit Vehicle'}</SectionTitle>

            {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

            <form onSubmit={handleSave}>
              <div className="form-grid">
                <Field label="Year" value={form.year} onChange={handleChange('year')} type="number" min="1900" max="2099" required />
                <Field label="Make" value={form.make} onChange={handleChange('make')} required />
                <Field label="Model" value={form.model} onChange={handleChange('model')} required />
                <Field label="Trim" value={form.trim_level} onChange={handleChange('trim_level')} />
                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="label">VIN</label>
                  <input type="text" value={form.vin || ''} onChange={handleChange('vin')}
                    maxLength={17} style={{ fontFamily: 'var(--font-mono)' }} />
                  {form.vin && form.vin.length === 17 && <VinValidator vin={form.vin} />}
                </div>
                <Field label="License Plate" value={form.license_plate} onChange={handleChange('license_plate')} />
                <div className="form-field">
                  <label className="label">Plate State</label>
                  <select value={form.license_state || ''} onChange={handleChange('license_state')}>
                    <option value="">Select...</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Field label="Color" value={form.color} onChange={handleChange('color')} />
                <div className="form-field">
                  <label className="label">Drivetrain</label>
                  <select value={form.drivetrain || ''} onChange={handleChange('drivetrain')}>
                    <option value="">Select...</option>
                    {DRIVETRAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <Field label="Lug Count" value={form.lug_count} onChange={handleChange('lug_count')} type="number" min="4" max="10" />
                <Field label="Lug Pattern" value={form.lug_pattern} onChange={handleChange('lug_pattern')} placeholder="e.g. 5x114.3" />
                <Field label="Torque Spec (ft-lbs)" value={form.torque_spec_ftlbs} onChange={handleChange('torque_spec_ftlbs')} type="number" />
                <Field label="OEM Tire Size" value={form.oem_tire_size} onChange={handleChange('oem_tire_size')} placeholder="e.g. 265/70R17" />
              </div>

              <div className="form-field" style={{ marginTop: '0.75rem' }}>
                <label className="label">Notes</label>
                <textarea rows={3} value={form.notes || ''} onChange={handleChange('notes')}
                  style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
                    borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.9375rem', resize: 'vertical' }} />
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary"
                  disabled={saving || !form.year || !form.make?.trim() || !form.model?.trim()}>
                  {saving ? <span className="spinner" /> : (isNew ? 'Create Vehicle' : 'Save Changes')}
                </button>
                {isNew && <Link to="/vehicles" className="btn btn-ghost">Cancel</Link>}
              </div>
            </form>
          </div>
        </div>

        {/* Right column: torque spec, history */}
        {!isNew && (
          <div>
            {/* Torque spec from lookup table */}
            {form.make && form.year && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <SectionTitle>Torque Specification</SectionTitle>
                <TorqueSpecPanel make={form.make} model={form.model} year={Number(form.year)}
                  override={form.torque_spec_ftlbs ? Number(form.torque_spec_ftlbs) : null} />
              </div>
            )}

            {/* Service history */}
            <div className="card">
              <SectionTitle>Service History</SectionTitle>
              {history.length > 0 ? (
                <table className="entity-table">
                  <thead>
                    <tr><th>Date</th><th>WO #</th><th>Service</th></tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 15).map((h, i) => (
                      <tr key={i}>
                        <td className="mono">{h.service_date?.slice(0, 10) || h.created_at?.slice(0, 10) || '\u2014'}</td>
                        <td className="mono">{h.wo_number || '\u2014'}</td>
                        <td>{h.description || h.service_type || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted" style={{ fontSize: '0.875rem' }}>No service history yet.</p>
              )}
            </div>
          </div>
        )}

        {!isNew && <CustomFieldValues entityType="vehicle" entityId={Number(id)} />}
      </div>
    </div>
  );
}


// ================================================================
// Vehicle Lookup Panel
// Two-tab interface: Plate Lookup and VIN Decode.
// Runs the VehicleLookupService pipeline on the backend.
// ================================================================

function VehicleLookupPanel({ onResult }) {
  const [tab, setTab] = useState('plate'); // 'plate' | 'vin'
  const [plate, setPlate] = useState('');
  const [plateState, setPlateState] = useState('CO');
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handlePlateLookup = async () => {
    if (!plate.trim() || !plateState) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.post('/vehicles/lookup/plate', { plate: plate.trim(), state: plateState });
      setResult(data);
      if (data.vehicle) onResult(data.vehicle);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVinDecode = async () => {
    if (!vin.trim() || vin.trim().length !== 17) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.post('/vehicles/lookup/vin', { vin: vin.trim() });
      setResult({ vehicle: data, source: 'vin_decode' });
      onResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Tab selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          className={`btn btn-sm ${tab === 'plate' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setTab('plate'); setResult(null); setError(null); }}
          type="button"
        >
          Plate Lookup
        </button>
        <button
          className={`btn btn-sm ${tab === 'vin' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setTab('vin'); setResult(null); setError(null); }}
          type="button"
        >
          VIN Decode
        </button>
      </div>

      {/* Plate lookup form */}
      {tab === 'plate' && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div className="form-field" style={{ flex: 1 }}>
            <label className="label">Plate Number</label>
            <input type="text" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="ABC1234" style={{ fontFamily: 'var(--font-mono)' }}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handlePlateLookup())} />
          </div>
          <div className="form-field" style={{ width: 80 }}>
            <label className="label">State</label>
            <select value={plateState} onChange={(e) => setPlateState(e.target.value)}>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handlePlateLookup}
            disabled={loading || !plate.trim()} type="button"
            style={{ marginBottom: '1px' }}>
            {loading ? <span className="spinner" /> : 'Lookup'}
          </button>
        </div>
      )}

      {/* VIN decode form */}
      {tab === 'vin' && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div className="form-field" style={{ flex: 1 }}>
            <label className="label">VIN (17 characters)</label>
            <input type="text" value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())}
              maxLength={17} placeholder="1HGBH41JXMN109186" style={{ fontFamily: 'var(--font-mono)' }}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleVinDecode())} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleVinDecode}
            disabled={loading || vin.trim().length !== 17} type="button"
            style={{ marginBottom: '1px' }}>
            {loading ? <span className="spinner" /> : 'Decode'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div className="alert alert-warning" style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>{error}</div>}

      {/* Results */}
      {result && result.vehicle && (
        <div className="lookup-result">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--green)' }}>
              {result.source === 'cache' ? 'Cache Hit' : result.source === 'api' ? 'API Result' : 'Decoded'}
            </span>
            {result.source === 'cache' && (
              <span className="badge" style={{ background: 'rgba(43,122,58,0.1)', color: 'var(--green)' }}>$0.00</span>
            )}
            {result.source === 'api' && (
              <span className="badge" style={{ background: 'var(--orange-lt)', color: 'var(--orange)' }}>$0.05</span>
            )}
          </div>

          <div className="form-grid readonly" style={{ fontSize: '0.8125rem' }}>
            <ReadField label="Year" value={result.vehicle.year} />
            <ReadField label="Make" value={result.vehicle.make} />
            <ReadField label="Model" value={result.vehicle.model} />
            <ReadField label="Trim" value={result.vehicle.trim_level} />
            {result.vehicle.vin && <ReadField label="VIN" value={result.vehicle.vin} />}
            {result.vehicle.body_style && <ReadField label="Body" value={result.vehicle.body_style} />}
            {result.vehicle.engine && <ReadField label="Engine" value={result.vehicle.engine} />}
            {result.vehicle.drive_type && <ReadField label="Drive" value={result.vehicle.drive_type} />}
            {result.vehicle.color && <ReadField label="Color" value={result.vehicle.color} />}
          </div>

          {/* Torque spec from lookup */}
          {result.torque && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'white', borderRadius: 'var(--radius-sm)' }}>
              <TorqueDisplay spec={result.torque} />
            </div>
          )}

          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
            Fields have been auto-filled in the form above. Review and save.
          </div>
        </div>
      )}
    </div>
  );
}


// ================================================================
// Torque Spec Panel
// Fetches torque spec for the vehicle's make/model/year from the
// three-tier matching system (exact, partial, fallback).
// ================================================================

function TorqueSpecPanel({ make, model, year, override }) {
  const [spec, setSpec] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!make || !year) { setLoading(false); return; }

    api.get(`/vehicles/torque-spec?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model || '')}&year=${year}`)
      .then((data) => setSpec(data.match ? data.spec : null))
      .catch(() => setSpec(null))
      .finally(() => setLoading(false));
  }, [make, model, year]);

  if (loading) return <span className="spinner" />;

  if (override) {
    return (
      <div>
        <div className="dash-stats">
          <div className="dash-stat">
            <div className="label">Torque (override)</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--navy)' }}>
              {override} ft-lbs
            </div>
          </div>
        </div>
        {spec && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--gray)' }}>
            Lookup table value: {spec.torque_ft_lbs_min}{spec.torque_ft_lbs_max !== spec.torque_ft_lbs_min ? ` - ${spec.torque_ft_lbs_max}` : ''} ft-lbs
            ({spec.match_level} match, {spec.confidence} confidence)
          </div>
        )}
      </div>
    );
  }

  if (!spec) {
    return (
      <div>
        <div className="alert alert-warning" style={{ fontSize: '0.8125rem' }}>
          No torque specification found for this vehicle. Enter a manual value in the form.
        </div>
      </div>
    );
  }

  return <TorqueDisplay spec={spec} />;
}


// ================================================================
// Torque Display (shared between lookup result and spec panel)
// ================================================================

function TorqueDisplay({ spec }) {
  const matchColors = {
    exact: { bg: 'rgba(43,122,58,0.1)', color: 'var(--green)' },
    partial: { bg: 'var(--orange-lt)', color: 'var(--orange)' },
    fallback: { bg: '#FDE8E8', color: 'var(--red)' },
  };
  const mc = matchColors[spec.match_level] || matchColors.fallback;

  const torqueRange = spec.torque_ft_lbs_min === spec.torque_ft_lbs_max
    ? `${spec.torque_ft_lbs_min}`
    : `${spec.torque_ft_lbs_min} - ${spec.torque_ft_lbs_max}`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--navy)' }}>
          {torqueRange} ft-lbs
        </div>
        <span className="badge" style={{ background: mc.bg, color: mc.color }}>
          {spec.match_level}
        </span>
        <span className="badge" style={{ background: 'var(--lgray)', color: 'var(--gray)' }}>
          {spec.confidence}
        </span>
      </div>
      <div className="form-grid readonly" style={{ fontSize: '0.8125rem' }}>
        {spec.lug_size_mm && <ReadField label="Lug Size" value={`${spec.lug_size_mm}mm`} />}
        {spec.lug_count && <ReadField label="Lug Count" value={spec.lug_count} />}
        {spec.notes && <ReadField label="Notes" value={spec.notes} />}
        <ReadField label="Verified" value={spec.is_verified ? 'Yes' : 'No'} />
      </div>
    </div>
  );
}


// ================================================================
// VIN Validator (inline, fires on 17-char VIN)
// ================================================================

function VinValidator({ vin }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!vin || vin.length !== 17) { setResult(null); return; }
    api.post('/vehicles/validate-vin', { vin })
      .then(setResult)
      .catch(() => setResult(null));
  }, [vin]);

  if (!result) return null;

  if (result.valid) {
    return <span style={{ fontSize: '0.75rem', color: 'var(--green)' }}>Valid VIN (check digit OK)</span>;
  }

  return <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{result.error || 'Invalid VIN'}</span>;
}


// ---- Shared Helpers ----

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

function ReadField({ label, value }) {
  return (
    <div className="form-field">
      <div className="label">{label}</div>
      <div style={{ fontSize: '0.9375rem', color: 'var(--dgray)' }}>{value ?? '\u2014'}</div>
    </div>
  );
}
