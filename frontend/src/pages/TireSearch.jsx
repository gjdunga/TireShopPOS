// ================================================================
// TireSearch (P2c)
// Search and browse tire inventory with filters: size, brand,
// condition, tread depth, price range, BIN location.
//
// Paginated results table with links to tire detail.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import './TireSearch.css';

const PAGE_SIZE = 25;

export default function TireSearch() {
  const { can } = useAuth();
  const [filters, setFilters] = useState({
    size: '',
    brand_id: '',
    condition: '',
    status: 'available',
    min_tread: '',
    min_price: '',
    max_price: '',
    bin_facility: '',
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [brands, setBrands] = useState([]);
  const initialLoad = useRef(true);

  // Load brand lookup
  useEffect(() => {
    api.get('/lookups/brands')
      .then((data) => setBrands(data.brands || []))
      .catch(() => {});
  }, []);

  // Search function
  const search = useCallback((newOffset = 0) => {
    setLoading(true);
    setError(null);
    setOffset(newOffset);

    const params = new URLSearchParams();
    if (filters.size.trim()) params.set('size', filters.size.trim());
    if (filters.brand_id) params.set('brand_id', filters.brand_id);
    if (filters.condition) params.set('condition', filters.condition);
    if (filters.status) params.set('status', filters.status);
    if (filters.min_tread) params.set('min_tread', filters.min_tread);
    if (filters.min_price) params.set('min_price', filters.min_price);
    if (filters.max_price) params.set('max_price', filters.max_price);
    if (filters.bin_facility) params.set('bin_facility', filters.bin_facility);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(newOffset));

    api.get(`/tires/search/advanced?${params.toString()}`)
      .then((data) => setResults(data.results))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  // Initial load
  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      search(0);
    }
  }, [search]);

  const handleSubmit = (e) => {
    e.preventDefault();
    search(0);
  };

  const handleChange = (field) => (e) => {
    setFilters((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const clearFilters = () => {
    setFilters({
      size: '', brand_id: '', condition: '', status: 'available',
      min_tread: '', min_price: '', max_price: '', bin_facility: '',
    });
  };

  const total = results?.total ?? 0;
  const rows = results?.rows ?? [];
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Tire Search & Inventory</h1>
        {can('INVENTORY_ADD') && (
          <Link to="/tires/new" className="btn btn-primary">+ Add Tire</Link>
        )}
      </div>

      {/* Filters */}
      <div className="card tire-filters">
        <form onSubmit={handleSubmit} className="filter-form">
          <div className="filter-row">
            <div className="filter-field filter-field-lg">
              <label className="label" htmlFor="f-size">Size</label>
              <input id="f-size" type="text" placeholder="e.g. 225/65R17, 225 65 17"
                value={filters.size} onChange={handleChange('size')} />
            </div>

            <div className="filter-field">
              <label className="label" htmlFor="f-brand">Brand</label>
              <select id="f-brand" value={filters.brand_id} onChange={handleChange('brand_id')}>
                <option value="">All Brands</option>
                {brands.map((b) => (
                  <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label className="label" htmlFor="f-cond">Condition</label>
              <select id="f-cond" value={filters.condition} onChange={handleChange('condition')}>
                <option value="">All</option>
                <option value="new">New</option>
                <option value="used">Used</option>
              </select>
            </div>

            <div className="filter-field">
              <label className="label" htmlFor="f-status">Status</label>
              <select id="f-status" value={filters.status} onChange={handleChange('status')}>
                <option value="available">Available</option>
                <option value="sold">Sold</option>
                <option value="reserved">Reserved</option>
                <option value="written_off">Written Off</option>
                <option value="">All Statuses</option>
              </select>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-field">
              <label className="label" htmlFor="f-tread">Min Tread (32nds)</label>
              <input id="f-tread" type="number" min="0" max="32" placeholder="e.g. 6"
                value={filters.min_tread} onChange={handleChange('min_tread')} />
            </div>

            <div className="filter-field">
              <label className="label" htmlFor="f-pmin">Min Price</label>
              <input id="f-pmin" type="number" min="0" step="0.01" placeholder="$"
                value={filters.min_price} onChange={handleChange('min_price')} />
            </div>

            <div className="filter-field">
              <label className="label" htmlFor="f-pmax">Max Price</label>
              <input id="f-pmax" type="number" min="0" step="0.01" placeholder="$"
                value={filters.max_price} onChange={handleChange('max_price')} />
            </div>

            <div className="filter-field">
              <label className="label" htmlFor="f-bin">Facility</label>
              <select id="f-bin" value={filters.bin_facility} onChange={handleChange('bin_facility')}>
                <option value="">All</option>
                <option value="R">Retail</option>
                <option value="S">Storage</option>
              </select>
            </div>

            <div className="filter-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Search'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
            </div>
          </div>
        </form>
      </div>

      {/* Error */}
      {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {/* Results */}
      {results && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="results-header">
            <span className="text-muted" style={{ fontSize: '0.8125rem' }}>
              {total} tire{total !== 1 ? 's' : ''} found
              {totalPages > 1 && ` (page ${currentPage} of ${totalPages})`}
            </span>
          </div>

          {rows.length > 0 ? (
            <div className="table-wrap">
              <table className="tire-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Brand</th>
                    <th>Model</th>
                    <th>Cond</th>
                    <th>Tread</th>
                    <th>Price</th>
                    <th>BIN</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.tire_id}>
                      <td className="mono">{t.full_size_string || formatSize(t)}</td>
                      <td>{t.brand_name || '\u2014'}</td>
                      <td>{t.model_name || '\u2014'}</td>
                      <td>{condBadge(t.condition)}</td>
                      <td>{t.tread_depth_32nds != null ? `${t.tread_depth_32nds}/32` : '\u2014'}</td>
                      <td>{t.retail_price ? `$${Number(t.retail_price).toFixed(2)}` : '\u2014'}</td>
                      <td className="mono">{t.bin_location || '\u2014'}</td>
                      <td><StatusPill status={t.status} /></td>
                      <td>
                        <Link to={`/tires/${t.tire_id}`} className="btn btn-ghost btn-sm">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted" style={{ padding: '1rem 0', textAlign: 'center' }}>
              No tires match the current filters.
            </p>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm"
                disabled={currentPage <= 1}
                onClick={() => search(offset - PAGE_SIZE)}>
                Prev
              </button>
              <span className="text-muted" style={{ fontSize: '0.8125rem' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button className="btn btn-ghost btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => search(offset + PAGE_SIZE)}>
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ---- Helpers ----

function formatSize(t) {
  if (t.section_width && t.aspect_ratio && t.rim_diameter) {
    return `${t.section_width}/${t.aspect_ratio}R${t.rim_diameter}`;
  }
  return '\u2014';
}

function condBadge(cond) {
  if (cond === 'new') return <span className="badge" style={{ background: 'var(--green-lt)', color: 'var(--green)' }}>New</span>;
  if (cond === 'used') return <span className="badge" style={{ background: 'var(--orange-lt)', color: 'var(--orange)' }}>Used</span>;
  return <span className="badge">{cond || '\u2014'}</span>;
}

function StatusPill({ status }) {
  const map = {
    available: { bg: 'var(--green-lt)', color: 'var(--green)' },
    sold: { bg: 'var(--lgray)', color: 'var(--gray)' },
    reserved: { bg: 'rgba(74,124,207,0.1)', color: 'var(--blue)' },
    written_off: { bg: '#FDE8E8', color: 'var(--red)' },
  };
  const s = map[status] || { bg: 'var(--lgray)', color: 'var(--gray)' };
  return <span className="badge" style={{ background: s.bg, color: s.color }}>{(status || '').replace(/_/g, ' ')}</span>;
}
