// ================================================================
// InvoiceList (P2e)
// List invoices with status filter, totals, pagination.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import '../pages/CustomerSearch.css';

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'held', label: 'Held' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
];

const PAGE_SIZE = 25;

export default function InvoiceList() {
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
    api.get(`/invoices?${params}`)
      .then((d) => setResults(d.results))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, offset]);

  useEffect(() => { load(); }, [load]);

  const rows = results?.rows ?? [];
  const total = results?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const fmt = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? '$0.00' : `$${n.toFixed(2)}`;
  };

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Invoices</h1>
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
                <th>Invoice #</th>
                <th>Customer</th>
                <th>WO</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.invoice_id}>
                  <td className="mono" style={{ fontWeight: 500 }}>{inv.invoice_number}</td>
                  <td>{inv.customer_first ? `${inv.customer_first} ${inv.customer_last}` : '\u2014'}</td>
                  <td className="mono">{inv.work_order_id || '\u2014'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt(inv.total)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: parseFloat(inv.balance_due) > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {fmt(inv.balance_due)}
                  </td>
                  <td><InvStatusBadge status={inv.status} /></td>
                  <td className="mono">{inv.created_at?.slice(0, 10)}</td>
                  <td><Link to={`/invoices/${inv.invoice_id}`} className="btn btn-ghost btn-sm">View</Link></td>
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
          <p className="text-muted">No invoices{status ? ` with status "${status}"` : ''}.</p>
        </div>
      )}
    </div>
  );
}

function InvStatusBadge({ status }) {
  const colors = { open: '#4A7CCF', held: '#D4700A', completed: '#2B7A3A', voided: '#6B6560' };
  const bg = { open: 'rgba(74,124,207,0.1)', held: 'rgba(212,112,10,0.1)', completed: 'rgba(43,122,58,0.1)', voided: 'rgba(107,101,96,0.1)' };
  return <span className="badge" style={{ color: colors[status] || '#6B6560', background: bg[status] || 'var(--lgray)' }}>{status || '\u2014'}</span>;
}
