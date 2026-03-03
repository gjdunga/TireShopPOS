// ================================================================
// VehicleSearch (P2d)
// Search vehicles by VIN, plate, or year/make/model.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import './CustomerSearch.css';

export default function VehicleSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }

    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      api.get(`/vehicles/search?q=${encodeURIComponent(query.trim())}&limit=30`)
        .then((data) => setResults(data.results || []))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer.current);
  }, [query]);

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Vehicles</h1>
        <Link to="/vehicles/new" className="btn btn-primary">+ New Vehicle</Link>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="search-bar">
          <input
            type="search"
            placeholder="Search by VIN, plate, or year/make/model..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {loading && <span className="spinner" style={{ position: 'absolute', right: 12, top: 10 }} />}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {results && results.length > 0 && (
        <div className="card">
          <table className="entity-table">
            <thead>
              <tr>
                <th>Year/Make/Model</th>
                <th>VIN</th>
                <th>Plate</th>
                <th>Owner(s)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((v) => (
                <tr key={v.vehicle_id}>
                  <td style={{ fontWeight: 500 }}>{v.year} {v.make} {v.model}{v.trim_level ? ` ${v.trim_level}` : ''}</td>
                  <td className="mono">{v.vin ? v.vin.slice(-8) : '\u2014'}</td>
                  <td className="mono">{v.license_plate || '\u2014'}</td>
                  <td>{v.owners || '\u2014'}</td>
                  <td>
                    <Link to={`/vehicles/${v.vehicle_id}`} className="btn btn-ghost btn-sm">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && results.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="text-muted">No vehicles found for "{query}"</p>
          <Link to="/vehicles/new" className="btn btn-primary btn-sm" style={{ marginTop: '0.75rem' }}>
            Create New Vehicle
          </Link>
        </div>
      )}

      {!results && query.trim().length < 2 && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="text-muted">Type at least 2 characters to search.</p>
        </div>
      )}
    </div>
  );
}
