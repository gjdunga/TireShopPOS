// ================================================================
// BarcodeScanner (P4d)
// Barcode input (USB HID auto-focus, manual entry) + entity lookup.
// Camera scanning deferred to PWA phase (requires HTTPS + getUserMedia).
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';

export default function BarcodeScanner() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleLookup = async (barcode) => {
    const cleaned = (barcode || code).trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.get(`/barcode/lookup?code=${encodeURIComponent(cleaned)}`);
      setResult(data);
      setHistory((prev) => [{ code: cleaned, type: data.type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 19)]);
    } catch (e) {
      setError(e.message || 'Not found');
    } finally {
      setLoading(false);
      setCode('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLookup();
    }
  };

  const handlePrintLabel = async (type, id) => {
    try {
      const data = await api.get(`/labels/${type}/${id}`);
      // Open ZPL in new window for raw printing or copy
      const win = window.open('', '_blank', 'width=400,height=300');
      win.document.write(`<pre style="font-family:monospace;white-space:pre-wrap">${data.zpl}</pre>`);
      win.document.title = `ZPL Label: ${type} #${id}`;
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Barcode Scanner</h1>

      <div className="card">
        <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
          Scan a barcode with a USB scanner or enter the code manually. The scanner auto-submits on Enter.
          Tire barcodes start with T, wheel barcodes start with W.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div className="form-field" style={{ flex: 1 }}>
            <label className="label">Barcode</label>
            <input ref={inputRef} type="text" className="mono" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Scan or type barcode..."
              autoFocus
              style={{ fontSize: '1.125rem', letterSpacing: '0.05em' }} />
          </div>
          <button className="btn btn-primary" onClick={() => handleLookup()} disabled={loading || !code.trim()}>
            {loading ? <span className="spinner" /> : 'Lookup'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{error}</div>}

      {result && (
        <div className="card" style={{ marginTop: '1rem', borderLeft: '4px solid var(--green)' }}>
          {result.type === 'tire' && <TireResult tire={result.entity} onPrint={(id) => handlePrintLabel('tire', id)} />}
          {result.type === 'wheel' && <WheelResult wheel={result.entity} onPrint={(id) => handlePrintLabel('wheel', id)} />}
        </div>
      )}

      {history.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Scan History</h2>
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Time</th><th>Code</th><th>Type</th></tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="mono">{h.time}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{h.code}</td>
                  <td style={{ textTransform: 'capitalize' }}>{h.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TireResult({ tire, onPrint }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tire Found</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--navy)' }}>{tire.full_size_string}</div>
          <div style={{ fontSize: '0.9375rem' }}>{tire.brand_name} {tire.model || ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--red)' }}>${Number(tire.retail_price).toFixed(2)}</div>
          <span className={`badge ${tire.condition === 'new' ? 'badge-green' : 'badge-orange'}`}>{tire.condition}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.875rem', flexWrap: 'wrap' }}>
        {tire.tread_depth_32nds && <div><strong>Tread:</strong> {tire.tread_depth_32nds}/32</div>}
        {tire.dot_tin && <div><strong>DOT:</strong> <span className="mono">{tire.dot_tin}</span></div>}
        <div><strong>Status:</strong> {tire.status}</div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <Link to={`/tires/${tire.tire_id}`} className="btn btn-primary btn-sm">View Detail</Link>
        <button className="btn btn-ghost btn-sm" onClick={() => onPrint(tire.tire_id)}>Print Label</button>
      </div>
    </div>
  );
}

function WheelResult({ wheel, onPrint }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Wheel Found</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--navy)' }}>
            {[wheel.brand, wheel.model].filter(Boolean).join(' ') || 'Wheel'}
          </div>
          <div style={{ fontSize: '0.9375rem' }}>{wheel.diameter}" {wheel.bolt_pattern || ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {wheel.retail_price && <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--red)' }}>${Number(wheel.retail_price).toFixed(2)}</div>}
          <span className={`badge ${wheel.condition === 'new' ? 'badge-green' : 'badge-orange'}`}>{wheel.condition}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.875rem', flexWrap: 'wrap' }}>
        <div><strong>Material:</strong> {wheel.material}</div>
        <div><strong>Qty:</strong> {wheel.quantity_on_hand}</div>
        {wheel.bin_location && <div><strong>BIN:</strong> <span className="mono">{wheel.bin_location}</span></div>}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <Link to={`/wheels/${wheel.wheel_id}`} className="btn btn-primary btn-sm">View Detail</Link>
        <button className="btn btn-ghost btn-sm" onClick={() => onPrint(wheel.wheel_id)}>Print Label</button>
      </div>
    </div>
  );
}
