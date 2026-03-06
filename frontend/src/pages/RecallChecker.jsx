// ================================================================
// RecallChecker (P4b)
// NHTSA tire recall search by vehicle or DOT/TIN.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState } from 'react';
import api from '../api/client.js';

export default function RecallChecker() {
  const [tab, setTab] = useState('vehicle');
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>NHTSA Recall Checker</h1>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', borderBottom: '1px solid var(--lgray)', paddingBottom: '0.75rem' }}>
        <button className={`btn btn-sm ${tab === 'vehicle' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('vehicle')}>By Vehicle</button>
        <button className={`btn btn-sm ${tab === 'tire' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('tire')}>By DOT/TIN</button>
      </div>
      {tab === 'vehicle' && <VehicleRecallSearch />}
      {tab === 'tire' && <TireRecallSearch />}
    </div>
  );
}

function VehicleRecallSearch() {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ make });
      if (model) qs.set('model', model);
      if (year) qs.set('year', year);
      const data = await api.get(`/recalls/vehicle?${qs}`);
      setResults(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-field"><label className="label">Make *</label>
            <input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Toyota" /></div>
          <div className="form-field"><label className="label">Model</label>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Tacoma" /></div>
          <div className="form-field"><label className="label">Year</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" style={{ width: 80 }} /></div>
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !make}>
            {loading ? <span className="spinner" /> : 'Check Recalls'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{error}</div>}

      {results && (
        <div style={{ marginTop: '1rem' }}>
          <div className="card" style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.875rem' }}>
              <strong>{results.total_results}</strong> total recalls found, <strong style={{ color: results.tire_related > 0 ? 'var(--red)' : 'var(--green)' }}>{results.tire_related}</strong> tire/wheel related.
            </p>
          </div>
          {(results.recalls || []).length === 0 ? (
            <div className="card" style={{ background: '#E8F5E9', borderColor: 'var(--green)' }}>
              <p style={{ color: 'var(--green)', fontWeight: 600 }}>No tire or wheel recalls found for this vehicle.</p>
            </div>
          ) : (
            <RecallList recalls={results.recalls} />
          )}
        </div>
      )}
    </div>
  );
}

function TireRecallSearch() {
  const [dot, setDot] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/recalls/tire?dot=${encodeURIComponent(dot)}`);
      setResults(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="card">
        <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
          Enter the DOT/TIN code from the tire sidewall. Format: DOT XXXX XXXX WWYY
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div className="form-field" style={{ flex: 1 }}><label className="label">DOT/TIN</label>
            <input type="text" className="mono" value={dot} onChange={(e) => setDot(e.target.value.toUpperCase())}
              placeholder="e.g. DOT H2PB LMKR 2519" /></div>
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !dot}>
            {loading ? <span className="spinner" /> : 'Check'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{error}</div>}

      {results && (
        <div style={{ marginTop: '1rem' }}>
          <div className="card" style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.875rem' }}>
              <strong>{results.total_results}</strong> tire recalls in NHTSA database.
              Showing most recent 50. Manual DOT/TIN cross-reference recommended for specific tire identification.
            </p>
          </div>
          <RecallList recalls={results.recalls || []} />
        </div>
      )}
    </div>
  );
}

function RecallList({ recalls }) {
  if (recalls.length === 0) return null;
  return (
    <div>
      {recalls.map((r, i) => (
        <div key={i} className="card" style={{ marginBottom: '0.75rem', borderLeft: '4px solid var(--red)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
            <span className="mono" style={{ fontWeight: 600, color: 'var(--red)' }}>{r.nhtsa_campaign}</span>
            {r.manufacturer && <span className="text-muted" style={{ fontSize: '0.8125rem' }}>{r.manufacturer}</span>}
          </div>
          {r.component && <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>{r.component}</div>}
          {r.summary && <div style={{ fontSize: '0.8125rem', color: '#444', marginBottom: '0.25rem' }}>{r.summary}</div>}
          {r.consequence && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--red)' }}>
              <strong>Consequence:</strong> {r.consequence}
            </div>
          )}
          {r.remedy && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--green)' }}>
              <strong>Remedy:</strong> {r.remedy}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
