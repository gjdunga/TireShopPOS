// ================================================================
// PrintTemplates (P2g)
// Printable views: work order summary, estimate.
// Each loads its own data and renders a print-ready layout.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';

// Shared print wrapper
function PrintLayout({ title, children, loading, error }) {
  useEffect(() => {
    if (!loading && !error) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
  }, [loading, error]);

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}>Loading...</div>;
  if (error) return <div style={{ color: 'red', padding: '2rem' }}>{error}</div>;

  return (
    <div className="print-page">
      <style>{`
        @media print {
          body { margin: 0; font-size: 11pt; }
          .no-print { display: none !important; }
          .print-page { padding: 0; }
        }
        @media screen {
          .print-page { max-width: 800px; margin: 0 auto; padding: 1.5rem; font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
        }
        .print-page * { box-sizing: border-box; }
        .print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; border-bottom: 3px solid #1A2744; padding-bottom: 0.75rem; }
        .print-shop-name { font-size: 1.5rem; font-weight: 700; color: #1A2744; letter-spacing: 0.02em; }
        .print-shop-info { font-size: 0.75rem; color: #555; text-align: right; line-height: 1.5; }
        .print-title { font-size: 1.25rem; font-weight: 700; color: #1A2744; margin-bottom: 0.75rem; }
        .print-meta { display: flex; gap: 2rem; margin-bottom: 1rem; font-size: 0.8125rem; }
        .print-meta-item { }
        .print-meta-label { font-weight: 600; color: #555; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; }
        .print-table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
        .print-table th { text-align: left; border-bottom: 2px solid #1A2744; padding: 0.375rem 0.5rem; font-size: 0.75rem; text-transform: uppercase; color: #555; }
        .print-table td { border-bottom: 1px solid #ddd; padding: 0.375rem 0.5rem; }
        .print-table .mono { font-family: 'Courier New', monospace; }
        .print-table .right { text-align: right; }
        .print-totals { margin-left: auto; width: 260px; }
        .print-total-row { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.875rem; }
        .print-total-row.grand { font-weight: 700; font-size: 1rem; border-top: 2px solid #1A2744; margin-top: 0.25rem; padding-top: 0.5rem; }
        .print-footer { margin-top: 2rem; padding-top: 0.75rem; border-top: 1px solid #ddd; font-size: 0.6875rem; color: #777; }
        .print-disclosure { margin-top: 1rem; padding: 0.5rem; border: 1px solid #ddd; font-size: 0.6875rem; color: #555; }
        .print-section { margin-bottom: 1rem; }
        .print-section-title { font-weight: 700; font-size: 0.875rem; color: #1A2744; margin-bottom: 0.375rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
        .print-btn { display: inline-block; padding: 0.5rem 1.5rem; background: #1A2744; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; margin: 0.5rem 0.25rem; }
        .print-btn:hover { background: #2a3d5e; }
      `}</style>
      <div className="no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button className="print-btn" onClick={() => window.print()}>Print</button>
        <button className="print-btn" style={{ background: '#666' }} onClick={() => window.history.back()}>Back</button>
      </div>
      <ShopHeader />
      {children}
    </div>
  );
}

function ShopHeader() {
  return (
    <div className="print-header">
      <div>
        <div className="print-shop-name">TIRE SHOP</div>
        <div style={{ fontSize: '0.75rem', color: '#777' }}>Canon City, Colorado</div>
      </div>
      <div className="print-shop-info">
        <div>123 Main Street</div>
        <div>Canon City, CO 81212</div>
        <div>(719) 555-0100</div>
      </div>
    </div>
  );
}

// ================================================================
// Work Order Print
// ================================================================
export function PrintWorkOrder() {
  const { id } = useParams();
  const [wo, setWo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/work-orders/${id}`)
      .then(setWo)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const positions = wo?.positions || [];

  return (
    <PrintLayout title="Work Order" loading={loading} error={error}>
      {wo && (
        <>
          <div className="print-title">WORK ORDER</div>
          <div className="print-meta">
            <div className="print-meta-item">
              <div className="print-meta-label">WO #</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: '1rem' }}>{wo.wo_number}</div>
            </div>
            <div className="print-meta-item">
              <div className="print-meta-label">Date</div>
              <div>{wo.created_at?.slice(0, 10)}</div>
            </div>
            <div className="print-meta-item">
              <div className="print-meta-label">Customer</div>
              <div>{wo.customer_first} {wo.customer_last}</div>
            </div>
            <div className="print-meta-item">
              <div className="print-meta-label">Vehicle</div>
              <div>{wo.vehicle_year} {wo.vehicle_make} {wo.vehicle_model}</div>
            </div>
            <div className="print-meta-item">
              <div className="print-meta-label">VIN</div>
              <div className="mono">{wo.vin || 'N/A'}</div>
            </div>
            <div className="print-meta-item">
              <div className="print-meta-label">Tech</div>
              <div>{wo.assigned_tech_name || 'Unassigned'}</div>
            </div>
          </div>

          <div className="print-meta">
            <div className="print-meta-item">
              <div className="print-meta-label">Mileage In</div>
              <div className="mono">{wo.mileage_in ? Number(wo.mileage_in).toLocaleString() : 'N/A'}</div>
            </div>
            <div className="print-meta-item">
              <div className="print-meta-label">Mileage Out</div>
              <div className="mono">{wo.mileage_out ? Number(wo.mileage_out).toLocaleString() : '___________'}</div>
            </div>
            <div className="print-meta-item">
              <div className="print-meta-label">Status</div>
              <div style={{ textTransform: 'uppercase', fontWeight: 600 }}>{wo.status?.replace(/_/g, ' ')}</div>
            </div>
            {wo.estimated_price != null && Number(wo.estimated_price) > 0 && (
              <div className="print-meta-item">
                <div className="print-meta-label">Estimated Price</div>
                <div className="mono" style={{ fontWeight: 700, fontSize: '1.1rem' }}>${Number(wo.estimated_price).toFixed(2)}</div>
              </div>
            )}
          </div>

          {wo.customer_complaint && (
            <div className="print-section">
              <div className="print-section-title">Customer Complaint</div>
              <div>{wo.customer_complaint}</div>
            </div>
          )}

          {wo.special_notes && (
            <div className="print-section">
              <div className="print-section-title">Special Notes</div>
              <div>{wo.special_notes}</div>
            </div>
          )}

          <div className="print-section">
            <div className="print-section-title">Wheel Positions</div>
            <table className="print-table">
              <thead>
                <tr><th>Pos</th><th>Action</th><th>Existing Tire</th><th>New Tire</th><th>Tread In</th><th>Tread Out</th><th>PSI In</th><th>PSI Out</th><th>Condition</th></tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.position_id}>
                    <td style={{ fontWeight: 700 }}>{p.position_code}</td>
                    <td style={{ textTransform: 'capitalize' }}>{(p.action_requested || 'none').replace(/_/g, ' ')}</td>
                    <td style={{ fontSize: '0.75rem' }}>{p.existing_tire_size ? `${p.existing_tire_brand || ''} ${p.existing_tire_size}` : ''}</td>
                    <td style={{ fontSize: '0.75rem' }}>{p.new_tire_size ? `${p.new_tire_brand || ''} ${p.new_tire_size}` : ''}</td>
                    <td className="mono">{p.tread_depth_in ?? '___'}/32</td>
                    <td className="mono">{p.tread_depth_out ?? '___'}/32</td>
                    <td className="mono">{p.psi_in ?? '___'}</td>
                    <td className="mono">{p.psi_out ?? '___'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{(p.condition_grade || '').replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="print-section" style={{ border: '2px solid #1A2744', padding: '0.75rem' }}>
            <div className="print-section-title" style={{ color: '#C9202F', borderColor: '#C9202F' }}>TORQUE VERIFICATION (LIABILITY)</div>
            <div className="print-meta">
              <div className="print-meta-item">
                <div className="print-meta-label">Torque Spec Used (ft-lbs)</div>
                <div className="mono" style={{ fontWeight: 700, fontSize: '1.125rem' }}>{wo.torque_spec_used || '___________'}</div>
              </div>
              <div className="print-meta-item">
                <div className="print-meta-label">Vehicle OEM Spec</div>
                <div className="mono">{wo.vehicle_torque_spec || 'N/A'}</div>
              </div>
              <div className="print-meta-item">
                <div className="print-meta-label">Verified At</div>
                <div className="mono">{wo.torque_verified_at || '___________'}</div>
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div className="print-meta-label">Technician Signature</div>
              <div style={{ borderBottom: '1px solid #000', height: '2rem', marginTop: '0.25rem' }}></div>
            </div>
          </div>

          {wo.retorque_due_date && (
            <div className="print-section" style={{ marginTop: '0.75rem', padding: '0.5rem', border: '1px dashed #C9202F' }}>
              <strong style={{ color: '#C9202F' }}>RE-TORQUE DUE:</strong>{' '}
              {wo.retorque_due_date}{wo.retorque_due_miles ? ` or ${Number(wo.retorque_due_miles).toLocaleString()} miles` : ''}
              {' '}(whichever comes first). Please return for a free re-torque check.
            </div>
          )}

          {wo.tech_diagnosis && (
            <div className="print-section">
              <div className="print-section-title">Technician Diagnosis</div>
              <div>{wo.tech_diagnosis}</div>
            </div>
          )}

          <div className="print-footer">
            Customer acknowledges receipt of vehicle. All work performed as described above.
          </div>
        </>
      )}
    </PrintLayout>
  );
}


// ================================================================
// Estimate Print (uses quote data from URL params)
// ================================================================
export function PrintEstimate() {
  const [searchParams] = useSearchParams();
  const customerName = searchParams.get('customer') || '';
  const linesJson = searchParams.get('lines') || '[]';
  const taxRate = Number(searchParams.get('tax_rate') || '0.079');

  let lines = [];
  try { lines = JSON.parse(decodeURIComponent(linesJson)); } catch { lines = []; }

  const tireCount = lines.filter((l) => l.type === 'tire').reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const newCount = lines.filter((l) => l.type === 'tire' && l.condition === 'new').reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const usedCount = tireCount - newCount;
  const tireFees = newCount * 1.50 + usedCount * 1.00;
  const disposal = tireCount * 3.50;
  const subtaxable = lines.reduce((s, l) => s + (l.type === 'tire' ? (Number(l.qty) || 0) * (Number(l.price) || 0) : 0), 0);
  const subnontax = lines.reduce((s, l) => s + (l.type !== 'tire' ? (Number(l.qty) || 0) * (Number(l.price) || 0) : 0), 0);
  const tax = subtaxable * taxRate;
  const total = subtaxable + subnontax + tireFees + disposal + tax;

  return (
    <PrintLayout title="Estimate" loading={false} error={null}>
      <div className="print-title">ESTIMATE</div>
      <div className="print-meta">
        <div className="print-meta-item">
          <div className="print-meta-label">Date</div>
          <div>{new Date().toLocaleDateString()}</div>
        </div>
        {customerName && (
          <div className="print-meta-item">
            <div className="print-meta-label">Customer</div>
            <div>{customerName}</div>
          </div>
        )}
      </div>

      <table className="print-table">
        <thead><tr><th>Description</th><th>Type</th><th className="right">Qty</th><th className="right">Price</th><th className="right">Total</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description || '(item)'}</td>
              <td style={{ textTransform: 'capitalize' }}>{l.type}</td>
              <td className="right mono">{Number(l.qty)}</td>
              <td className="right mono">${Number(l.price).toFixed(2)}</td>
              <td className="right mono">${((Number(l.qty) || 0) * (Number(l.price) || 0)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-totals">
        <div className="print-total-row"><span>Tires (taxable)</span><span className="mono">${subtaxable.toFixed(2)}</span></div>
        <div className="print-total-row"><span>Labor/Other</span><span className="mono">${subnontax.toFixed(2)}</span></div>
        {tireFees > 0 && <div className="print-total-row"><span>CO Tire Fees</span><span className="mono">${tireFees.toFixed(2)}</span></div>}
        {disposal > 0 && <div className="print-total-row"><span>Disposal Fees</span><span className="mono">${disposal.toFixed(2)}</span></div>}
        <div className="print-total-row"><span>Sales Tax ({(taxRate * 100).toFixed(2)}%)</span><span className="mono">${tax.toFixed(2)}</span></div>
        <div className="print-total-row grand"><span>ESTIMATED TOTAL</span><span className="mono">${total.toFixed(2)}</span></div>
      </div>

      <div className="print-disclosure">
        <strong>ESTIMATE ONLY:</strong> This is not a binding contract or invoice. Final pricing may vary based on
        actual tires selected, services performed, and current availability. Prices valid for 7 days from date of estimate.
        Colorado tire recycling and disposal fees apply to all tire purchases.
      </div>

      <div className="print-footer">
        Thank you for considering our shop. We appreciate your business.
      </div>
    </PrintLayout>
  );
}
