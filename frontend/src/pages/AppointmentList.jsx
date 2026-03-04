// ================================================================
// AppointmentList (P2f)
// Date-based appointment list with create/edit/cancel.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';
import './SupportOps.css';

const STATUS_COLORS = {
  scheduled: 'badge-blue',
  confirmed: 'badge-green',
  checked_in: 'badge-orange',
  no_show: 'badge-gray',
  cancelled: 'badge-gray',
};

function toDateStr(d) { return d.toISOString().slice(0, 10); }

export default function AppointmentList() {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/appointments?start=${date}&end=${date}`)
      .then((data) => setAppts(data.appointments || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const shiftDate = (days) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(toDateStr(d));
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this appointment?')) return;
    try {
      await api.post(`/appointments/${id}/cancel`);
      setMsg('Appointment cancelled.');
      load();
    } catch (err) { setError(err.message); }
  };

  const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem' }}>Appointments</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Appointment</button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      {/* Date nav */}
      <div className="appt-date-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => shiftDate(-1)}>&larr;</button>
        <h2>{dayLabel}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => shiftDate(1)}>&rarr;</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setDate(toDateStr(new Date()))}>Today</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ marginLeft: 'auto', fontSize: '0.875rem' }} />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}><span className="spinner" /></div>
        ) : appts.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>No appointments for this date.</p>
        ) : (
          <div>
            {appts.map((a) => (
              <div key={a.appointment_id} className="appt-slot">
                <div className="appt-time">{a.appointment_time?.slice(0, 5)}</div>
                <div className="appt-info">
                  <div className="appt-customer">
                    {a.customer_first ? `${a.customer_first} ${a.customer_last}` : a.customer_name || 'Walk-in'}
                  </div>
                  <div className="appt-service">
                    {a.service_requested || 'No service specified'}
                    {a.tire_count ? ` (${a.tire_count} tires)` : ''}
                    {a.est_duration_min ? ` / ~${a.est_duration_min} min` : ''}
                  </div>
                  {a.customer_phone && <div className="appt-service mono">{a.customer_phone}</div>}
                  {a.notes && <div className="appt-service" style={{ fontStyle: 'italic' }}>{a.notes}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                  <span className={`badge ${STATUS_COLORS[a.status] || ''}`}>{(a.status || '').replace(/_/g, ' ')}</span>
                  {a.status !== 'cancelled' && a.status !== 'no_show' && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.75rem', color: 'var(--red)' }}
                      onClick={() => handleCancel(a.appointment_id)}>Cancel</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateAppointmentModal
          defaultDate={date}
          onCreated={() => { setMsg('Appointment created.'); setShowCreate(false); load(); }}
          onClose={() => setShowCreate(false)}
          onError={setError}
        />
      )}
    </div>
  );
}

function CreateAppointmentModal({ defaultDate, onCreated, onClose, onError }) {
  const [form, setForm] = useState({
    appointment_date: defaultDate,
    appointment_time: '09:00',
    est_duration_min: '60',
    customer_name: '',
    customer_phone: '',
    service_requested: '',
    tire_count: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/appointments', {
        ...form,
        est_duration_min: Number(form.est_duration_min) || 60,
        tire_count: form.tire_count ? Number(form.tire_count) : null,
      });
      onCreated();
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">New Appointment</div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-field">
              <label className="label">Date</label>
              <input type="date" value={form.appointment_date} onChange={handleChange('appointment_date')} />
            </div>
            <div className="form-field">
              <label className="label">Time</label>
              <input type="time" value={form.appointment_time} onChange={handleChange('appointment_time')} />
            </div>
            <div className="form-field">
              <label className="label">Duration (min)</label>
              <input type="number" min="15" step="15" value={form.est_duration_min}
                onChange={handleChange('est_duration_min')} />
            </div>
            <div className="form-field">
              <label className="label">Tire Count</label>
              <input type="number" min="1" max="10" value={form.tire_count}
                onChange={handleChange('tire_count')} placeholder="e.g. 4" />
            </div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Customer Name</label>
              <input type="text" value={form.customer_name} onChange={handleChange('customer_name')} />
            </div>
            <div className="form-field">
              <label className="label">Phone</label>
              <input type="tel" value={form.customer_phone} onChange={handleChange('customer_phone')} />
            </div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Service Requested</label>
              <input type="text" value={form.service_requested} onChange={handleChange('service_requested')}
                placeholder="e.g. Mount + balance 4 tires" />
            </div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Notes</label>
              <textarea rows={2} value={form.notes} onChange={handleChange('notes')}
                style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
                  borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.9375rem' }} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.appointment_date || !form.appointment_time}>
            {saving ? <span className="spinner" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
