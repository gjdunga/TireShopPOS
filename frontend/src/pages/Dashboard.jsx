// ================================================================
// Dashboard (P2c)
// Live KPIs: open work orders, today's appointments, re-torque due,
// cash drawer status, deposit alerts, system health.
//
// Each widget fetches independently and handles 403 gracefully
// (user may lack permission for some panels).
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';
import './Dashboard.css';

export default function Dashboard() {
  const { user, can, canAny } = useAuth();

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.25rem' }}>
        Welcome, {user?.display_name || user?.username}
      </h1>

      <div className="dash-grid">
        <HealthCard />
        {canAny('WORK_ORDER_CREATE', 'WORK_ORDER_ASSIGN') && <WorkOrdersCard />}
        {can('APPOINTMENT_MANAGE') && <AppointmentsCard />}
        {can('WORK_ORDER_CREATE') && <RetorqueCard />}
        {can('INVENTORY_VIEW') && <InventoryCard />}
        {can('REPORT_VIEW') && <LookupStatsCard />}
      </div>
    </div>
  );
}


// ---- Shared hook: fetch + loading + error ----

function useApiData(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(path)
      .then(setData)
      .catch((err) => {
        if (err.status === 403) {
          setData(null);
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload };
}


// ---- KPI Widgets ----

function HealthCard() {
  const { data, loading, error } = useApiData('/ops/health');

  return (
    <DashCard title="System" span={1}>
      {loading && <Spinner />}
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="dash-stats">
          <Stat label="Status" value={data.status} ok={data.status === 'ok'} />
          <Stat label="Database" value={data.database?.connected ? 'Connected' : 'Down'} ok={data.database?.connected} />
          <Stat label="Tables" value={data.database?.table_count} />
          {data.ops?.disk && (
            <Stat label="Disk" value={`${data.ops.disk.used_pct}%`} ok={!data.ops.disk.warning} />
          )}
        </div>
      )}
    </DashCard>
  );
}

function WorkOrdersCard() {
  const { data, loading, error } = useApiData('/work-orders/open');
  const count = data?.work_orders?.length ?? 0;

  return (
    <DashCard title="Open Work Orders" count={count} link="/work-orders" span={2}>
      {loading && <Spinner />}
      {error && <ErrMsg msg={error} />}
      {data?.work_orders?.length > 0 && (
        <table className="dash-table">
          <thead>
            <tr><th>WO #</th><th>Vehicle</th><th>Status</th><th>Tech</th></tr>
          </thead>
          <tbody>
            {data.work_orders.slice(0, 8).map((wo) => (
              <tr key={wo.work_order_id}>
                <td className="mono">{wo.wo_number}</td>
                <td>{wo.vehicle_year ? `${wo.vehicle_year} ${wo.vehicle_make} ${wo.vehicle_model}` : 'N/A'}</td>
                <td><StatusBadge status={wo.status} /></td>
                <td>{wo.assigned_tech_name || 'Unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data?.work_orders?.length === 0 && <p className="text-muted" style={{ fontSize: '0.875rem' }}>No open work orders.</p>}
    </DashCard>
  );
}

function AppointmentsCard() {
  const { data, loading, error } = useApiData('/appointments/today');
  const count = data?.appointments?.length ?? 0;

  return (
    <DashCard title="Today's Appointments" count={count} link="/appointments" span={2}>
      {loading && <Spinner />}
      {error && <ErrMsg msg={error} />}
      {data?.appointments?.length > 0 && (
        <table className="dash-table">
          <thead>
            <tr><th>Time</th><th>Customer</th><th>Service</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.appointments.slice(0, 6).map((a) => (
              <tr key={a.appointment_id}>
                <td className="mono">{a.appointment_time?.slice(0, 5) || 'TBD'}</td>
                <td>{a.customer_first ? `${a.customer_first} ${a.customer_last}` : 'Walk-in'}</td>
                <td>{a.service_requested || 'General'}</td>
                <td><StatusBadge status={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data?.appointments?.length === 0 && <p className="text-muted" style={{ fontSize: '0.875rem' }}>No appointments today.</p>}
    </DashCard>
  );
}

function RetorqueCard() {
  const { data, loading, error } = useApiData('/retorque/due');
  const count = data?.due_list?.length ?? 0;

  return (
    <DashCard title="Re-torque Due" count={count} accent={count > 0 ? 'var(--orange)' : null}>
      {loading && <Spinner />}
      {error && <ErrMsg msg={error} />}
      {data?.due_list?.length > 0 && (
        <ul className="dash-list">
          {data.due_list.slice(0, 5).map((item, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="mono">{item.wo_number || `WO #${item.work_order_id}`}</span>
                {item.retorque_due_date && <span className="text-muted"> by {item.retorque_due_date}</span>}
              </div>
              <RetorqueCompleteBtn id={item.work_order_id} onDone={() => window.location.reload()} />
            </li>
          ))}
        </ul>
      )}
      {count === 0 && !loading && <p className="text-muted" style={{ fontSize: '0.875rem' }}>None due.</p>}
    </DashCard>
  );
}

function RetorqueCompleteBtn({ id, onDone }) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try { await api.post(`/retorque/${id}/complete`); onDone(); }
    catch (e) { alert('Error: ' + e.message); }
    finally { setBusy(false); }
  };
  return (
    <button className="btn btn-sm" onClick={handle} disabled={busy}
      style={{ fontSize: '0.625rem', background: 'var(--green)', color: 'white', padding: '0.15rem 0.4rem' }}>
      {busy ? '...' : 'Done'}
    </button>
  );
}

function InventoryCard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tires/search/advanced?status=available&limit=1')
      .then((data) => { setStats({ available: data.results?.total ?? 0 }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashCard title="Inventory" link="/tires">
      {loading && <Spinner />}
      {stats && (
        <div className="dash-stats">
          <Stat label="Available Tires" value={stats.available} />
        </div>
      )}
    </DashCard>
  );
}


function LookupStatsCard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/lookup-dashboard')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashCard title="Plate Lookups" link="/reports">
      {loading && <Spinner />}
      {stats && (
        <div className="dash-stats">
          <Stat label="API Calls (this month)" value={stats.total_api_calls ?? 0} />
          <Stat label="Cost" value={'$' + Number(stats.total_cost_usd ?? 0).toFixed(2)} />
          <Stat label="Cache Active" value={stats.cache_active ?? 0} ok />
          <Stat label="Avg Response" value={(stats.avg_response_ms ?? 0) + 'ms'} />
        </div>
      )}
    </DashCard>
  );
}


// ---- Shared UI Components ----

function DashCard({ title, count, link, accent, span, children }) {
  const style = {
    gridColumn: span ? `span ${span}` : undefined,
    borderLeft: accent ? `4px solid ${accent}` : undefined,
  };

  return (
    <div className="card dash-card" style={style}>
      <div className="dash-card-header">
        <div>
          <span className="dash-card-title">{title}</span>
          {count !== undefined && (
            <span className="dash-card-count" style={{ color: accent || 'var(--navy)' }}>{count}</span>
          )}
        </div>
        {link && <Link to={link} className="btn btn-ghost btn-sm">View All</Link>}
      </div>
      <div className="dash-card-body">{children}</div>
    </div>
  );
}

function Stat({ label, value, ok }) {
  const color = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : 'var(--navy)';
  return (
    <div className="dash-stat">
      <div className="label">{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 600, color }}>
        {value ?? '\u2014'}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    open: 'var(--blue)', scheduled: 'var(--blue)', in_progress: 'var(--orange)',
    completed: 'var(--green)', cancelled: 'var(--gray)', confirmed: 'var(--green)',
  };
  const bg = {
    open: 'rgba(74,124,207,0.1)', scheduled: 'rgba(74,124,207,0.1)', in_progress: 'rgba(212,112,10,0.1)',
    completed: 'rgba(43,122,58,0.1)', cancelled: 'rgba(107,101,96,0.1)', confirmed: 'rgba(43,122,58,0.1)',
  };

  return (
    <span className="badge" style={{ color: colors[status] || 'var(--gray)', background: bg[status] || 'var(--lgray)' }}>
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
      <span className="spinner" />
      <span className="text-muted" style={{ fontSize: '0.8125rem' }}>Loading...</span>
    </div>
  );
}

function ErrMsg({ msg }) {
  return <div className="alert alert-error" style={{ fontSize: '0.8125rem' }}>{msg}</div>;
}
