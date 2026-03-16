// ================================================================
// CustomerComm (P4e)
// Notification log + send messages (SMS/email/internal).
// SMS via Twilio and email via SMTP are configured externally;
// this UI manages the queue and templates.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

const TEMPLATES = [
  { key: 'appointment_reminder', label: 'Appointment Reminder',
    subject: 'Appointment Reminder',
    body: 'Hi {name}, this is a reminder of your appointment on {date} at {time}. Please call us at {phone} if you need to reschedule.' },
  { key: 'retorque_reminder', label: 'Re-torque Reminder',
    subject: 'Re-torque Check Due',
    body: 'Hi {name}, your re-torque check is due. Please bring your vehicle in at your earliest convenience for a free re-torque verification. Call {phone} to schedule.' },
  { key: 'wo_status', label: 'Work Order Update',
    subject: 'Work Order Status Update',
    body: 'Hi {name}, your vehicle service (WO #{wo_number}) has been updated to: {status}. Contact us at {phone} with any questions.' },
  { key: 'custom', label: 'Custom Message', subject: '', body: '' },
];

export default function CustomerComm() {
  const [tab, setTab] = useState('send');
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Customer Communications</h1>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', borderBottom: '1px solid var(--lgray)', paddingBottom: '0.75rem' }}>
        <button className={`btn btn-sm ${tab === 'send' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('send')}>Send Message</button>
        <button className={`btn btn-sm ${tab === 'pending' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('pending')}>Pending Queue</button>
        <button className={`btn btn-sm ${tab === 'history' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('history')}>Customer History</button>
      </div>
      {tab === 'send' && <SendTab />}
      {tab === 'pending' && <PendingTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

function SendTab() {
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [channel, setChannel] = useState('internal');
  const [template, setTemplate] = useState('custom');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const handleSearchCustomer = async (q) => {
    setCustomerSearch(q);
    if (q.length < 2) { setCustomers([]); return; }
    try {
      const data = await api.get(`/customers/search?q=${encodeURIComponent(q)}&limit=10`);
      setCustomers(data.customers || []);
    } catch {}
  };

  const handleSelectCustomer = (c) => {
    setCustomerId(c.customer_id);
    setCustomerSearch(`${c.first_name} ${c.last_name}`);
    setCustomers([]);
  };

  const handleTemplateChange = (key) => {
    setTemplate(key);
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
  };

  const handleSend = async () => {
    if (!customerId || !body.trim()) { setError('Select a customer and enter a message.'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post('/notifications', {
        customer_id: Number(customerId), channel, notification_type: template,
        subject, body,
      });
      setMsg('Message logged. ' + (channel === 'internal' ? 'Logged internally.' :
        `Queued for ${channel} delivery.`));
      setBody(''); setSubject(''); setCustomerId(''); setCustomerSearch('');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const ta = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--mgray)',
    borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: '0.9375rem' };

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      <div className="card">
        <div className="form-grid">
          <div className="form-field" style={{ position: 'relative' }}>
            <label className="label">Customer *</label>
            <input type="text" value={customerSearch} onChange={(e) => handleSearchCustomer(e.target.value)}
              placeholder="Search by name or phone..." />
            {customers.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                border: '1px solid var(--mgray)', borderRadius: 'var(--radius-sm)', zIndex: 50,
                maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
                {customers.map((c) => (
                  <div key={c.customer_id} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}
                    onClick={() => handleSelectCustomer(c)}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--lgray)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                    {c.first_name} {c.last_name} <span className="text-muted mono">{c.phone_primary || c.email || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-field">
            <label className="label">Channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="internal">Internal (log only)</option>
              <option value="sms">SMS (Twilio)</option>
              <option value="email">Email (SMTP)</option>
            </select>
          </div>

          <div className="form-field">
            <label className="label">Template</label>
            <select value={template} onChange={(e) => handleTemplateChange(e.target.value)}>
              {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label className="label">Subject</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="form-field" style={{ gridColumn: '1 / -1' }}>
            <label className="label">Message *</label>
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} style={ta} />
            <small className="text-muted">
              Template variables: {'{name}'}, {'{date}'}, {'{time}'}, {'{phone}'}, {'{wo_number}'}, {'{status}'}, {'{amount}'}
            </small>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSend} disabled={saving || !customerId || !body.trim()}
          style={{ marginTop: '1rem' }}>
          {saving ? <span className="spinner" /> : channel === 'internal' ? 'Log Message' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function PendingTab() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [delivering, setDelivering] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/notifications/pending').catch(() => ({ notifications: [] })),
      api.get('/notifications/delivery-stats').catch(() => null),
    ]).then(([d, s]) => {
      setNotifications(d.notifications || []);
      setStats(s);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkSent = async (id) => {
    try { await api.post(`/notifications/${id}/sent`); load(); } catch {}
  };

  const handleMarkFailed = async (id) => {
    try { await api.post(`/notifications/${id}/failed`, { reason: 'Manual mark as failed' }); load(); } catch {}
  };

  const handleProcessQueue = async () => {
    setDelivering(true);
    setDeliveryResult(null);
    try {
      const result = await api.post('/notifications/deliver', { limit: 20 });
      setDeliveryResult(result);
      load();
    } catch (e) { setDeliveryResult({ error: e.message }); }
    finally { setDelivering(false); }
  };

  return (
    <div className="card">
      {/* Delivery controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #eee' }}>
        <div>
          <button className="btn btn-primary btn-sm" onClick={handleProcessQueue} disabled={delivering || notifications.length === 0}>
            {delivering ? <span className="spinner" /> : 'Process Queue (Send All)'}
          </button>
          {stats && (
            <span style={{ marginLeft: '1rem', fontSize: '0.8rem', color: '#666' }}>
              Today: {stats.sent_today || 0} sent, {stats.failed_today || 0} failed
              {stats.last_sent_at && ` | Last: ${stats.last_sent_at.slice(0, 16)}`}
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: notifications.length > 0 ? 'var(--orange)' : 'var(--green)' }}>
          {notifications.length} pending
        </span>
      </div>

      {deliveryResult && (
        <div className={`alert ${deliveryResult.error ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          {deliveryResult.error
            ? `Delivery error: ${deliveryResult.error}`
            : `Processed ${deliveryResult.processed}: ${deliveryResult.sent} sent, ${deliveryResult.failed} failed`
          }
          {deliveryResult.errors?.length > 0 && (
            <div style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
              {deliveryResult.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      {loading ? <span className="spinner" /> : notifications.length === 0 ? (
        <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>No pending notifications.</p>
      ) : (
        <table className="entity-table">
          <thead><tr><th>Customer</th><th>Channel</th><th>Type</th><th>Subject</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.notification_id}>
                <td>{n.first_name} {n.last_name}</td>
                <td style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600 }}>{n.channel}</td>
                <td>{n.notification_type}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.subject || n.body?.slice(0, 40)}</td>
                <td className="mono">{n.created_at?.slice(0, 16)}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleMarkSent(n.notification_id)}>Sent</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', color: 'var(--red)' }}
                      onClick={() => handleMarkFailed(n.notification_id)}>Failed</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HistoryTab() {
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setCustomers([]); return; }
    const t = setTimeout(() => {
      api.get(`/customers/search?q=${encodeURIComponent(q)}&limit=10`).then((d) => setCustomers(d.customers || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    api.get(`/notifications/customer/${selected.customer_id}`)
      .then((d) => setHistory(d.notifications || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <div className="card">
      <div style={{ marginBottom: '0.75rem' }}>
        <label className="label">Search Customer</label>
        <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setSelected(null); }} placeholder="Name, phone, or email..." />
        {customers.length > 0 && !selected && (
          <div style={{ border: '1px solid #ddd', borderRadius: '4px', maxHeight: '150px', overflow: 'auto', marginTop: '0.25rem' }}>
            {customers.map((c) => (
              <div key={c.customer_id} onClick={() => { setSelected(c); setQ(`${c.first_name} ${c.last_name}`); setCustomers([]); }}
                style={{ padding: '0.4rem 0.6rem', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '0.85rem' }}>
                {c.first_name} {c.last_name} <span className="text-muted">{c.phone_primary}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        loading ? <span className="spinner" /> : history.length === 0 ? (
          <p className="text-muted">No notification history for {selected.first_name} {selected.last_name}.</p>
        ) : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Date</th><th>Channel</th><th>Type</th><th>Subject</th><th>Status</th></tr></thead>
            <tbody>
              {history.map((n) => (
                <tr key={n.notification_id}>
                  <td className="mono" style={{ fontSize: '0.75rem' }}>{(n.created_at || '').slice(0, 16)}</td>
                  <td style={{ textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 600 }}>{n.channel}</td>
                  <td>{n.notification_type}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.subject || ''}</td>
                  <td><span style={{ fontSize: '0.7rem', fontWeight: 600,
                    color: n.status === 'sent' ? 'var(--green)' : n.status === 'failed' ? 'var(--red)' : '#888'
                  }}>{n.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
