// ================================================================
// AuditLog
// Searchable, filterable audit log viewer.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

const PAGE_SIZE = 50;

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ table: '', action: '', user_id: '' });
  const [offset, setOffset] = useState(0);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.get('/users').then((d) => setUsers(d.users || [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.table) qs.set('table', filters.table);
    if (filters.action) qs.set('action', filters.action);
    if (filters.user_id) qs.set('user_id', filters.user_id);
    qs.set('limit', PAGE_SIZE);
    qs.set('offset', offset);

    api.get(`/audit?${qs}`)
      .then((d) => setEntries(d.entries || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters, offset]);

  useEffect(() => { load(); }, [load]);

  const handleFilter = (field) => (e) => {
    setFilters((p) => ({ ...p, [field]: e.target.value }));
    setOffset(0);
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Audit Log</h1>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div className="form-field" style={{ minWidth: 140 }}>
          <label className="label" style={{ fontSize: '0.75rem' }}>Table</label>
          <select value={filters.table} onChange={handleFilter('table')} style={{ fontSize: '0.85rem' }}>
            <option value="">All Tables</option>
            {['customers', 'vehicles', 'tires', 'work_orders', 'work_order_positions',
              'appointments', 'purchase_orders', 'users', 'shop_settings', 'warranty_claims',
              'wheels', 'marketplace_listings', 'marketplace_orders'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ minWidth: 120 }}>
          <label className="label" style={{ fontSize: '0.75rem' }}>Action</label>
          <select value={filters.action} onChange={handleFilter('action')} style={{ fontSize: '0.85rem' }}>
            <option value="">All Actions</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div className="form-field" style={{ minWidth: 140 }}>
          <label className="label" style={{ fontSize: '0.75rem' }}>User</label>
          <select value={filters.user_id} onChange={handleFilter('user_id')} style={{ fontSize: '0.85rem' }}>
            <option value="">All Users</option>
            {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name || u.username}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({ table: '', action: '', user_id: '' }); setOffset(0); }}
          style={{ fontSize: '0.75rem' }}>Clear</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>
      ) : entries.length === 0 ? (
        <p className="text-muted">No audit entries found.</p>
      ) : (
        <>
          <table className="entity-table" style={{ fontSize: '0.8rem', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Table</th>
                <th>Record</th>
                <th>Field</th>
                <th>Old Value</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.audit_id}>
                  <td className="mono" style={{ fontSize: '0.7rem' }}>{(e.changed_at || '').slice(0, 19)}</td>
                  <td>{e.changed_by_username || e.changed_by || ''}</td>
                  <td><span style={{
                    padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 600,
                    background: e.action === 'INSERT' ? '#d4edda' : e.action === 'DELETE' ? '#f8d7da' : '#fff3cd',
                    color: e.action === 'INSERT' ? '#155724' : e.action === 'DELETE' ? '#721c24' : '#856404',
                  }}>{e.action}</span></td>
                  <td className="mono" style={{ fontSize: '0.75rem' }}>{e.table_name}</td>
                  <td className="mono" style={{ fontSize: '0.75rem' }}>{e.record_id || ''}</td>
                  <td style={{ fontSize: '0.75rem' }}>{e.field_name || ''}</td>
                  <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem', color: '#999' }}>{e.old_value || ''}</td>
                  <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem' }}>{e.new_value || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button className="btn btn-ghost btn-sm" disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
            <span style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', color: '#666' }}>
              Showing {offset + 1} to {offset + entries.length}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={entries.length < PAGE_SIZE}
              onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
