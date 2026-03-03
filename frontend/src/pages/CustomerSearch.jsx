// ================================================================
// CustomerSearch (P2d)
// Search customers by name, phone, or email.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import './CustomerSearch.css';

export default function CustomerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }

    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      api.get(`/customers/search?q=${encodeURIComponent(query.trim())}&limit=30`)
        .then((data) => setResults(data.results || []))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer.current);
  }, [query]);

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Customers</h1>
        <Link to="/customers/new" className="btn btn-primary">+ New Customer</Link>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="search-bar">
          <input
            type="search"
            placeholder="Search by name, phone, or email..."
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
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => (
                <tr key={c.customer_id}>
                  <td style={{ fontWeight: 500 }}>{c.first_name} {c.last_name}</td>
                  <td className="mono">{c.phone_primary || '\u2014'}</td>
                  <td>{c.email || '\u2014'}</td>
                  <td>
                    <Link to={`/customers/${c.customer_id}`} className="btn btn-ghost btn-sm">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && results.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="text-muted">No customers found for "{query}"</p>
          <Link to="/customers/new" className="btn btn-primary btn-sm" style={{ marginTop: '0.75rem' }}>
            Create New Customer
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
