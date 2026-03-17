// ================================================================
// FitmentSearch (P3c)
// Vehicle fitment search, reverse tire size lookup, bolt pattern
// DunganSoft Technologies, March 2026
// ================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';

export default function FitmentSearch() {
  const [tab, setTab] = useState('vehicle');
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Fitment Search</h1>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', borderBottom: '1px solid var(--lgray)', paddingBottom: '0.75rem' }}>
        <button className={`btn btn-sm ${tab === 'vehicle' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('vehicle')}>By Vehicle</button>
        <button className={`btn btn-sm ${tab === 'reverse' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('reverse')}>Reverse Lookup</button>
        <button className={`btn btn-sm ${tab === 'bolt' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('bolt')}>Bolt Pattern</button>
      </div>
      {tab === 'vehicle' && <VehicleFitment />}
      {tab === 'reverse' && <ReverseLookup />}
      {tab === 'bolt' && <BoltPatternSearch />}
    </div>
  );
}

function VehicleFitment() {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!make || !model) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ make, model });
      if (year) qs.set('year', year);
      const data = await api.get(`/fitment/search?${qs}`);
      setResults(data);
    } catch {} finally { setLoading(false); }
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-field"><label className="label">Make</label>
            <input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Toyota" /></div>
          <div className="form-field"><label className="label">Model</label>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Tacoma" /></div>
          <div className="form-field"><label className="label">Year</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" style={{ width: 80 }} /></div>
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !make || !model}>
            {loading ? <span className="spinner" /> : 'Search'}
          </button>
        </div>
      </div>

      {results && (
        <div style={{ marginTop: '1rem' }}>
          {results.note && (
            <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: '#FFF3CD', borderRadius: '6px', fontSize: '0.8125rem', color: '#856404' }}>
              {results.note}
            </div>
          )}

          {(results.specs || []).length > 0 && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Torque Specs</h3>
              <table className="entity-table">
                <thead><tr><th>Make</th><th>Model</th><th>Years</th><th>Torque (ft-lbs)</th><th>Lug Size</th></tr></thead>
                <tbody>
                  {results.specs.map((s, i) => (
                    <tr key={i}><td>{s.make}</td><td>{s.model}</td><td className="mono">{s.year_start}-{s.year_end}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{s.torque_ft_lbs_min}{s.torque_ft_lbs_max !== s.torque_ft_lbs_min ? '-' + s.torque_ft_lbs_max : ''}</td>
                      <td className="mono">{s.lug_size_mm || '\u2014'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(results.tires || []).length > 0 && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Tires In Stock</h3>
              <table className="entity-table">
                <thead><tr><th>Size</th><th>Brand</th><th>Cond</th><th>Tread</th><th>Price</th><th></th></tr></thead>
                <tbody>
                  {results.tires.map((t) => (
                    <tr key={t.tire_id}><td className="mono">{t.full_size_string}</td><td>{t.brand_name}</td>
                      <td><span className={`badge ${t.condition === 'new' ? 'badge-green' : 'badge-orange'}`}>{t.condition}</span></td>
                      <td className="mono">{t.tread_depth_32nds}/32</td>
                      <td className="mono">${Number(t.retail_price).toFixed(2)}</td>
                      <td><Link to={`/tires/${t.tire_id}`} className="btn btn-ghost btn-sm">View</Link></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(results.wheels || []).length > 0 && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Wheels In Stock</h3>
              <table className="entity-table">
                <thead><tr><th>Brand/Model</th><th>Size</th><th>Bolt</th><th>Material</th><th>Qty</th><th>Price</th></tr></thead>
                <tbody>
                  {results.wheels.map((w) => (
                    <tr key={w.wheel_id}><td>{[w.brand, w.model].filter(Boolean).join(' ')}</td>
                      <td className="mono">{w.diameter}"</td><td className="mono">{w.bolt_pattern}</td>
                      <td style={{ textTransform: 'capitalize' }}>{w.material}</td>
                      <td className="mono">{w.quantity}</td>
                      <td className="mono">{w.retail_price ? '$' + Number(w.retail_price).toFixed(2) : '\u2014'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(results.tires || []).length === 0 && (results.wheels || []).length === 0 && (results.specs || []).length === 0 && (
            <div className="card"><p className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>No fitment data found.</p></div>
          )}
        </div>
      )}
    </div>
  );
}

function ReverseLookup() {
  const [size, setSize] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!size) return;
    setLoading(true);
    try { setResults(await api.get(`/fitment/reverse?size=${encodeURIComponent(size)}`)); }
    catch {} finally { setLoading(false); }
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div className="form-field"><label className="label">Tire Size</label>
            <input type="text" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 265/70R17" /></div>
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !size}>
            {loading ? <span className="spinner" /> : 'Search'}
          </button>
        </div>
      </div>
      {results && (
        <div style={{ marginTop: '1rem' }}>
          {(results.vehicles || []).length > 0 && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Vehicles Using This Size</h3>
              <table className="entity-table">
                <thead><tr><th>Year</th><th>Make</th><th>Model</th></tr></thead>
                <tbody>{results.vehicles.map((v, i) => (
                  <tr key={i}><td className="mono">{v.year}</td><td>{v.make}</td><td>{v.model}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {(results.in_stock || []).length > 0 && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>In Stock ({results.in_stock.length})</h3>
              <table className="entity-table">
                <thead><tr><th>Size</th><th>Brand</th><th>Cond</th><th>Price</th></tr></thead>
                <tbody>{results.in_stock.map((t) => (
                  <tr key={t.tire_id}><td className="mono">{t.full_size_string}</td><td>{t.brand_name}</td>
                    <td>{t.condition}</td><td className="mono">${Number(t.retail_price).toFixed(2)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BoltPatternSearch() {
  const [pattern, setPattern] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!pattern) return;
    setLoading(true);
    try { setResults(await api.get(`/fitment/bolt-pattern?pattern=${encodeURIComponent(pattern)}`)); }
    catch {} finally { setLoading(false); }
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div className="form-field"><label className="label">Bolt Pattern</label>
            <input type="text" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. 5x114.3" /></div>
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !pattern}>
            {loading ? <span className="spinner" /> : 'Search'}
          </button>
        </div>
      </div>
      {results && (
        <div style={{ marginTop: '1rem' }}>
          {(results.wheels || []).length > 0 && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Wheels with {pattern}</h3>
              <table className="entity-table">
                <thead><tr><th>Brand</th><th>Diameter</th><th>Material</th><th>Qty</th><th>Price</th></tr></thead>
                <tbody>{results.wheels.map((w) => (
                  <tr key={w.wheel_id}><td>{[w.brand, w.model].filter(Boolean).join(' ')}</td>
                    <td className="mono">{w.diameter}"</td><td style={{ textTransform: 'capitalize' }}>{w.material}</td>
                    <td className="mono">{w.quantity}</td><td className="mono">{w.retail_price ? '$' + Number(w.retail_price).toFixed(2) : '\u2014'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {(results.vehicles || []).length > 0 && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Vehicles</h3>
              <table className="entity-table">
                <thead><tr><th>Make</th><th>Model</th><th>Years</th></tr></thead>
                <tbody>{results.vehicles.map((v, i) => (
                  <tr key={i}><td>{v.make}</td><td>{v.model}</td><td className="mono">{v.year_start}-{v.year_end}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
