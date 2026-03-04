// ================================================================
// WorkOrderList (P2e)
// List work orders with status filter. Links to detail/create.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import '../pages/CustomerSearch.css';

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'intake', label: 'Intake' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'quality_check', label: 'QC' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE = 25;

export default function WorkOrderList() {
  const [status, setStatus] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    api.get(`/work-orders?${params}`)
      .then((d) => setResults(d.results))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, offset]);

  useEffect(() => { load(); }, [load]);

  const rows = results?.rows ?? [];
  const total = results?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Work Orders</h1>
        <Link to="/work-orders/new" className="btn btn-primary">+ New Work Order</Link>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="label" style={{ marginBottom: 0 }}>Status:</span>
          {STATUSES.map((s) => (
            <button key={s.value}
              className={`btn btn-sm ${status === s.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setStatus(s.value); setOffset(0); }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem' }}><span className="spinner" /></div>}

      {!loading && rows.length > 0 && (
        <div className="card">
          <table className="entity-table">
            <thead>
              <tr>
                <th>WO #</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Tech</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((wo) => (
                <tr key={wo.work_order_id}>
                  <td className="mono" style={{ fontWeight: 500 }}>{wo.wo_number}</td>
                  <td>{wo.customer_first ? `${wo.customer_first} ${wo.customer_last}` : '\u2014'}</td>
                  <td>{wo.vehicle_year ? `${wo.vehicle_year} ${wo.vehicle_make} ${wo.vehicle_model}` : '\u2014'}</td>
                  <td>{wo.assigned_tech_name || 'Unassigned'}</td>
                  <td><StatusBadge status={wo.status} /></td>
                  <td className="mono">{wo.created_at?.slice(0, 10)}</td>
                  <td><Link to={`/work-orders/${wo.work_order_id}`} className="btn btn-ghost btn-sm">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setOffset(offset - PAGE_SIZE)}>Prev</button>
              <span className="text-muted" style={{ fontSize: '0.8125rem' }}>Page {page} of {totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
            </div>
          )}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="text-muted">No work orders{status ? ` with status "${status}"` : ''}.</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    intake: '#4A7CCF', in_progress: '#D4700A', quality_check: '#7B61FF',
    complete: '#2B7A3A', cancelled: '#6B6560',
  };
  const bg = {
    intake: 'rgba(74,124,207,0.1)', in_progress: 'rgba(212,112,10,0.1)', quality_check: 'rgba(123,97,255,0.1)',
    complete: 'rgba(43,122,58,0.1)', cancelled: 'rgba(107,101,96,0.1)',
  };
  return (
    <span className="badge" style={{ color: colors[status] || '#6B6560', background: bg[status] || 'var(--lgray)' }}>
      {(status || '').replace(/_/g, ' ')}
    </span>
  );
}
