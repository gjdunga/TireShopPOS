// ================================================================
// WorkOrderDetail (P2e)
// Create/edit work order. Position grid (5/7/9 wheel positions),
// tire assignment, torque verification gate (hard block), waiver
// auto-detection, tech assignment, status workflow.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import './WorkOrder.css';

const POSITIONS = ['LF', 'RF', 'LR', 'RR', 'SPARE'];
const DUALLY_POSITIONS = ['LF', 'RF', 'LR', 'RR', 'SPARE', 'LRI', 'RRI'];
const ACTIONS = [
  { value: 'none', label: 'None' },
  { value: 'install', label: 'Install' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspect', label: 'Inspect' },
  { value: 'rotate_to', label: 'Rotate To' },
  { value: 'dismount', label: 'Dismount' },
];
const GRADES = [
  { value: 'not_inspected', label: 'Not Inspected' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'unsafe', label: 'Unsafe' },
];

const EMPTY_WO = {
  customer_id: '', vehicle_id: '', assigned_tech_id: '',
  mileage_in: '', customer_complaint: '', special_notes: '',
  estimated_price: '',
};

export default function WorkOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const isNew = id === 'new';

  const [wo, setWo] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_WO });
  const [positions, setPositions] = useState([]);
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  // Customer/vehicle search state for new WOs
  const [custSearch, setCustSearch] = useState('');
  const [custResults, setCustResults] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [vehResults, setVehResults] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  // Torque + waiver state
  const [torqueForm, setTorqueForm] = useState({ torque_spec_used: '', torque_verified_by: '' });
  const [completable, setCompletable] = useState(null);
  const [waivers, setWaivers] = useState([]);
  const [waiverModal, setWaiverModal] = useState(null);

  const loadTechs = useCallback(() => {
    api.get('/users/techs').then((d) => setTechs(d.techs || [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (isNew) { loadTechs(); return; }
    setLoading(true);
    Promise.all([
      api.get(`/work-orders/${id}`),
      api.get(`/work-orders/${id}/completable`).catch(() => null),
      api.get('/users/techs').catch(() => ({ techs: [] })),
    ])
      .then(([woData, comp, techData]) => {
        setWo(woData);
        setForm({
          customer_id: woData.customer_id || '',
          vehicle_id: woData.vehicle_id || '',
          assigned_tech_id: woData.assigned_tech_id || '',
          mileage_in: woData.mileage_in || '',
          mileage_out: woData.mileage_out || '',
          customer_complaint: woData.customer_complaint || '',
          special_notes: woData.special_notes || '',
          estimated_price: woData.estimated_price || '',
          status: woData.status || 'intake',
        });
        setPositions(woData.positions || []);
        setTorqueForm({
          torque_spec_used: woData.torque_spec_used || '',
          torque_verified_by: woData.torque_verified_by || '',
        });
        setCompletable(comp);
        setTechs(techData.techs || []);
        setSelectedCustomer(woData.customer_first ? { customer_id: woData.customer_id, first_name: woData.customer_first, last_name: woData.customer_last } : null);
        setSelectedVehicle(woData.vehicle_id ? { vehicle_id: woData.vehicle_id, year: woData.vehicle_year, make: woData.vehicle_make, model: woData.vehicle_model } : null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew, loadTechs]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Create new work order
  const handleCreate = async () => {
    if (!form.customer_id) { setError('Customer is required.'); return; }
    setSaving(true); setError(null);
    try {
      const result = await api.post('/work-orders', form);
      navigate(`/work-orders/${result.work_order_id}`, { replace: true });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // Save work order header
  const handleSave = async () => {
    setSaving(true); setMsg(null); setError(null);
    try {
      const result = await api.patch(`/work-orders/${id}`, form);
      setMsg(result.changed?.length ? `Updated: ${result.changed.join(', ')}` : 'No changes.');
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // Assign tech
  const handleAssign = async (techId) => {
    try {
      await api.post(`/work-orders/${id}/assign`, { tech_id: techId });
      load();
    } catch (err) { setError(err.message); }
  };

  // Record torque verification
  const handleTorqueVerify = async () => {
    if (!torqueForm.torque_spec_used) { setError('Enter torque spec used.'); return; }
    try {
      await api.patch(`/work-orders/${id}`, {
        torque_spec_used: Number(torqueForm.torque_spec_used),
        torque_verified_by: Number(torqueForm.torque_verified_by) || undefined,
        torque_verified_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      setMsg('Torque verified.');
      load();
    } catch (err) { setError(err.message); }
  };

  // Complete work order (torque gate enforced server-side)
  const handleComplete = async () => {
    try {
      const result = await api.post(`/work-orders/${id}/complete`);
      if (!result.can_complete) {
        setError(result.reason || 'Cannot complete: torque verification required.');
        return;
      }
      setMsg('Work order completed.');
      load();
    } catch (err) { setError(err.message); }
  };

  // Create invoice from work order
  const handleCreateInvoice = async () => {
    try {
      const result = await api.post('/invoices', {
        customer_id: wo.customer_id,
        work_order_id: wo.work_order_id,
      });
      navigate(`/invoices/${result.invoice_id}`);
    } catch (err) { setError(err.message); }
  };

  // Customer search (for new WO)
  const searchCustomers = async () => {
    if (custSearch.trim().length < 2) return;
    const data = await api.get(`/customers/search?q=${encodeURIComponent(custSearch)}&limit=10`);
    setCustResults(data.results || []);
  };

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setForm((prev) => ({ ...prev, customer_id: c.customer_id }));
    setCustResults(null);
    // Load customer vehicles
    api.get(`/customers/${c.customer_id}/vehicles`)
      .then((d) => setVehResults(d.vehicles || []))
      .catch(() => setVehResults([]));
  };

  const selectVehicle = (v) => {
    setSelectedVehicle(v);
    setForm((prev) => ({ ...prev, vehicle_id: v.vehicle_id }));
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;
  }

  return (
    <div>
      <Link to="/work-orders" className="text-muted" style={{ fontSize: '0.8125rem' }}>&larr; Back to Work Orders</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>
          {isNew ? 'New Work Order' : `${wo?.wo_number || 'Work Order'}`}
          {wo && <StatusBadge status={wo.status} style={{ marginLeft: '0.75rem', verticalAlign: 'middle' }} />}
        </h1>
        {!isNew && wo && (
          <a href={`/print/work-order/${wo.work_order_id}`} target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Print</a>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{msg}</div>}

      <div className="wo-layout">
        {/* Left: WO header form */}
        <div>
          <div className="card">
            <SectionTitle>Work Order Details</SectionTitle>

            {/* Customer selection */}
            <div className="form-field" style={{ marginBottom: '0.75rem' }}>
              <label className="label">Customer</label>
              {selectedCustomer ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 500 }}>{selectedCustomer.first_name} {selectedCustomer.last_name}</span>
                  {isNew && <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCustomer(null); setForm((p) => ({ ...p, customer_id: '' })); setVehResults(null); setSelectedVehicle(null); }}>Change</button>}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" placeholder="Search customers..." value={custSearch}
                    onChange={(e) => setCustSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchCustomers()} style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm" onClick={searchCustomers}>Search</button>
                </div>
              )}
              {custResults && custResults.length > 0 && !selectedCustomer && (
                <ul className="linked-list" style={{ marginTop: '0.5rem', background: 'var(--lgray)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  {custResults.map((c) => (
                    <li key={c.customer_id} className="linked-item">
                      <span>{c.first_name} {c.last_name} ({c.phone_primary || c.email || 'no contact'})</span>
                      <button className="btn btn-primary btn-sm" onClick={() => selectCustomer(c)}>Select</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Vehicle selection */}
            <div className="form-field" style={{ marginBottom: '0.75rem' }}>
              <label className="label">Vehicle</label>
              {selectedVehicle ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 500 }}>{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</span>
                  {isNew && <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedVehicle(null); setForm((p) => ({ ...p, vehicle_id: '' })); }}>Change</button>}
                </div>
              ) : vehResults && vehResults.length > 0 ? (
                <ul className="linked-list" style={{ background: 'var(--lgray)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  {vehResults.map((v) => (
                    <li key={v.vehicle_id} className="linked-item">
                      <span>{v.year} {v.make} {v.model}{v.vin ? ` (${v.vin.slice(-6)})` : ''}</span>
                      <button className="btn btn-primary btn-sm" onClick={() => selectVehicle(v)}>Select</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted" style={{ fontSize: '0.875rem' }}>{selectedCustomer ? 'No vehicles linked to customer.' : 'Select a customer first.'}</span>
              )}
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label className="label">Assigned Tech</label>
                <select value={form.assigned_tech_id || ''} onChange={(e) => {
                  const v = e.target.value;
                  setForm((p) => ({ ...p, assigned_tech_id: v }));
                  if (!isNew && v) handleAssign(Number(v));
                }}>
                  <option value="">Unassigned</option>
                  {techs.map((t) => <option key={t.user_id} value={t.user_id}>{t.display_name}</option>)}
                </select>
              </div>
              <Field label="Mileage In" value={form.mileage_in} onChange={handleChange('mileage_in')} type="number" />
              {!isNew && <Field label="Mileage Out" value={form.mileage_out} onChange={handleChange('mileage_out')} type="number" />}
            </div>

            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label className="label">Customer Complaint</label>
              <textarea rows={2} value={form.customer_complaint || ''} onChange={handleChange('customer_complaint')} className="textarea" />
            </div>

            <div className="form-field" style={{ marginTop: '0.5rem' }}>
              <label className="label">Special Notes</label>
              <textarea rows={2} value={form.special_notes || ''} onChange={handleChange('special_notes')} className="textarea" />
            </div>

            <div className="form-field" style={{ marginTop: '0.5rem', maxWidth: '12rem' }}>
              <label className="label">Estimated Price</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>$</span>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.estimated_price || ''} onChange={handleChange('estimated_price')}
                  style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {isNew ? (
                <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.customer_id}>
                  {saving ? <span className="spinner" /> : 'Create Work Order'}
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Save Changes'}
                </button>
              )}
              {!isNew && wo?.status !== 'complete' && wo?.status !== 'cancelled' && (
                <button className="btn btn-sm" style={{ background: 'var(--green)', color: 'white' }} onClick={handleComplete}>
                  Complete Work Order
                </button>
              )}
              {!isNew && wo?.status === 'complete' && !wo?.invoice_id && can('INVOICE_CREATE') && (
                <button className="btn btn-primary btn-sm" onClick={handleCreateInvoice}>Create Invoice</button>
              )}
              {!isNew && wo?.invoice_id && (
                <Link to={`/invoices/${wo.invoice_id}`} className="btn btn-ghost btn-sm">View Invoice</Link>
              )}
            </div>
          </div>

          {/* Torque Verification */}
          {!isNew && wo?.status !== 'cancelled' && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <SectionTitle>Torque Verification</SectionTitle>
              <TorqueGate
                wo={wo}
                completable={completable}
                torqueForm={torqueForm}
                setTorqueForm={setTorqueForm}
                techs={techs}
                onVerify={handleTorqueVerify}
              />
            </div>
          )}
        </div>

        {/* Right: Position grid */}
        {!isNew && (
          <div>
            <div className="card">
              <SectionTitle>Wheel Positions</SectionTitle>
              <PositionGrid
                woId={Number(id)}
                positions={positions}
                onChanged={load}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ================================================================
// Position Grid
// ================================================================

function PositionGrid({ woId, positions, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [newPos, setNewPos] = useState({ position_code: 'LF', action_requested: 'install', tire_id_new: '', tread_depth_in: '', psi_in: '' });
  const [saving, setSaving] = useState(false);

  const usedPositions = positions.map((p) => p.position_code);
  const availablePositions = [...POSITIONS, ...['LRI', 'RRI']].filter((p) => !usedPositions.includes(p));

  const handleAddPosition = async () => {
    setSaving(true);
    try {
      await api.post(`/work-orders/${woId}/positions`, newPos);
      setAdding(false);
      setNewPos({ position_code: availablePositions[0] || 'LF', action_requested: 'install', tire_id_new: '', tread_depth_in: '', psi_in: '' });
      onChanged();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleUpdatePosition = async (posId, field, value) => {
    try {
      await api.patch(`/work-orders/positions/${posId}`, { [field]: value });
      onChanged();
    } catch (err) { alert('Error: ' + err.message); }
  };

  const markComplete = async (posId) => {
    try {
      await api.patch(`/work-orders/positions/${posId}`, { is_completed: 1, completed_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
      onChanged();
    } catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div>
      {positions.length > 0 ? (
        <div className="pos-grid">
          {positions.map((pos) => (
            <div key={pos.position_id} className={`pos-card ${pos.is_completed ? 'pos-done' : ''}`}>
              <div className="pos-header">
                <span className="pos-code">{pos.position_code}</span>
                <span className="pos-action">{(pos.action_requested || 'none').replace(/_/g, ' ')}</span>
                {pos.is_completed && <span className="badge" style={{ background: 'rgba(43,122,58,0.1)', color: 'var(--green)', fontSize: '0.625rem' }}>Done</span>}
              </div>

              <div className="pos-body">
                {pos.new_tire_size && <div className="pos-tire"><span className="label">New:</span> {pos.new_tire_brand} {pos.new_tire_size}</div>}
                {pos.existing_tire_size && <div className="pos-tire"><span className="label">Existing:</span> {pos.existing_tire_brand} {pos.existing_tire_size}</div>}

                <div className="pos-metrics">
                  {pos.tread_depth_in != null && <span>Tread In: {pos.tread_depth_in}/32</span>}
                  {pos.tread_depth_out != null && <span>Tread Out: {pos.tread_depth_out}/32</span>}
                  {pos.psi_in != null && <span>PSI In: {pos.psi_in}</span>}
                  {pos.psi_out != null && <span>PSI Out: {pos.psi_out}</span>}
                </div>

                {pos.condition_notes && <div className="pos-notes">{pos.condition_notes}</div>}

                <div className="pos-grade">
                  <select value={pos.condition_grade || 'not_inspected'}
                    onChange={(e) => handleUpdatePosition(pos.position_id, 'condition_grade', e.target.value)}
                    style={{ fontSize: '0.75rem' }}>
                    {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>

                {!pos.is_completed && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem' }}>
                    <InlineEdit posId={pos.position_id} field="tread_depth_out" label="Tread Out" type="number" onSave={handleUpdatePosition} />
                    <InlineEdit posId={pos.position_id} field="psi_out" label="PSI Out" type="number" onSave={handleUpdatePosition} />
                    <button className="btn btn-sm" style={{ background: 'var(--green)', color: 'white', fontSize: '0.6875rem' }} onClick={() => markComplete(pos.position_id)}>
                      Mark Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>No positions added yet.</p>
      )}

      {/* Add position */}
      {!adding ? (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.75rem' }}
          onClick={() => setAdding(true)} disabled={availablePositions.length === 0}>
          + Add Position
        </button>
      ) : (
        <div style={{ marginTop: '0.75rem', background: 'var(--lgray)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-field" style={{ minWidth: 80 }}>
              <label className="label">Position</label>
              <select value={newPos.position_code} onChange={(e) => setNewPos((p) => ({ ...p, position_code: e.target.value }))}>
                {availablePositions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ minWidth: 100 }}>
              <label className="label">Action</label>
              <select value={newPos.action_requested} onChange={(e) => setNewPos((p) => ({ ...p, action_requested: e.target.value }))}>
                {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ minWidth: 80 }}>
              <label className="label">Tire ID (new)</label>
              <input type="number" value={newPos.tire_id_new} onChange={(e) => setNewPos((p) => ({ ...p, tire_id_new: e.target.value }))} />
            </div>
            <div className="form-field" style={{ minWidth: 80 }}>
              <label className="label">Tread In</label>
              <input type="number" min="0" max="32" value={newPos.tread_depth_in} onChange={(e) => setNewPos((p) => ({ ...p, tread_depth_in: e.target.value }))} />
            </div>
            <div className="form-field" style={{ minWidth: 80 }}>
              <label className="label">PSI In</label>
              <input type="number" value={newPos.psi_in} onChange={(e) => setNewPos((p) => ({ ...p, psi_in: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={handleAddPosition} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Add'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ================================================================
// Torque Gate
// ================================================================

function TorqueGate({ wo, completable, torqueForm, setTorqueForm, techs, onVerify }) {
  const isVerified = wo?.torque_verified_by && wo?.torque_verified_at;
  const canComplete = completable?.can_complete;

  return (
    <div>
      {isVerified ? (
        <div>
          <div className="alert alert-success" style={{ marginBottom: '0.5rem' }}>
            Torque verified: {wo.torque_spec_used} ft-lbs at {wo.torque_verified_at?.slice(0, 16)?.replace('T', ' ')}
          </div>
        </div>
      ) : (
        <div>
          {completable && !canComplete && (
            <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontWeight: 500 }}>
              TORQUE GATE: {completable.reason}
            </div>
          )}
          {completable && canComplete && completable.reason?.includes('No wheel-affecting') && (
            <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
              {completable.reason} (torque not required)
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-field" style={{ minWidth: 120 }}>
              <label className="label">Torque Applied (ft-lbs)</label>
              <input type="number" value={torqueForm.torque_spec_used}
                onChange={(e) => setTorqueForm((p) => ({ ...p, torque_spec_used: e.target.value }))} />
            </div>
            <div className="form-field" style={{ minWidth: 140 }}>
              <label className="label">Verified By</label>
              <select value={torqueForm.torque_verified_by}
                onChange={(e) => setTorqueForm((p) => ({ ...p, torque_verified_by: e.target.value }))}>
                <option value="">Select tech...</option>
                {techs.map((t) => <option key={t.user_id} value={t.user_id}>{t.display_name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={onVerify}
              disabled={!torqueForm.torque_spec_used || !torqueForm.torque_verified_by}>
              Record Torque
            </button>
          </div>

          {wo?.vehicle_torque_spec && (
            <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
              Vehicle spec: {wo.vehicle_torque_spec} ft-lbs
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ================================================================
// Inline Edit (for position tread/PSI)
// ================================================================

function InlineEdit({ posId, field, label, type, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  if (!editing) {
    return <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.6875rem' }} onClick={() => setEditing(true)}>{label}</button>;
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
      <input type={type} value={value} onChange={(e) => setValue(e.target.value)}
        style={{ width: 50, fontSize: '0.75rem', padding: '0.15rem 0.3rem' }} autoFocus />
      <button className="btn btn-primary btn-sm" style={{ fontSize: '0.625rem', padding: '0.15rem 0.3rem' }}
        onClick={() => { onSave(posId, field, value); setEditing(false); }}>OK</button>
    </span>
  );
}


// ---- Shared ----

function StatusBadge({ status, style: extraStyle }) {
  const colors = { intake: '#4A7CCF', in_progress: '#D4700A', quality_check: '#7B61FF', complete: '#2B7A3A', cancelled: '#6B6560' };
  const bg = { intake: 'rgba(74,124,207,0.1)', in_progress: 'rgba(212,112,10,0.1)', quality_check: 'rgba(123,97,255,0.1)', complete: 'rgba(43,122,58,0.1)', cancelled: 'rgba(107,101,96,0.1)' };
  return <span className="badge" style={{ color: colors[status] || '#6B6560', background: bg[status] || 'var(--lgray)', ...extraStyle }}>{(status || '').replace(/_/g, ' ')}</span>;
}

function SectionTitle({ children }) {
  return <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--navy)', marginBottom: '0.75rem' }}>{children}</h2>;
}

function Field({ label, value, onChange, type = 'text', ...props }) {
  return <div className="form-field"><label className="label">{label}</label><input type={type} value={value || ''} onChange={onChange} {...props} /></div>;
}
