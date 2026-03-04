// ================================================================
// PurchaseOrderList (P2f)
// List POs with status filter. Links to detail/create.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import './SupportOps.css';

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'partial', label: 'Partial' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS = {
  draft: 'badge-gray',
  submitted: 'badge-blue',
  confirmed: 'badge-blue',
  partial: 'badge-orange',
  received: 'badge-green',
  cancelled: 'badge-gray',
};

export default function PurchaseOrderList() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ rows: [], total: 0 });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit, offset });
    if (status) qs.set('status', status);
    api.get(`/purchase-orders?${qs}`)
      .then((res) => setData(res.results || { rows: [], total: 0 }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, offset]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOffset(0); }, [status]);

  const pages = Math.ceil(data.total / limit) || 1;
  const page = Math.floor(offset / limit) + 1;

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Purchase Orders</h1>
        <Link to="/purchase-orders/new" className="btn btn-primary">+ New PO</Link>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <button key={s.value} type="button"
              className={`btn btn-sm ${status === s.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatus(s.value)}>
              {s.label}
            </button>
          ))}
          <span className="text-muted" style={{ marginLeft: 'auto', fontSize: '0.8125rem' }}>
            {data.total} total
          </span>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}><span className="spinner" /></div>
        ) : data.rows.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>No purchase orders found.</p>
        ) : (
          <table className="entity-table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Vendor</th>
                <th>Order Date</th>
                <th>Expected</th>
                <th>Subtotal</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((po) => (
                <tr key={po.po_id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{po.po_number}</td>
                  <td>{po.vendor_name || '\u2014'}</td>
                  <td className="mono">{po.order_date?.slice(0, 10)}</td>
                  <td className="mono">{po.expected_delivery?.slice(0, 10) || '\u2014'}</td>
                  <td className="mono">${Number(po.subtotal || 0).toFixed(2)}</td>
                  <td><span className={`badge ${STATUS_COLORS[po.status] || ''}`}>{po.status}</span></td>
                  <td><Link to={`/purchase-orders/${po.po_id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost btn-sm" disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
          <span className="text-muted">Page {page} of {pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= pages}
            onClick={() => setOffset(offset + limit)}>Next</button>
        </div>
      )}
    </div>
  );
}
