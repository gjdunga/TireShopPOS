// ================================================================
// DiscountManager (P5a/P5b)
// Discount groups admin + coupon management
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect } from 'react';
import api from '../api/client.js';

export default function DiscountManager() {
  const [tab, setTab] = useState('groups');
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Discounts & Coupons</h1>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', borderBottom: '1px solid var(--lgray)', paddingBottom: '0.75rem' }}>
        <button className={`btn btn-sm ${tab === 'groups' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('groups')}>Discount Groups</button>
        <button className={`btn btn-sm ${tab === 'coupons' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('coupons')}>Coupons</button>
      </div>
      {tab === 'groups' && <GroupsTab />}
      {tab === 'coupons' && <CouponsTab />}
    </div>
  );
}

function GroupsTab() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/discount-groups?active_only=0').then((d) => setGroups(d.groups || [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleToggle = async (id, active) => {
    try { await api.patch(`/discount-groups/${id}`, { is_active: active ? 0 : 1 }); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ New Group</button>
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Value</th><th>Applies</th><th>Auto</th><th>Stack</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.group_id}>
                <td className="mono">{g.group_code}</td>
                <td style={{ fontWeight: 500 }}>{g.group_name}</td>
                <td>{g.discount_type}</td>
                <td className="mono">{g.discount_type === 'percentage' ? g.discount_value + '%' : '$' + Number(g.discount_value).toFixed(2)}</td>
                <td>{g.applies_to}</td>
                <td>{g.auto_apply == 1 ? 'Yes' : 'No'}</td>
                <td>{g.stackable == 1 ? 'Yes' : 'No'}</td>
                <td>{g.is_active == 1 ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Off</span>}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => handleToggle(g.group_id, g.is_active == 1)}>
                  {g.is_active == 1 ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showAdd && <AddGroupForm onCreated={() => { setShowAdd(false); setMsg('Group created.'); load(); }} onCancel={() => setShowAdd(false)} onError={setError} />}
    </div>
  );
}

function AddGroupForm({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ group_name: '', group_code: '', discount_type: 'percentage', discount_value: '', applies_to: 'all', auto_apply: '1', stackable: '0', notes: '' });
  const [saving, setSaving] = useState(false);
  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const handleSave = async () => {
    setSaving(true);
    try { await api.post('/discount-groups', { ...form, auto_apply: Number(form.auto_apply), stackable: Number(form.stackable) }); onCreated(); }
    catch (e) { onError(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div className="form-grid">
        <div className="form-field"><label className="label">Name</label><input type="text" value={form.group_name} onChange={ch('group_name')} /></div>
        <div className="form-field"><label className="label">Code (unique)</label><input type="text" value={form.group_code} onChange={ch('group_code')} /></div>
        <div className="form-field"><label className="label">Type</label><select value={form.discount_type} onChange={ch('discount_type')}><option value="percentage">Percentage</option><option value="fixed_per_tire">Fixed/Tire</option><option value="fixed_per_invoice">Fixed/Invoice</option></select></div>
        <div className="form-field"><label className="label">Value</label><input type="number" step="0.01" value={form.discount_value} onChange={ch('discount_value')} /></div>
        <div className="form-field"><label className="label">Applies To</label><select value={form.applies_to} onChange={ch('applies_to')}><option value="all">All</option><option value="tires">Tires</option><option value="labor">Labor</option><option value="parts">Parts</option></select></div>
        <div className="form-field"><label className="label">Auto Apply</label><select value={form.auto_apply} onChange={ch('auto_apply')}><option value="1">Yes</option><option value="0">No</option></select></div>
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Create'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function CouponsTab() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/coupons?active_only=0').then((d) => setCoupons(d.coupons || [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ New Coupon</button>
      </div>
      {loading ? <span className="spinner" /> : (
        <table className="entity-table">
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Discount</th><th>Valid</th><th>Used</th><th>Active</th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.coupon_id}>
                <td className="mono" style={{ fontWeight: 600 }}>{c.coupon_code}</td>
                <td>{c.coupon_name}</td>
                <td><span className={`badge ${c.coupon_type === 'manufacturer' ? 'badge-blue' : 'badge-gray'}`}>{c.coupon_type}</span></td>
                <td className="mono">{c.discount_type === 'percentage' ? c.discount_value + '%' : '$' + Number(c.discount_value).toFixed(2)}{c.discount_type === 'buy_x_get_y' ? ` B${c.buy_qty}G${c.get_qty}` : ''}</td>
                <td className="mono">{c.valid_from}{c.valid_until ? ' to ' + c.valid_until : '+'}</td>
                <td className="mono">{c.usage_count}{c.usage_limit ? '/' + c.usage_limit : ''}</td>
                <td>{c.is_active == 1 ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Off</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showAdd && <AddCouponForm onCreated={() => { setShowAdd(false); setMsg('Coupon created.'); load(); }} onCancel={() => setShowAdd(false)} onError={setError} />}
    </div>
  );
}

function AddCouponForm({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({
    coupon_code: '', coupon_name: '', coupon_type: 'store', discount_type: 'percentage',
    discount_value: '', applies_to: 'all', min_purchase: '', max_discount: '',
    usage_limit: '', usage_per_customer: '', stackable: '0',
    valid_from: new Date().toISOString().slice(0, 10), valid_until: '',
  });
  const [saving, setSaving] = useState(false);
  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/coupons', { ...form, stackable: Number(form.stackable),
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        usage_per_customer: form.usage_per_customer ? Number(form.usage_per_customer) : null,
        min_purchase: form.min_purchase || null, max_discount: form.max_discount || null,
        valid_until: form.valid_until || null });
      onCreated();
    } catch (e) { onError(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div className="form-grid">
        <div className="form-field"><label className="label">Code</label><input type="text" value={form.coupon_code} onChange={ch('coupon_code')} style={{ textTransform: 'uppercase' }} /></div>
        <div className="form-field"><label className="label">Name</label><input type="text" value={form.coupon_name} onChange={ch('coupon_name')} /></div>
        <div className="form-field"><label className="label">Coupon Type</label>
          <select value={form.coupon_type} onChange={ch('coupon_type')}>
            <option value="store">Store (after tax)</option><option value="manufacturer">Manufacturer (before tax)</option>
          </select>
          <small className="text-muted">{form.coupon_type === 'manufacturer' ? 'Reduces taxable base per CO DOR rules' : 'Applied after tax calculation'}</small>
        </div>
        <div className="form-field"><label className="label">Discount Type</label>
          <select value={form.discount_type} onChange={ch('discount_type')}><option value="percentage">Percentage</option><option value="fixed">Fixed $</option><option value="buy_x_get_y">Buy X Get Y</option></select></div>
        <div className="form-field"><label className="label">Value</label><input type="number" step="0.01" value={form.discount_value} onChange={ch('discount_value')} /></div>
        <div className="form-field"><label className="label">Max Discount</label><input type="number" step="0.01" value={form.max_discount} onChange={ch('max_discount')} placeholder="No cap" /></div>
        <div className="form-field"><label className="label">Valid From</label><input type="date" value={form.valid_from} onChange={ch('valid_from')} /></div>
        <div className="form-field"><label className="label">Valid Until</label><input type="date" value={form.valid_until} onChange={ch('valid_until')} placeholder="No expiry" /></div>
        <div className="form-field"><label className="label">Usage Limit</label><input type="number" value={form.usage_limit} onChange={ch('usage_limit')} placeholder="Unlimited" /></div>
        <div className="form-field"><label className="label">Per Customer</label><input type="number" value={form.usage_per_customer} onChange={ch('usage_per_customer')} placeholder="Unlimited" /></div>
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : 'Create'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
