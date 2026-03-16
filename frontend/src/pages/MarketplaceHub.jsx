// ================================================================
// MarketplaceHub (P6)
// Tabbed interface: Listings, Orders, Distributors, Classifieds, B2B, Directory, Integrations
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';

const PLATFORMS = ['ebay', 'craigslist', 'facebook', 'offerup', 'b2b'];
const DISTRIBUTORS = ['atd', 'tbc', 'ntw'];
const LIST_STATUS_COLORS = { draft: 'badge-gray', active: 'badge-green', sold: 'badge-blue', expired: 'badge-orange', removed: 'badge-gray' };
const ORDER_STATUS_COLORS = { pending: 'badge-orange', confirmed: 'badge-blue', shipped: 'badge-blue', completed: 'badge-green', cancelled: 'badge-gray', refunded: 'badge-gray' };

export default function MarketplaceHub() {
  const [tab, setTab] = useState('listings');
  const tabs = [
    { key: 'listings', label: 'Listings' },
    { key: 'orders', label: 'Orders' },
    { key: 'distributors', label: 'Distributors' },
    { key: 'classifieds', label: 'Classifieds' },
    { key: 'b2b', label: 'B2B Network' },
    { key: 'directory', label: 'Directory' },
    { key: 'integrations', label: 'Integrations' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Marketplace</h1>
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1rem', borderBottom: '1px solid var(--lgray)', paddingBottom: '0.75rem' }}>
        {tabs.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'listings' && <ListingsTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'distributors' && <DistributorsTab />}
      {tab === 'classifieds' && <ClassifiedsTab />}
      {tab === 'b2b' && <B2bTab />}
      {tab === 'directory' && <DirectoryTab />}
      {tab === 'integrations' && <IntegrationsTab />}
    </div>
  );
}


// --- Listings Tab ---
function ListingsTab() {
  const [platform, setPlatform] = useState('');
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: 50 });
    if (platform) qs.set('platform', platform);
    api.get(`/marketplace/listings?${qs}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [platform]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button className={`btn btn-sm ${!platform ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPlatform('')}>All</button>
          {PLATFORMS.map((p) => <button key={p} className={`btn btn-sm ${platform === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPlatform(p)} style={{ textTransform: 'capitalize' }}>{p}</button>)}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ New Listing</button>
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>Platform</th><th>Title</th><th>Tire</th><th>Price</th><th>Status</th><th>Ext ID</th></tr></thead>
          <tbody>
            {(data.rows || []).map((l) => (
              <tr key={l.listing_id}>
                <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{l.platform}</td>
                <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</td>
                <td className="mono">{l.tire_size || '\u2014'}</td>
                <td className="mono">${Number(l.price).toFixed(2)}</td>
                <td><span className={`badge ${LIST_STATUS_COLORS[l.status] || ''}`}>{l.status}</span></td>
                <td className="mono" style={{ fontSize: '0.75rem' }}>{l.external_id || '\u2014'}</td>
              </tr>
            ))}
            {(data.rows || []).length === 0 && <tr><td colSpan={6} className="text-muted" style={{ textAlign: 'center' }}>No listings.</td></tr>}
          </tbody>
        </table>
      )}
      {showAdd && <AddListingModal onCreated={() => { setShowAdd(false); setMsg('Listing created.'); load(); }} onCancel={() => setShowAdd(false)} onError={setError} />}
    </div>
  );
}

function AddListingModal({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ platform: 'ebay', tire_id: '', title: '', description: '', price: '' });
  const [saving, setSaving] = useState(false);
  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const handleGenerate = async () => {
    if (!form.tire_id) { onError('Enter a tire ID first.'); return; }
    try {
      const content = await api.get(`/marketplace/generate-content/${form.tire_id}?platform=${form.platform}`);
      setForm((p) => ({ ...p, title: content.title, description: content.description, price: String(content.price) }));
    } catch (e) { onError(e.message); }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await api.post('/marketplace/listings', { ...form, tire_id: form.tire_id ? Number(form.tire_id) : null }); onCreated(); }
    catch (e) { onError(e.message); } finally { setSaving(false); }
  };

  const ta = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content">
        <div className="modal-header">New Marketplace Listing</div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-field"><label className="label">Platform</label>
              <select value={form.platform} onChange={ch('platform')}>{PLATFORMS.map((p) => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p}</option>)}</select></div>
            <div className="form-field"><label className="label">Tire ID</label>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <input type="number" value={form.tire_id} onChange={ch('tire_id')} style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={handleGenerate}>Auto-fill</button>
              </div></div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}><label className="label">Title</label>
              <input type="text" value={form.title} onChange={ch('title')} /></div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}><label className="label">Description</label>
              <textarea rows={5} value={form.description} onChange={ch('description')} style={ta} /></div>
            <div className="form-field"><label className="label">Price</label>
              <input type="number" step="0.01" value={form.price} onChange={ch('price')} /></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}


// --- Orders Tab ---
function OrdersTab() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: 50 });
    if (status) qs.set('status', status);
    api.get(`/marketplace/orders?${qs}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.75rem' }}>
        {['', 'pending', 'confirmed', 'shipped', 'completed'].map((s) => (
          <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatus(s)}>{s || 'All'}</button>
        ))}
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>Platform</th><th>Ext Order</th><th>Buyer</th><th>Total</th><th>Fees</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(data.rows || []).map((o) => (
              <tr key={o.order_id}>
                <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{o.platform}</td>
                <td className="mono">{o.external_order_id}</td>
                <td>{o.buyer_name || '\u2014'}</td>
                <td className="mono" style={{ fontWeight: 600 }}>${Number(o.order_total).toFixed(2)}</td>
                <td className="mono" style={{ color: 'var(--red)' }}>${Number(o.platform_fees).toFixed(2)}</td>
                <td className="mono">{o.ordered_at?.slice(0, 10)}</td>
                <td><span className={`badge ${ORDER_STATUS_COLORS[o.status] || ''}`}>{o.status}</span></td>
                <td>
                  {o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'refunded' && (
                    <OrderStatusButton orderId={o.order_id} current={o.status} onChanged={load} />
                  )}
                </td>
              </tr>
            ))}
            {(data.rows || []).length === 0 && <tr><td colSpan={8} className="text-muted" style={{ textAlign: 'center' }}>No orders.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OrderStatusButton({ orderId, current, onChanged }) {
  const NEXT = { pending: 'confirmed', confirmed: 'shipped', shipped: 'completed' };
  const next = NEXT[current];
  if (!next) return null;
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try { await api.patch(`/marketplace/orders/${orderId}/status`, { status: next }); onChanged(); }
    catch (e) { alert('Error: ' + e.message); }
    finally { setBusy(false); }
  };
  return (
    <button className="btn btn-ghost btn-sm" onClick={handle} disabled={busy}
      style={{ fontSize: '0.65rem', textTransform: 'capitalize' }}>
      {busy ? '...' : `Mark ${next}`}
    </button>
  );
}


// --- Distributors Tab ---
function DistributorsTab() {
  const [distributor, setDistributor] = useState('atd');
  const [size, setSize] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!size) return;
    setLoading(true); setError(null);
    try { setResults(await api.get(`/distributors/${distributor}/search?size=${encodeURIComponent(size)}`)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="card">
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>Search Distributor Catalog</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-field"><label className="label">Distributor</label>
            <select value={distributor} onChange={(e) => setDistributor(e.target.value)}>
              {DISTRIBUTORS.map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
            </select></div>
          <div className="form-field"><label className="label">Tire Size</label>
            <input type="text" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 265/70R17" /></div>
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !size}>
            {loading ? <span className="spinner" /> : 'Search'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{error}</div>}

      {results && (
        <div className="card" style={{ marginTop: '0.75rem' }}>
          {results.error ? (
            <div className="alert alert-error">{results.error}</div>
          ) : results.note ? (
            <div style={{ padding: '1rem', background: 'var(--lgray)', borderRadius: 'var(--radius-sm)' }}>
              <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{results.distributor?.toUpperCase()} Integration</p>
              <p className="text-muted" style={{ fontSize: '0.875rem' }}>{results.note}</p>
              {results.items && results.items.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  {results.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                      <div><span className="mono">{item.part_number || item.size || 'Item'}</span> {item.description && <span className="text-muted"> {item.description}</span>}</div>
                      <DistributorOrderButton distributor={distributor} item={item} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted">No results.</p>
          )}
        </div>
      )}
    </div>
  );
}


// --- Classifieds Tab ---

function DistributorOrderButton({ distributor, item }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      await api.post(`/distributors/${distributor}/order`, { items: [item] });
      setDone(true);
    } catch (e) { alert('Error: ' + e.message); }
    finally { setBusy(false); }
  };
  if (done) return <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>Ordered</span>;
  return (
    <button className="btn btn-primary btn-sm" onClick={handle} disabled={busy} style={{ fontSize: '0.7rem' }}>
      {busy ? '...' : 'Place Order'}
    </button>
  );
}

function ClassifiedsTab() {
  const [tireId, setTireId] = useState('');
  const [platform, setPlatform] = useState('craigslist');
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!tireId) return;
    setLoading(true);
    try { setContent(await api.get(`/marketplace/generate-content/${tireId}?platform=${platform}`)); }
    catch {} finally { setLoading(false); }
  };

  const handleCopy = () => {
    if (!content) return;
    const text = `${content.title}\n\n${content.description}\n\nPrice: $${Number(content.price).toFixed(2)}`;
    navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
  };

  return (
    <div>
      <div className="card">
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>Generate Listing Content</h3>
        <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
          Auto-generate formatted listing text for classifieds platforms. Copy and paste to Craigslist, Facebook Marketplace, or OfferUp.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div className="form-field"><label className="label">Tire ID</label>
            <input type="number" value={tireId} onChange={(e) => setTireId(e.target.value)} /></div>
          <div className="form-field"><label className="label">Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="craigslist">Craigslist</option>
              <option value="facebook">Facebook Marketplace</option>
              <option value="offerup">OfferUp</option>
            </select></div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !tireId}>
            {loading ? <span className="spinner" /> : 'Generate'}
          </button>
        </div>
      </div>

      {content && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', margin: 0 }}>Preview</h3>
            <button className="btn btn-primary btn-sm" onClick={handleCopy}>Copy to Clipboard</button>
          </div>
          <div style={{ background: 'var(--lgray)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace', fontSize: '0.875rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>{content.title}</div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{content.description}</pre>
            <div style={{ marginTop: '0.5rem', fontWeight: 700, color: 'var(--red)' }}>${Number(content.price).toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
}


// --- B2B Tab ---
function B2bTab() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/b2b/inventory').then((d) => setInventory(d.inventory || [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleRemove = async (id) => {
    if (!confirm('Remove from B2B network?')) return;
    try { await api.delete(`/b2b/inventory/${id}`); setMsg('Removed.'); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <p className="text-muted" style={{ fontSize: '0.8125rem', margin: 0 }}>
          Expose inventory to other tire shops on the B2B network. Set wholesale prices and quantity limits.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add to Network</button>
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>Tire/Wheel</th><th>Type</th><th>Wholesale</th><th>Min Qty</th><th>Cond</th><th></th></tr></thead>
          <tbody>
            {inventory.map((i) => (
              <tr key={i.b2b_id}>
                <td style={{ fontWeight: 500 }}>{i.tire_size ? `${i.tire_brand || ''} ${i.tire_size}` : i.description || '\u2014'}</td>
                <td><span className="badge badge-blue">{i.listing_type}</span></td>
                <td className="mono" style={{ fontWeight: 600 }}>${Number(i.wholesale_price).toFixed(2)}</td>
                <td className="mono">{i.min_quantity}</td>
                <td>{i.tire_condition ? <span className={`badge ${i.tire_condition === 'new' ? 'badge-green' : 'badge-orange'}`}>{i.tire_condition}</span> : '\u2014'}</td>
                <td><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleRemove(i.b2b_id)}>Remove</button></td>
              </tr>
            ))}
            {inventory.length === 0 && <tr><td colSpan={6} className="text-muted" style={{ textAlign: 'center' }}>No items on B2B network.</td></tr>}
          </tbody>
        </table>
      )}
      {showAdd && <AddB2bModal onCreated={() => { setShowAdd(false); setMsg('Added to network.'); load(); }} onCancel={() => setShowAdd(false)} onError={setError} />}
    </div>
  );
}

function AddB2bModal({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ tire_id: '', listing_type: 'sell', wholesale_price: '', min_quantity: '1', description: '' });
  const [saving, setSaving] = useState(false);
  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const handleSave = async () => {
    setSaving(true);
    try { await api.post('/b2b/inventory', { ...form, tire_id: form.tire_id ? Number(form.tire_id) : null }); onCreated(); }
    catch (e) { onError(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content">
        <div className="modal-header">Add to B2B Network</div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-field"><label className="label">Tire ID</label><input type="number" value={form.tire_id} onChange={ch('tire_id')} /></div>
            <div className="form-field"><label className="label">Type</label>
              <select value={form.listing_type} onChange={ch('listing_type')}><option value="sell">Sell</option><option value="buy">Buy</option><option value="both">Both</option></select></div>
            <div className="form-field"><label className="label">Wholesale Price</label><input type="number" step="0.01" value={form.wholesale_price} onChange={ch('wholesale_price')} /></div>
            <div className="form-field"><label className="label">Min Quantity</label><input type="number" value={form.min_quantity} onChange={ch('min_quantity')} /></div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}><label className="label">Description</label>
              <input type="text" value={form.description} onChange={ch('description')} /></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}


// --- Directory Tab ---
function DirectoryTab() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/directory-listings').then((d) => setListings(d.listings || [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const DIR_COLORS = { pending: 'badge-orange', active: 'badge-green', suspended: 'badge-gray', removed: 'badge-gray' };

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <p className="text-muted" style={{ fontSize: '0.8125rem', margin: 0 }}>Manage your shop's presence on national tire directories.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Directory</button>
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>Directory</th><th>URL</th><th>Status</th><th>Last Verified</th></tr></thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.directory_id}>
                <td style={{ fontWeight: 500 }}>{l.directory_name}</td>
                <td>{l.listing_url ? <a href={l.listing_url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: '0.8125rem' }}>{l.listing_url.slice(0, 40)}...</a> : '\u2014'}</td>
                <td><span className={`badge ${DIR_COLORS[l.listing_status] || ''}`}>{l.listing_status}</span></td>
                <td className="mono">{l.last_verified || 'Never'}</td>
              </tr>
            ))}
            {listings.length === 0 && <tr><td colSpan={4} className="text-muted" style={{ textAlign: 'center' }}>No directory listings.</td></tr>}
          </tbody>
        </table>
      )}
      {showAdd && <AddDirectoryModal onCreated={() => { setShowAdd(false); setMsg('Listing added.'); load(); }} onCancel={() => setShowAdd(false)} onError={setError} />}
    </div>
  );
}

function AddDirectoryModal({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ directory_name: '', listing_url: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const handleSave = async () => {
    setSaving(true);
    try { await api.post('/directory-listings', form); onCreated(); }
    catch (e) { onError(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content">
        <div className="modal-header">Add Directory Listing</div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-field"><label className="label">Directory Name</label>
              <input type="text" value={form.directory_name} onChange={ch('directory_name')} placeholder="e.g. TireConnect" /></div>
            <div className="form-field"><label className="label">Listing URL</label>
              <input type="url" value={form.listing_url} onChange={ch('listing_url')} /></div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}><label className="label">Notes</label>
              <input type="text" value={form.notes} onChange={ch('notes')} /></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}


// --- Integrations Tab ---
function IntegrationsTab() {
  const [integrations, setIntegrations] = useState([]);
  const [syncLog, setSyncLog] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [showAddCred, setShowAddCred] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/integrations'),
      api.get('/integrations/sync-log?limit=20'),
    ]).then(([i, s]) => { setIntegrations(i.integrations || []); setSyncLog(s); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const SYNC_COLORS = { success: 'badge-green', failed: 'badge-orange', pending: 'badge-gray', partial: 'badge-blue' };

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', margin: 0 }}>Configured Integrations</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddCred(true)}>+ Add Credential</button>
        </div>
        {loading ? <span className="spinner" /> : integrations.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>No integrations configured. Add API credentials to connect to distributors, eBay, or B2B networks.</p>
        ) : (
          <table className="entity-table">
            <thead><tr><th>Integration</th><th>Environment</th><th>Credentials</th><th>Last Updated</th></tr></thead>
            <tbody>
              {integrations.map((i, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 500, textTransform: 'uppercase' }}>{i.integration}</td>
                  <td><span className={`badge ${i.environment === 'production' ? 'badge-green' : 'badge-orange'}`}>{i.environment}</span></td>
                  <td className="mono">{i.credential_count} keys</td>
                  <td className="mono">{i.last_updated?.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>Sync Log (Recent 20)</h3>
        {(syncLog.rows || []).length === 0 ? <p className="text-muted" style={{ fontSize: '0.875rem' }}>No sync activity yet.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Time</th><th>Integration</th><th>Action</th><th>Dir</th><th>Status</th><th>Duration</th><th>Note</th></tr></thead>
            <tbody>
              {(syncLog.rows || []).map((s) => (
                <tr key={s.sync_id}>
                  <td className="mono">{s.created_at?.slice(11, 19)}</td>
                  <td style={{ textTransform: 'uppercase' }}>{s.integration}</td>
                  <td>{s.action}</td>
                  <td>{s.direction === 'outbound' ? '\u2192' : '\u2190'}</td>
                  <td><span className={`badge ${SYNC_COLORS[s.status] || ''}`}>{s.status}</span></td>
                  <td className="mono">{s.duration_ms ? s.duration_ms + 'ms' : '\u2014'}</td>
                  <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.response_summary || s.error_message || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddCred && <AddCredentialModal onCreated={() => { setShowAddCred(false); setMsg('Credential saved.'); load(); }} onCancel={() => setShowAddCred(false)} onError={setError} />}
    </div>
  );
}

function AddCredentialModal({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ integration: 'atd', key: 'api_key', value: '', environment: 'sandbox' });
  const [saving, setSaving] = useState(false);
  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const handleSave = async () => {
    setSaving(true);
    try { await api.post(`/integrations/${form.integration}/credentials`, form); onCreated(); }
    catch (e) { onError(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content">
        <div className="modal-header">Add Integration Credential</div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-field"><label className="label">Integration</label>
              <select value={form.integration} onChange={ch('integration')}>
                {['atd', 'tbc', 'ntw', 'ebay', 'b2b'].map((i) => <option key={i} value={i}>{i.toUpperCase()}</option>)}
              </select></div>
            <div className="form-field"><label className="label">Environment</label>
              <select value={form.environment} onChange={ch('environment')}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
            <div className="form-field"><label className="label">Key Name</label>
              <input type="text" value={form.key} onChange={ch('key')} placeholder="e.g. api_key, client_secret" /></div>
            <div className="form-field"><label className="label">Value</label>
              <input type="password" value={form.value} onChange={ch('value')} /></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
