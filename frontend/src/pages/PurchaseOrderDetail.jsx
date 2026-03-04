// ================================================================
// PurchaseOrderDetail (P2f)
// Create PO, add line items, receive against PO.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import './SupportOps.css';

const PO_STATUSES = ['draft', 'submitted', 'confirmed', 'partial', 'received', 'cancelled'];

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const isNew = id === 'new';

  const [po, setPo] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({
    vendor_id: '', expected_delivery: '', vendor_confirmation: '', notes: '',
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    if (isNew) {
      api.get('/vendors').then((d) => setVendors(d.vendors || [])).catch(() => {});
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.get(`/purchase-orders/${id}`),
      api.get('/vendors').catch(() => ({ vendors: [] })),
    ])
      .then(([poData, vendorData]) => {
        setPo(poData);
        setVendors(vendorData.vendors || []);
        setForm({
          vendor_id: poData.vendor_id || '',
          expected_delivery: poData.expected_delivery?.slice(0, 10) || '',
          vendor_confirmation: poData.vendor_confirmation || '',
          notes: poData.notes || '',
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.vendor_id) { setError('Select a vendor.'); return; }
    setSaving(true);
    try {
      const result = await api.post('/purchase-orders', {
        vendor_id: Number(form.vendor_id),
        expected_delivery: form.expected_delivery || null,
        notes: form.notes || null,
      });
      navigate(`/purchase-orders/${result.po_id}`, { replace: true });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;
  }

  return (
    <div>
      <Link to="/purchase-orders" className="text-muted" style={{ fontSize: '0.8125rem' }}>&larr; Back to Purchase Orders</Link>
      <h1 style={{ fontSize: '1.5rem', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
        {isNew ? 'New Purchase Order' : `PO ${po?.po_number || ''}`}
      </h1>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      <div className="ops-two-col">
        {/* Left: PO info + line items */}
        <div>
          <div className="card">
            <SectionTitle>{isNew ? 'PO Information' : 'Details'}</SectionTitle>
            <div className="form-grid">
              <div className="form-field">
                <label className="label">Vendor</label>
                {isNew ? (
                  <select value={form.vendor_id} onChange={(e) => setForm((p) => ({ ...p, vendor_id: e.target.value }))}>
                    <option value="">Select vendor...</option>
                    {vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{po?.vendor_name || '\u2014'}</div>
                )}
              </div>
              <div className="form-field">
                <label className="label">Expected Delivery</label>
                <input type="date" value={form.expected_delivery}
                  onChange={(e) => setForm((p) => ({ ...p, expected_delivery: e.target.value }))}
                  disabled={!isNew && po?.status === 'received'} />
              </div>
              {!isNew && (
                <>
                  <div className="form-field">
                    <label className="label">Status</label>
                    <span className="badge">{po?.status}</span>
                  </div>
                  <div className="form-field">
                    <label className="label">Order Date</label>
                    <span className="mono">{po?.order_date?.slice(0, 10)}</span>
                  </div>
                </>
              )}
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label className="label">Vendor Confirmation #</label>
                <input type="text" value={form.vendor_confirmation}
                  onChange={(e) => setForm((p) => ({ ...p, vendor_confirmation: e.target.value }))}
                  disabled={!isNew && po?.status === 'received'} />
              </div>
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label className="label">Notes</label>
                <textarea rows={2} value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
                    borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.9375rem' }} />
              </div>
            </div>

            {isNew && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.vendor_id}>
                  {saving ? <span className="spinner" /> : 'Create PO'}
                </button>
                <Link to="/purchase-orders" className="btn btn-ghost">Cancel</Link>
              </div>
            )}
          </div>

          {/* Line items (only after creation) */}
          {!isNew && po && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <SectionTitle>Line Items</SectionTitle>
              <LineItemsTable lines={po.line_items || []} />
              {po.status !== 'received' && po.status !== 'cancelled' && can('PO_CREATE') && (
                <AddLineForm poId={po.po_id} onAdded={() => { setMsg('Line added.'); load(); }} onError={setError} />
              )}
              <div className="ops-stats" style={{ marginTop: '0.75rem' }}>
                <div className="ops-stat">
                  <div className="label">Subtotal</div>
                  <div className="ops-stat-val">${Number(po.subtotal || 0).toFixed(2)}</div>
                </div>
                <div className="ops-stat">
                  <div className="label">Shipping</div>
                  <div className="ops-stat-val">${Number(po.shipping_cost || 0).toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: receive panel */}
        {!isNew && po && ['submitted', 'confirmed', 'partial'].includes(po.status) && can('PO_RECEIVE') && (
          <div className="card">
            <SectionTitle>Receive Items</SectionTitle>
            <ReceivePanel po={po} onReceived={() => { setMsg('Items received.'); load(); }} onError={setError} />
          </div>
        )}
      </div>
    </div>
  );
}

function LineItemsTable({ lines }) {
  if (!lines || lines.length === 0) {
    return <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>No line items.</p>;
  }

  return (
    <table className="entity-table" style={{ marginBottom: '0.75rem' }}>
      <thead>
        <tr><th>Description</th><th>Ordered</th><th>Received</th><th>Unit Cost</th><th>Total</th></tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.po_line_id}>
            <td>{l.description}</td>
            <td className="mono">{l.quantity_ordered}</td>
            <td className="mono" style={{ color: l.quantity_received >= l.quantity_ordered ? 'var(--green)' : 'var(--orange)' }}>
              {l.quantity_received}
            </td>
            <td className="mono">${Number(l.unit_cost || 0).toFixed(2)}</td>
            <td className="mono">${Number(l.line_total || 0).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddLineForm({ poId, onAdded, onError }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ description: '', quantity_ordered: '1', unit_cost: '' });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!form.description.trim() || !form.unit_cost) { onError('Enter description and unit cost.'); return; }
    setSaving(true);
    try {
      await api.post(`/purchase-orders/${poId}/lines`, {
        description: form.description.trim(),
        quantity_ordered: Number(form.quantity_ordered) || 1,
        unit_cost: form.unit_cost,
      });
      setForm({ description: '', quantity_ordered: '1', unit_cost: '' });
      setShow(false);
      onAdded();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  if (!show) {
    return <button className="btn btn-ghost btn-sm" onClick={() => setShow(true)}>+ Add Line Item</button>;
  }

  return (
    <div style={{ background: 'var(--lgray)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
      <div className="form-grid">
        <div className="form-field" style={{ gridColumn: '1 / -1' }}>
          <label className="label">Description (tire spec)</label>
          <input type="text" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="e.g. 265/70R17 Falken Wildpeak AT3W" />
        </div>
        <div className="form-field">
          <label className="label">Qty Ordered</label>
          <input type="number" min="1" value={form.quantity_ordered}
            onChange={(e) => setForm((p) => ({ ...p, quantity_ordered: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="label">Unit Cost ($)</label>
          <input type="number" step="0.01" min="0" value={form.unit_cost}
            onChange={(e) => setForm((p) => ({ ...p, unit_cost: e.target.value }))} />
        </div>
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Add'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShow(false)}>Cancel</button>
      </div>
    </div>
  );
}

function ReceivePanel({ po, onReceived, onError }) {
  const lines = (po.line_items || []).filter((l) => l.quantity_received < l.quantity_ordered);
  const [qtys, setQtys] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = {};
    lines.forEach((l) => { init[l.po_line_id] = l.quantity_ordered - l.quantity_received; });
    setQtys(init);
  }, [po]);

  const handleReceive = async () => {
    const items = Object.entries(qtys)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([id, qty]) => ({ po_line_id: Number(id), quantity_received: Number(qty) }));

    if (items.length === 0) { onError('Enter quantities to receive.'); return; }
    setSaving(true);
    try {
      await api.post(`/purchase-orders/${po.po_id}/receive`, { items });
      onReceived();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  if (lines.length === 0) {
    return <p className="text-muted" style={{ fontSize: '0.875rem' }}>All items have been received.</p>;
  }

  return (
    <div>
      {lines.map((l) => (
        <div key={l.po_line_id} className="receive-row">
          <div style={{ flex: 1, fontSize: '0.8125rem' }}>
            <div style={{ fontWeight: 500 }}>{l.description}</div>
            <span className="text-muted">Remaining: {l.quantity_ordered - l.quantity_received}</span>
          </div>
          <input type="number" min="0" max={l.quantity_ordered - l.quantity_received}
            value={qtys[l.po_line_id] ?? ''}
            onChange={(e) => setQtys((p) => ({ ...p, [l.po_line_id]: e.target.value }))}
            style={{ width: 60, textAlign: 'center' }} />
        </div>
      ))}
      <button className="btn btn-primary" onClick={handleReceive} disabled={saving} style={{ marginTop: '0.75rem' }}>
        {saving ? <span className="spinner" /> : 'Receive Items'}
      </button>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', fontWeight: 600,
      color: 'var(--navy)', marginBottom: '0.75rem', letterSpacing: '0.02em' }}>
      {children}
    </h2>
  );
}
