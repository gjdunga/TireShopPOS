// ================================================================
// InvoiceDetail (P2e)
// Invoice builder: line items (7 types), auto CO tire/disposal fees,
// tax calc (taxable/nontaxable split), payment recording (cash,
// check, card, other), deposit application, waiver detection modal,
// void with reason. Checkout flow.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import './Invoice.css';

const LINE_TYPES = [
  { value: 'tire', label: 'Tire' },
  { value: 'labor', label: 'Labor' },
  { value: 'part', label: 'Part' },
  { value: 'fee', label: 'Fee' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'discount', label: 'Discount' },
  { value: 'custom', label: 'Custom' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
];

export default function InvoiceDetail() {
  const { id } = useParams();
  const { can } = useAuth();

  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  // Waiver state
  const [waivers, setWaivers] = useState([]);
  const [waiverModal, setWaiverModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/invoices/${id}`)
      .then((data) => {
        setInv(data);
        // Check for tire line items that need waivers
        const tireIds = (data.line_items || [])
          .filter((li) => li.line_type === 'tire' && li.tire_id)
          .map((li) => li.tire_id);
        if (tireIds.length > 0) {
          Promise.all(tireIds.map((tid) =>
            api.get(`/tires/${tid}/waivers`).catch(() => ({ waivers_needed: [] }))
          )).then((results) => {
            const needed = [];
            results.forEach((r, i) => {
              (r.waivers_needed || []).forEach((w) => {
                needed.push({ ...w, tire_id: tireIds[i] });
              });
            });
            setWaivers(needed);
          });
        } else {
          setWaivers([]);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const fmt = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? '$0.00' : `$${n.toFixed(2)}`;
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;
  }

  if (!inv) {
    return <div className="alert alert-error">Invoice not found.</div>;
  }

  const isOpen = inv.status === 'open';
  const isVoided = inv.status === 'voided';
  const balanceDue = parseFloat(inv.balance_due) || 0;

  return (
    <div>
      <Link to="/invoices" className="text-muted" style={{ fontSize: '0.8125rem' }}>&larr; Back to Invoices</Link>

      <div className="inv-header">
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{inv.invoice_number}</h1>
          <div className="text-muted" style={{ fontSize: '0.875rem' }}>
            {inv.customer_first} {inv.customer_last}
            {inv.work_order_id && <> &middot; <Link to={`/work-orders/${inv.work_order_id}`}>WO #{inv.work_order_id}</Link></>}
          </div>
        </div>
        <InvStatusBadge status={inv.status} />
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{msg}</div>}

      {/* Waiver warnings */}
      {waivers.length > 0 && isOpen && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <strong>Waivers Required:</strong> {waivers.length} waiver(s) needed before completing this sale.
          <button className="btn btn-sm" style={{ marginLeft: '0.5rem', background: 'var(--orange)', color: 'white' }}
            onClick={() => setWaiverModal(waivers[0])}>
            Review Waivers
          </button>
        </div>
      )}

      <div className="inv-layout">
        {/* Left: line items */}
        <div>
          <div className="card">
            <SectionTitle>Line Items</SectionTitle>
            <LineItemsTable
              invoiceId={Number(id)}
              lineItems={inv.line_items || []}
              isOpen={isOpen}
              onChanged={() => { setMsg(null); setError(null); load(); }}
              onError={setError}
            />

            {isOpen && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                <AddLineItemForm invoiceId={Number(id)} onAdded={() => { load(); setMsg('Line item added.'); }} onError={setError} />
              </div>
            )}
          </div>

          {/* Auto-fees */}
          {isOpen && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <SectionTitle>Auto-Insert Fees</SectionTitle>
              <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                Automatically add CO tire fees and disposal fees based on tire line items.
              </p>
              <AutoFeesButton invoiceId={Number(id)} onDone={(r) => { load(); setMsg(`Fees inserted: ${r.new_tires} new, ${r.used_tires} used.`); }} onError={setError} />
            </div>
          )}
        </div>

        {/* Right: totals + payments */}
        <div>
          {/* Totals */}
          <div className="card inv-totals-card">
            <SectionTitle>Totals</SectionTitle>
            <div className="inv-totals">
              <div className="inv-total-row">
                <span>Taxable Subtotal</span>
                <span className="mono">{fmt(inv.subtotal_taxable)}</span>
              </div>
              <div className="inv-total-row">
                <span>Non-taxable Subtotal</span>
                <span className="mono">{fmt(inv.subtotal_nontaxable)}</span>
              </div>
              <div className="inv-total-row">
                <span>Fees</span>
                <span className="mono">{fmt(inv.subtotal_fees)}</span>
              </div>
              <div className="inv-total-row">
                <span>Tax ({(parseFloat(inv.tax_rate) * 100).toFixed(2)}%)</span>
                <span className="mono">{fmt(inv.tax_amount)}</span>
              </div>
              {parseFloat(inv.discount_amount) > 0 && (
                <div className="inv-total-row" style={{ color: 'var(--green)' }}>
                  <span>Discount</span>
                  <span className="mono">-{fmt(inv.discount_amount)}</span>
                </div>
              )}
              <div className="inv-total-row inv-grand-total">
                <span>Total</span>
                <span className="mono">{fmt(inv.total)}</span>
              </div>
              <div className="inv-total-row">
                <span>Paid</span>
                <span className="mono" style={{ color: 'var(--green)' }}>{fmt(inv.amount_paid)}</span>
              </div>
              <div className="inv-total-row inv-balance">
                <span>Balance Due</span>
                <span className="mono" style={{ color: balanceDue > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                  {fmt(inv.balance_due)}
                </span>
              </div>
            </div>

            {isOpen && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }}
                onClick={() => {
                  api.post(`/invoices/${id}/recalc`).then(() => { load(); setMsg('Totals recalculated.'); }).catch((e) => setError(e.message));
                }}>
                Recalculate
              </button>
            )}
          </div>

          {/* Payments */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <SectionTitle>Payments</SectionTitle>
            <PaymentsSection
              invoiceId={Number(id)}
              payments={inv.payments || []}
              isOpen={isOpen}
              balanceDue={balanceDue}
              onChanged={() => { load(); setMsg('Payment recorded.'); }}
              onError={setError}
            />
          </div>

          {/* Actions */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <SectionTitle>Actions</SectionTitle>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {isOpen && can('INVOICE_VOID') && (
                <VoidButton invoiceId={Number(id)} onDone={() => { load(); setMsg('Invoice voided.'); }} onError={setError} />
              )}
              {inv.work_order_id && (
                <Link to={`/work-orders/${inv.work_order_id}`} className="btn btn-ghost btn-sm">View Work Order</Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Waiver modal */}
      {waiverModal && (
        <WaiverModal
          waiver={waiverModal}
          allWaivers={waivers}
          invoiceId={Number(id)}
          customerId={inv.customer_id}
          onClose={() => setWaiverModal(null)}
          onSigned={() => { setWaiverModal(null); setWaivers((prev) => prev.slice(1)); if (waivers.length > 1) setWaiverModal(waivers[1]); else setMsg('All waivers signed.'); }}
          onError={setError}
        />
      )}
    </div>
  );
}


// ================================================================
// Line Items Table
// ================================================================

function LineItemsTable({ invoiceId, lineItems, isOpen, onChanged, onError }) {
  const { can } = useAuth();

  const handleRemove = async (lineId) => {
    if (!confirm('Remove this line item?')) return;
    try {
      await api.delete(`/invoices/line-items/${lineId}`);
      onChanged();
    } catch (err) { onError(err.message); }
  };

  const handleWaive = async (lineId) => {
    const reason = prompt('Reason for waiving this fee:');
    if (!reason) return;
    try {
      await api.post(`/invoices/line-items/${lineId}/waive`, { reason });
      onChanged();
    } catch (err) { onError(err.message); }
  };

  const fmt = (v) => `$${parseFloat(v || 0).toFixed(2)}`;

  if (lineItems.length === 0) {
    return <p className="text-muted" style={{ fontSize: '0.875rem' }}>No line items yet.</p>;
  }

  return (
    <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
      <thead>
        <tr>
          <th>Type</th>
          <th>Description</th>
          <th style={{ textAlign: 'right' }}>Qty</th>
          <th style={{ textAlign: 'right' }}>Unit Price</th>
          <th style={{ textAlign: 'right' }}>Total</th>
          <th>Tax</th>
          {isOpen && <th></th>}
        </tr>
      </thead>
      <tbody>
        {lineItems.map((li) => (
          <tr key={li.line_id}>
            <td><TypeBadge type={li.line_type} /></td>
            <td>
              {li.description}
              {li.tire_size && <span className="text-muted" style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>({li.tire_size})</span>}
            </td>
            <td className="mono" style={{ textAlign: 'right' }}>{li.quantity}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{fmt(li.unit_price)}</td>
            <td className="mono" style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(li.line_total)}</td>
            <td>{li.is_taxable ? 'Y' : 'N'}</td>
            {isOpen && (
              <td>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {li.line_type === 'fee' && can('FEE_WAIVE') && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.6875rem', color: 'var(--orange)' }} onClick={() => handleWaive(li.line_id)}>Waive</button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.6875rem', color: 'var(--red)' }} onClick={() => handleRemove(li.line_id)}>Remove</button>
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}


// ================================================================
// Add Line Item Form
// ================================================================

function AddLineItemForm({ invoiceId, onAdded, onError }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ line_type: 'labor', description: '', quantity: 1, unit_price: '', is_taxable: 0, tire_id: '', service_id: '' });
  const [saving, setSaving] = useState(false);

  // Service catalog lookup
  const [services, setServices] = useState([]);
  useEffect(() => {
    api.get('/services').then((d) => setServices(d.services || [])).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!form.description && !form.service_id) { onError('Description is required.'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (form.service_id) {
        const svc = services.find((s) => s.service_id === Number(form.service_id));
        if (svc) {
          payload.description = payload.description || svc.service_name;
          payload.unit_price = payload.unit_price || svc.default_price;
          payload.is_taxable = svc.is_taxable ?? 0;
        }
      }
      await api.post(`/invoices/${invoiceId}/line-items`, payload);
      setForm({ line_type: 'labor', description: '', quantity: 1, unit_price: '', is_taxable: 0, tire_id: '', service_id: '' });
      setOpen(false);
      onAdded();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  if (!open) {
    return <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>+ Add Line Item</button>;
  }

  return (
    <div style={{ width: '100%', background: 'var(--lgray)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-field" style={{ minWidth: 90 }}>
          <label className="label">Type</label>
          <select value={form.line_type} onChange={(e) => setForm((p) => ({ ...p, line_type: e.target.value }))}>
            {LINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {form.line_type === 'labor' && services.length > 0 && (
          <div className="form-field" style={{ minWidth: 140 }}>
            <label className="label">Service</label>
            <select value={form.service_id} onChange={(e) => {
              const sid = e.target.value;
              setForm((p) => ({ ...p, service_id: sid }));
              if (sid) {
                const svc = services.find((s) => s.service_id === Number(sid));
                if (svc) setForm((p) => ({ ...p, description: svc.service_name, unit_price: svc.default_price, is_taxable: svc.is_taxable ?? 0 }));
              }
            }}>
              <option value="">Custom...</option>
              {services.map((s) => <option key={s.service_id} value={s.service_id}>{s.service_name}</option>)}
            </select>
          </div>
        )}

        {form.line_type === 'tire' && (
          <div className="form-field" style={{ minWidth: 80 }}>
            <label className="label">Tire ID</label>
            <input type="number" value={form.tire_id} onChange={(e) => setForm((p) => ({ ...p, tire_id: e.target.value }))} />
          </div>
        )}

        <div className="form-field" style={{ flex: 1, minWidth: 120 }}>
          <label className="label">Description</label>
          <input type="text" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>

        <div className="form-field" style={{ width: 60 }}>
          <label className="label">Qty</label>
          <input type="number" min="1" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
        </div>

        <div className="form-field" style={{ width: 80 }}>
          <label className="label">Price</label>
          <input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm((p) => ({ ...p, unit_price: e.target.value }))} />
        </div>

        <div className="form-field" style={{ width: 50 }}>
          <label className="label">Tax</label>
          <input type="checkbox" checked={!!form.is_taxable} onChange={(e) => setForm((p) => ({ ...p, is_taxable: e.target.checked ? 1 : 0 }))} style={{ width: 'auto', marginTop: '0.25rem' }} />
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Add'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}


// ================================================================
// Auto Fees Button
// ================================================================

function AutoFeesButton({ invoiceId, onDone, onError }) {
  const [running, setRunning] = useState(false);

  const handleClick = async () => {
    setRunning(true);
    try {
      const result = await api.post(`/invoices/${invoiceId}/auto-fees`);
      onDone(result);
    } catch (err) { onError(err.message); }
    finally { setRunning(false); }
  };

  return (
    <button className="btn btn-primary btn-sm" onClick={handleClick} disabled={running}>
      {running ? <span className="spinner" /> : 'Insert CO Tire & Disposal Fees'}
    </button>
  );
}


// ================================================================
// Payments Section
// ================================================================

function PaymentsSection({ invoiceId, payments, isOpen, balanceDue, onChanged, onError }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ payment_method: 'cash', amount: '', reference_number: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const fmt = (v) => `$${parseFloat(v || 0).toFixed(2)}`;

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { onError('Enter a valid amount.'); return; }
    setSaving(true);
    try {
      await api.post(`/invoices/${invoiceId}/payments`, form);
      setForm({ payment_method: 'cash', amount: '', reference_number: '', notes: '' });
      setShowForm(false);
      onChanged();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {payments.length > 0 ? (
        <table className="entity-table" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
          <thead>
            <tr>
              <th>Method</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Ref</th>
              <th>By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.payment_id}>
                <td style={{ textTransform: 'capitalize' }}>{(p.payment_method || '').replace(/_/g, ' ')}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(p.amount)}</td>
                <td className="mono">{p.reference_number || '\u2014'}</td>
                <td>{p.processed_by_name || '\u2014'}</td>
                <td className="mono">{p.processed_at?.slice(0, 16)?.replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>No payments recorded.</p>
      )}

      {isOpen && balanceDue > 0 && !showForm && (
        <button className="btn btn-primary btn-sm" onClick={() => { setForm((p) => ({ ...p, amount: balanceDue.toFixed(2) })); setShowForm(true); }}>
          Record Payment
        </button>
      )}

      {showForm && (
        <div style={{ background: 'var(--lgray)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-field" style={{ minWidth: 120 }}>
              <label className="label">Method</label>
              <select value={form.payment_method} onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ width: 100 }}>
              <label className="label">Amount</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="form-field" style={{ width: 120 }}>
              <label className="label">Ref # (optional)</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm((p) => ({ ...p, reference_number: e.target.value }))}
                placeholder={form.payment_method === 'check' ? 'Check #' : 'Last 4'} />
            </div>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Submit Payment'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ================================================================
// Void Button
// ================================================================

function VoidButton({ invoiceId, onDone, onError }) {
  const handleVoid = async () => {
    const reason = prompt('Reason for voiding this invoice:');
    if (!reason) return;
    try {
      await api.post(`/invoices/${invoiceId}/void`, { reason });
      onDone();
    } catch (err) { onError(err.message); }
  };

  return (
    <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white' }} onClick={handleVoid}>
      Void Invoice
    </button>
  );
}


// ================================================================
// Waiver Modal
// ================================================================

function WaiverModal({ waiver, allWaivers, invoiceId, customerId, onClose, onSigned, onError }) {
  const [template, setTemplate] = useState(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    api.get(`/waivers/template/${waiver.type}`)
      .then((d) => setTemplate(d.template))
      .catch(() => setTemplate('Waiver template not available.'));
  }, [waiver.type]);

  const handleSign = async () => {
    setSigning(true);
    try {
      await api.post('/waivers', {
        waiver_type: waiver.type,
        customer_id: customerId,
        tire_id: waiver.tire_id,
        invoice_id: invoiceId,
        acknowledged: true,
      });
      onSigned();
    } catch (err) { onError(err.message); }
    finally { setSigning(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.125rem' }}>
            Waiver Required: {waiver.type?.replace(/_/g, ' ')}
          </h2>
          <span className="text-muted" style={{ fontSize: '0.8125rem' }}>
            {allWaivers.length} total waiver(s) needed
          </span>
        </div>

        <div className="modal-body">
          {template === null ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}><span className="spinner" /></div>
          ) : (
            <div className="waiver-text">{template}</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={handleSign} disabled={signing}>
            {signing ? <span className="spinner" /> : 'Customer Acknowledges'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Skip for Now</button>
        </div>
      </div>
    </div>
  );
}


// ---- Shared ----

function InvStatusBadge({ status }) {
  const colors = { open: '#4A7CCF', held: '#D4700A', completed: '#2B7A3A', voided: '#6B6560' };
  const bg = { open: 'rgba(74,124,207,0.1)', held: 'rgba(212,112,10,0.1)', completed: 'rgba(43,122,58,0.1)', voided: 'rgba(107,101,96,0.1)' };
  return <span className="badge" style={{ color: colors[status] || '#6B6560', background: bg[status] || 'var(--lgray)', fontSize: '0.875rem' }}>{status || '\u2014'}</span>;
}

function TypeBadge({ type }) {
  const colors = { tire: '#4A7CCF', labor: '#7B61FF', part: '#D4700A', fee: '#6B6560', warranty: '#2B7A3A', discount: '#2B7A3A', custom: '#333' };
  return <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.04em', color: colors[type] || '#333' }}>{type}</span>;
}

function SectionTitle({ children }) {
  return <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--navy)', marginBottom: '0.75rem' }}>{children}</h2>;
}
