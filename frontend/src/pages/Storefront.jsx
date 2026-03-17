// ================================================================
// PublicStorefront (P3d)
// Public-facing pages: home, inventory, fitment, appointments, warranty info
// No auth required. Reads from /api/public/* endpoints.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import './Storefront.css';

const API = '/api/index.php?_=/public';
async function pubGet(path) {
  const res = await fetch(API + encodeURIComponent(path));
  if (!res.ok) throw new Error('Request failed');
  const json = await res.json();
  return json.data ?? json;
}

// --- Public Layout Shell ---
export function StorefrontShell({ children }) {
  const [shop, setShop] = useState({});
  useEffect(() => { pubGet('/shop-info').then(setShop).catch(() => {}); }, []);

  return (
    <div className="sf-shell">
      <header className="sf-header">
        <div className="sf-header-inner">
          <Link to="/shop" className="sf-logo">{shop.shop_name || 'Tire Shop'}</Link>
          <nav className="sf-nav">
            <Link to="/shop">Home</Link>
            <Link to="/shop/inventory">Tires</Link>
            <Link to="/shop/fitment">Fitment</Link>
            <Link to="/shop/appointments">Book Appointment</Link>
            <Link to="/shop/warranty">Warranty</Link>
          </nav>
        </div>
      </header>
      <main className="sf-main">{children}</main>
      <footer className="sf-footer">
        <div className="sf-footer-inner">
          <div>{shop.shop_name || 'Tire Shop'} &middot; {shop.shop_address_line1}, {shop.shop_city}, {shop.shop_state} {shop.shop_zip}</div>
          <div>{shop.shop_phone}</div>
        </div>
      </footer>
    </div>
  );
}

// --- Home ---
export function StorefrontHome() {
  const [shop, setShop] = useState({});
  const [config, setConfig] = useState({});
  useEffect(() => {
    pubGet('/shop-info').then(setShop).catch(() => {});
    pubGet('/website-config').then(setConfig).catch(() => {});
  }, []);

  return (
    <div>
      <div className="sf-hero">
        <h1>{config.hero_title || shop.shop_name || 'Welcome'}</h1>
        <p>{config.hero_subtitle || shop.shop_tagline || ''}</p>
        <div className="sf-hero-actions">
          <Link to="/shop/inventory" className="sf-btn sf-btn-primary">Browse Tires</Link>
          <Link to="/shop/appointments" className="sf-btn sf-btn-outline">Book Appointment</Link>
        </div>
      </div>
      {config.about_html && (
        <div className="sf-section">
          <h2>About Us</h2>
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(config.about_html, {
            ALLOWED_TAGS: ['b','i','u','em','strong','a','p','br','ul','ol','li','h1','h2','h3','h4','h5','h6','img','blockquote','span','div','hr','table','thead','tbody','tr','th','td'],
            ALLOWED_ATTR: ['href','src','alt','title','class','style','target','width','height'],
            ALLOW_DATA_ATTR: false,
          }) }} />
        </div>
      )}
      <div className="sf-section">
        <h2>Quick Fitment Search</h2>
        <p>Find tires and wheels that fit your vehicle.</p>
        <Link to="/shop/fitment" className="sf-btn sf-btn-primary" style={{ marginTop: '0.5rem' }}>Search by Vehicle</Link>
      </div>
    </div>
  );
}

// --- Inventory ---
export function StorefrontInventory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tires, setTires] = useState({ rows: [], total: 0 });
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  const size = searchParams.get('size') || '';
  const brandId = searchParams.get('brand_id') || '';
  const condition = searchParams.get('condition') || '';
  const page = Number(searchParams.get('page') || '1');
  const limit = 24;

  useEffect(() => { pubGet('/brands').then((d) => setBrands(d.brands || [])).catch(() => {}); }, []);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit, offset: (page - 1) * limit });
    if (size) qs.set('size', size);
    if (brandId) qs.set('brand_id', brandId);
    if (condition) qs.set('condition', condition);
    pubGet(`/inventory?${qs}`).then(setTires).catch(() => {}).finally(() => setLoading(false));
  }, [size, brandId, condition, page]);
  useEffect(() => { load(); }, [load]);

  const setFilter = (key, val) => {
    const p = new URLSearchParams(searchParams);
    if (val) p.set(key, val); else p.delete(key);
    p.delete('page');
    setSearchParams(p);
  };

  const pages = Math.ceil((tires.total || 0) / limit);

  return (
    <div>
      <h1 className="sf-page-title">Tire Inventory</h1>
      <div className="sf-filters">
        <input type="text" value={size} onChange={(e) => setFilter('size', e.target.value)} placeholder="Search by size..." className="sf-input" />
        <select value={brandId} onChange={(e) => setFilter('brand_id', e.target.value)} className="sf-input">
          <option value="">All Brands</option>
          {brands.map((b) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>)}
        </select>
        <select value={condition} onChange={(e) => setFilter('condition', e.target.value)} className="sf-input">
          <option value="">All Conditions</option><option value="new">New</option><option value="used">Used</option>
        </select>
        <span className="sf-count">{tires.total || 0} tires</span>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: '3rem' }}>Loading...</div> : (
        <div className="sf-tire-grid">
          {(tires.rows || []).map((t) => (
            <Link key={t.tire_id} to={`/shop/inventory/${t.tire_id}`} className="sf-tire-card">
              <div className="sf-tire-size">{t.full_size_string}</div>
              <div className="sf-tire-brand">{t.brand_name || 'Unknown'} {t.model || ''}</div>
              <div className="sf-tire-meta">
                <span className={`sf-badge ${t.condition === 'new' ? 'sf-badge-green' : 'sf-badge-orange'}`}>{t.condition}</span>
                {t.tread_depth_32nds && <span>{t.tread_depth_32nds}/32"</span>}
              </div>
              <div className="sf-tire-price">${Number(t.retail_price).toFixed(2)}</div>
            </Link>
          ))}
          {(tires.rows || []).length === 0 && <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#999' }}>No tires found.</p>}
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          {page > 1 && <button className="sf-btn sf-btn-outline" onClick={() => setFilter('page', String(page - 1))}>Prev</button>}
          <span style={{ padding: '0.5rem', color: '#666' }}>Page {page} of {pages}</span>
          {page < pages && <button className="sf-btn sf-btn-outline" onClick={() => setFilter('page', String(page + 1))}>Next</button>}
        </div>
      )}
    </div>
  );
}

// --- Tire Detail (public) ---
export function StorefrontTireDetail() {
  const { id } = useParams();
  const [tire, setTire] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { pubGet(`/inventory/${id}`).then(setTire).catch(() => {}).finally(() => setLoading(false)); }, [id]);

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}>Loading...</div>;
  if (!tire) return <div className="sf-section"><p>Tire not found or no longer available.</p><Link to="/shop/inventory">Back to Inventory</Link></div>;

  return (
    <div className="sf-section">
      <Link to="/shop/inventory" style={{ color: '#666', fontSize: '0.875rem' }}>&larr; Back to Inventory</Link>
      <h1 style={{ fontSize: '1.5rem', marginTop: '0.5rem' }}>{tire.brand_name} {tire.model || ''}</h1>
      <div className="sf-tire-detail-grid">
        <div><strong>Size:</strong> {tire.full_size_string}</div>
        <div><strong>Condition:</strong> <span className={`sf-badge ${tire.condition === 'new' ? 'sf-badge-green' : 'sf-badge-orange'}`}>{tire.condition}</span></div>
        {tire.tread_depth_32nds && <div><strong>Tread Depth:</strong> {tire.tread_depth_32nds}/32"</div>}
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#C9202F' }}>${Number(tire.retail_price).toFixed(2)}</div>
      </div>
      {tire.notes && <p style={{ marginTop: '1rem', color: '#555' }}>{tire.notes}</p>}
      <div style={{ marginTop: '1.5rem' }}>
        <Link to="/shop/appointments" className="sf-btn sf-btn-primary">Book Appointment</Link>
      </div>
    </div>
  );
}

// --- Fitment Search (public) ---
export function StorefrontFitment() {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!make || !model) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ make, model });
      if (year) qs.set('year', year);
      setResults(await pubGet(`/fitment/search?${qs}`));
    } catch {} finally { setLoading(false); }
  };

  return (
    <div>
      <h1 className="sf-page-title">Vehicle Fitment Search</h1>
      <div className="sf-section">
        <div className="sf-filters">
          <input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make (e.g. Toyota)" className="sf-input" />
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model (e.g. Tacoma)" className="sf-input" />
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className="sf-input" style={{ width: 80 }} />
          <button className="sf-btn sf-btn-primary" onClick={handleSearch} disabled={loading || !make || !model}>
            {loading ? 'Searching...' : 'Find Tires'}
          </button>
        </div>
      </div>
      {results && (
        <div className="sf-section">
          {(results.tires || []).length > 0 && (
            <div>
              <h2>Tires In Stock</h2>
              <div className="sf-tire-grid">
                {results.tires.map((t) => (
                  <Link key={t.tire_id} to={`/shop/inventory/${t.tire_id}`} className="sf-tire-card">
                    <div className="sf-tire-size">{t.full_size_string}</div>
                    <div className="sf-tire-brand">{t.brand_name} {t.model || ''}</div>
                    <div className="sf-tire-price">${Number(t.retail_price).toFixed(2)}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {(results.tires || []).length === 0 && (results.wheels || []).length === 0 && (
            <p style={{ color: '#999' }}>No matching inventory found for this vehicle. Call us for availability.</p>
          )}
          {(results.wheels || []).length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h2>Wheels Available</h2>
              <div className="sf-tire-grid">
                {results.wheels.map((w) => (
                  <div key={w.wheel_id} className="sf-tire-card">
                    <div className="sf-tire-size">{w.size || `${w.diameter}"x${w.width}"`}</div>
                    <div className="sf-tire-brand">{w.brand} {w.model || ''}</div>
                    <div className="sf-tire-price">${Number(w.retail_price || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reverse fitment: search by tire size */}
      <div className="sf-section" style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
        <h2>Search by Tire Size</h2>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Enter a tire size to see which vehicles it fits.</p>
        <ReverseFitment />
      </div>

      {/* Wheels catalog */}
      <div className="sf-section" style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
        <h2>Wheels In Stock</h2>
        <WheelsCatalog />
      </div>
    </div>
  );
}

function ReverseFitment() {
  const [size, setSize] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!size) return;
    setLoading(true);
    try { setResults(await pubGet(`/fitment/reverse?size=${encodeURIComponent(size)}`)); }
    catch {} finally { setLoading(false); }
  };

  return (
    <div>
      <div className="sf-filters">
        <input type="text" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 265/70R17" className="sf-input" />
        <button className="sf-btn sf-btn-primary" onClick={handleSearch} disabled={loading || !size}>
          {loading ? 'Searching...' : 'Find Vehicles'}
        </button>
      </div>
      {results && (
        <div style={{ marginTop: '0.75rem' }}>
          {(results.vehicles || []).length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {results.vehicles.map((v, i) => (
                <li key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem' }}>
                  {v.year && `${v.year} `}{v.make} {v.model} {v.trim && <span style={{ color: '#888' }}>({v.trim})</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#999' }}>No vehicle fitment data found for this size.</p>
          )}
        </div>
      )}
    </div>
  );
}

function WheelsCatalog() {
  const [wheels, setWheels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pubGet('/wheels').then((d) => setWheels(d.wheels || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: '#999' }}>Loading wheels...</p>;
  if (wheels.length === 0) return <p style={{ color: '#999' }}>No wheels currently in stock.</p>;

  return (
    <div className="sf-tire-grid">
      {wheels.map((w) => (
        <div key={w.wheel_id} className="sf-tire-card">
          <div className="sf-tire-size">{w.size || `${w.diameter}"x${w.width}"`}</div>
          <div className="sf-tire-brand">{w.brand} {w.model || ''}</div>
          {w.bolt_pattern && <div style={{ fontSize: '0.8rem', color: '#888' }}>{w.bolt_pattern}</div>}
          <div className="sf-tire-price">${Number(w.retail_price || 0).toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}

// --- Appointments (public booking) ---
export function StorefrontAppointments() {
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); });
  const [slots, setSlots] = useState({ slots: [], closed: false });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', service_requested: '', notes: '' });
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    pubGet(`/appointments/slots?date=${date}`).then(setSlots).catch(() => {}).finally(() => setLoading(false));
  }, [date]);

  const handleBook = async () => {
    if (!selectedTime || !form.customer_name || !form.customer_phone) return;
    setSubmitting(true);
    try {
      await fetch(API + '/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, appointment_date: date, appointment_time: selectedTime + ':00' }),
      });
      setSuccess(true);
    } catch {} finally { setSubmitting(false); }
  };

  if (success) {
    return (
      <div className="sf-section" style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#2B7A3A' }}>Appointment Booked!</h1>
        <p>We have your appointment for {date} at {selectedTime}. We will contact you to confirm.</p>
        <Link to="/shop" className="sf-btn sf-btn-primary" style={{ marginTop: '1rem' }}>Back to Home</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="sf-page-title">Book an Appointment</h1>
      <div className="sf-section">
        <div className="form-field" style={{ marginBottom: '1rem' }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Select Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sf-input"
            min={new Date().toISOString().slice(0, 10)} style={{ width: 180 }} />
        </div>

        {loading ? <p>Loading available times...</p> : slots.closed ? (
          <p style={{ color: '#C9202F' }}>We are closed on this date. Please select another day.</p>
        ) : (
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Available Times</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {(slots.slots || []).map((s) => (
                <button key={s.time} className={`sf-btn ${selectedTime === s.time ? 'sf-btn-primary' : 'sf-btn-outline'}`}
                  disabled={!s.available} onClick={() => setSelectedTime(s.time)}
                  style={!s.available ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
                  {s.time}
                </button>
              ))}
            </div>

            {selectedTime && (
              <div style={{ maxWidth: 400 }}>
                <h3 style={{ marginBottom: '0.75rem' }}>Your Info</h3>
                <div className="form-field" style={{ marginBottom: '0.5rem' }}><label style={{ fontWeight: 500, display: 'block', marginBottom: '0.125rem' }}>Name *</label>
                  <input type="text" className="sf-input" value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} /></div>
                <div className="form-field" style={{ marginBottom: '0.5rem' }}><label style={{ fontWeight: 500, display: 'block', marginBottom: '0.125rem' }}>Phone *</label>
                  <input type="tel" className="sf-input" value={form.customer_phone} onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))} /></div>
                <div className="form-field" style={{ marginBottom: '0.5rem' }}><label style={{ fontWeight: 500, display: 'block', marginBottom: '0.125rem' }}>Service Needed</label>
                  <input type="text" className="sf-input" value={form.service_requested} onChange={(e) => setForm((p) => ({ ...p, service_requested: e.target.value }))} placeholder="e.g. Mount + balance 4 tires" /></div>
                <div className="form-field" style={{ marginBottom: '0.75rem' }}><label style={{ fontWeight: 500, display: 'block', marginBottom: '0.125rem' }}>Notes</label>
                  <textarea className="sf-input" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
                <button className="sf-btn sf-btn-primary" onClick={handleBook} disabled={submitting || !form.customer_name || !form.customer_phone}>
                  {submitting ? 'Booking...' : 'Confirm Appointment'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Warranty Info (public) ---
export function StorefrontWarranty() {
  const [policies, setPolicies] = useState([]);
  useEffect(() => { pubGet('/warranty-policies').then((d) => setPolicies(d.policies || [])).catch(() => {}); }, []);

  return (
    <div>
      <h1 className="sf-page-title">Road Hazard Warranty</h1>
      <div className="sf-section">
        <p>Protect your tire investment with our road hazard warranty. Coverage begins on the date of purchase.</p>
      </div>
      {policies.map((p) => (
        <div key={p.policy_id} className="sf-section" style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1.5rem', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>{p.policy_name}</h2>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#C9202F', margin: '0.5rem 0' }}>
            ${Number(p.price).toFixed(2)}{p.is_per_tire == 1 ? ' per tire' : ''}
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', margin: '0.75rem 0', fontSize: '0.9375rem' }}>
            <div><strong>Coverage:</strong> {p.coverage_months} months{p.coverage_miles ? ` / ${Number(p.coverage_miles).toLocaleString()} miles` : ''}</div>
            {p.max_claim_amount && <div><strong>Max Claim:</strong> ${Number(p.max_claim_amount).toFixed(2)}</div>}
            {Number(p.deductible) > 0 && <div><strong>Deductible:</strong> ${Number(p.deductible).toFixed(2)}</div>}
          </div>
          <p style={{ fontSize: '0.875rem', color: '#444', lineHeight: 1.6 }}>{p.terms_text}</p>
          {p.exclusions_text && (
            <details style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#666' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Exclusions</summary>
              <p style={{ marginTop: '0.25rem' }}>{p.exclusions_text}</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
