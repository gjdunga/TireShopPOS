// ================================================================
// QuoteTool (P2f)
// OTD pricing: select tires + services, auto-calc tax + CO fees,
// display total. Print or copy.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect } from 'react';
import api from '../api/client.js';
import './SupportOps.css';

export default function QuoteTool() {
  const [services, setServices] = useState([]);
  const [config, setConfig] = useState({ tax_rate: 0.079 });
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/services').then((d) => setServices(d.services || [])).catch(() => {});
    api.get('/config/tax_rate').then((d) => {
      if (d.value) setConfig((p) => ({ ...p, tax_rate: Number(d.value) }));
    }).catch(() => {});
  }, []);

  const addTireLine = () => {
    setLines((prev) => [...prev, {
      id: Date.now(), type: 'tire', description: '', qty: 1, price: '', condition: 'used',
    }]);
  };

  const addServiceLine = (svc) => {
    setLines((prev) => [...prev, {
      id: Date.now(), type: 'service', description: svc.service_name,
      qty: 1, price: svc.default_labor, service_id: svc.service_id,
      is_per_tire: svc.is_per_tire,
    }]);
  };

  const addCustomLine = () => {
    setLines((prev) => [...prev, {
      id: Date.now(), type: 'custom', description: '', qty: 1, price: '',
    }]);
  };

  const updateLine = (id, field, value) => {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  // Calculate totals
  const tireCount = lines.filter((l) => l.type === 'tire').reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  const newTireCount = lines.filter((l) => l.type === 'tire' && l.condition === 'new').reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  const usedTireCount = tireCount - newTireCount;

  // CO tire fees: $1.50 new, $1.00 used per tire (from config, but using defaults)
  const coNewFee = 1.50;
  const coUsedFee = 1.00;
  const disposalFee = 3.50;
  const tireFees = (newTireCount * coNewFee) + (usedTireCount * coUsedFee);
  const disposalTotal = tireCount * disposalFee;

  const subtotalTaxable = lines.reduce((sum, l) => {
    const lt = (Number(l.qty) || 0) * (Number(l.price) || 0);
    // Tires are taxable, labor is not in CO
    return sum + (l.type === 'tire' ? lt : 0);
  }, 0);

  const subtotalNontaxable = lines.reduce((sum, l) => {
    const lt = (Number(l.qty) || 0) * (Number(l.price) || 0);
    return sum + (l.type !== 'tire' ? lt : 0);
  }, 0);

  const tax = subtotalTaxable * config.tax_rate;
  const grandTotal = subtotalTaxable + subtotalNontaxable + tireFees + disposalTotal + tax;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Out-the-Door Quote</h1>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      <div className="ops-two-col">
        {/* Left: line items */}
        <div>
          <div className="card">
            <SectionTitle>Quote Items</SectionTitle>

            {lines.length === 0 && (
              <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                Add tires, services, or custom items to build a quote.
              </p>
            )}

            {lines.map((line) => (
              <div key={line.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end',
                padding: '0.5rem 0', borderBottom: '1px solid var(--lgray)' }}>
                <div style={{ flex: 2 }}>
                  <label className="label" style={{ fontSize: '0.6875rem' }}>
                    {line.type === 'tire' ? 'Tire' : line.type === 'service' ? 'Service' : 'Custom'}
                  </label>
                  <input type="text" value={line.description}
                    onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                    placeholder={line.type === 'tire' ? 'e.g. 265/70R17 Falken Wildpeak' : 'Description'}
                    style={{ fontSize: '0.875rem' }} />
                </div>
                {line.type === 'tire' && (
                  <div style={{ width: 80 }}>
                    <label className="label" style={{ fontSize: '0.6875rem' }}>Cond</label>
                    <select value={line.condition} onChange={(e) => updateLine(line.id, 'condition', e.target.value)}
                      style={{ fontSize: '0.875rem' }}>
                      <option value="new">New</option>
                      <option value="used">Used</option>
                    </select>
                  </div>
                )}
                <div style={{ width: 50 }}>
                  <label className="label" style={{ fontSize: '0.6875rem' }}>Qty</label>
                  <input type="number" min="1" value={line.qty}
                    onChange={(e) => updateLine(line.id, 'qty', e.target.value)}
                    style={{ fontSize: '0.875rem', textAlign: 'center' }} />
                </div>
                <div style={{ width: 80 }}>
                  <label className="label" style={{ fontSize: '0.6875rem' }}>Price</label>
                  <input type="number" step="0.01" min="0" value={line.price}
                    onChange={(e) => updateLine(line.id, 'price', e.target.value)}
                    style={{ fontSize: '0.875rem' }} />
                </div>
                <div className="mono" style={{ width: 70, textAlign: 'right', fontWeight: 600, paddingBottom: '0.25rem' }}>
                  ${((Number(line.qty) || 0) * (Number(line.price) || 0)).toFixed(2)}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', paddingBottom: '0.25rem' }}
                  onClick={() => removeLine(line.id)}>X</button>
              </div>
            ))}

            {/* Add buttons */}
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={addTireLine}>+ Tire</button>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <ServiceDropdown services={services} onSelect={addServiceLine} />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={addCustomLine}>+ Custom</button>
            </div>
          </div>
        </div>

        {/* Right: totals */}
        <div>
          <div className="card">
            <SectionTitle>Quote Total</SectionTitle>
            <div className="quote-totals">
              <div className="quote-row">
                <span>Subtotal (taxable)</span>
                <span className="mono">${subtotalTaxable.toFixed(2)}</span>
              </div>
              <div className="quote-row">
                <span>Subtotal (labor/non-taxable)</span>
                <span className="mono">${subtotalNontaxable.toFixed(2)}</span>
              </div>
              {tireFees > 0 && (
                <div className="quote-row">
                  <span>CO Tire Fees ({tireCount} tires)</span>
                  <span className="mono">${tireFees.toFixed(2)}</span>
                </div>
              )}
              {disposalTotal > 0 && (
                <div className="quote-row">
                  <span>Disposal Fees ({tireCount} x ${disposalFee.toFixed(2)})</span>
                  <span className="mono">${disposalTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="quote-row">
                <span>Sales Tax ({(config.tax_rate * 100).toFixed(2)}%)</span>
                <span className="mono">${tax.toFixed(2)}</span>
              </div>
              <div className="quote-row quote-grand">
                <span>Out-the-Door Total</span>
                <span className="mono">${grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={() => window.print()}>Print Quote</button>
              <button className="btn btn-ghost" onClick={() => {
                const text = lines.map((l) => `${l.description}: $${((Number(l.qty) || 0) * (Number(l.price) || 0)).toFixed(2)}`).join('\n')
                  + `\nTire Fees: $${tireFees.toFixed(2)}`
                  + `\nDisposal: $${disposalTotal.toFixed(2)}`
                  + `\nTax: $${tax.toFixed(2)}`
                  + `\nOUT THE DOOR: $${grandTotal.toFixed(2)}`;
                navigator.clipboard.writeText(text).then(() => alert('Copied!'));
              }}>Copy to Clipboard</button>
            </div>
          </div>

          {lines.length > 0 && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                This is an estimate only. Final totals may differ based on actual tires selected, services performed,
                and applicable waivers. CO tire recycling fee: ${coNewFee.toFixed(2)} (new), ${coUsedFee.toFixed(2)} (used).
                Disposal fee: ${disposalFee.toFixed(2)} per tire.
                Tax applies to tire purchases only (labor exempt in Colorado).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceDropdown({ services, onSelect }) {
  const [open, setOpen] = useState(false);

  if (services.length === 0) return null;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>+ Service</button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid var(--mgray)',
          borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100,
          maxHeight: 200, overflowY: 'auto', minWidth: 220 }}>
          {services.map((s) => (
            <button key={s.service_id} type="button"
              style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', textAlign: 'left',
                border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem' }}
              onMouseOver={(e) => e.currentTarget.style.background = 'var(--lgray)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => { onSelect(s); setOpen(false); }}>
              {s.service_name} <span className="text-muted">(${Number(s.default_labor).toFixed(2)})</span>
            </button>
          ))}
        </div>
      )}
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
