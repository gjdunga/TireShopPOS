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
        {canAny('CASH_DRAWER_OPEN', 'CASH_DRAWER_CLOSE') && <CashDrawerCard />}
        {can('DEPOSIT_ACCEPT') && <DepositsCard />}
        {can('DEPOSIT_FORFEIT') && <ExpiredDepositsCard />}
        {can('INVENTORY_VIEW') && <InventoryCard />}
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
  const { data, loading, error } = useApiData('/health');

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
                <td className="mono">{wo.work_order_number}</td>
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
                <td>{a.service_type || 'General'}</td>
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
            <li key={i}>
              <span className="mono">{item.work_order_number || `WO #${item.work_order_id}`}</span>
              {item.due_date && <span className="text-muted"> by {item.due_date}</span>}
            </li>
          ))}
        </ul>
      )}
      {count === 0 && !loading && <p className="text-muted" style={{ fontSize: '0.875rem' }}>None due.</p>}
    </DashCard>
  );
}

function CashDrawerCard() {
  const { data, loading, error } = useApiData('/cash-drawer/today');

  return (
    <DashCard title="Cash Drawer" link="/cash-drawer">
      {loading && <Spinner />}
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="dash-stats">
          <Stat label="Status" value={data.open ? 'OPEN' : 'CLOSED'} ok={data.open} />
          {data.drawer && (
            <Stat label="Opening" value={'$' + Number(data.drawer.opening_balance || 0).toFixed(2)} />
          )}
        </div>
      )}
    </DashCard>
  );
}

function DepositsCard() {
  const { data, loading, error } = useApiData('/deposits/expiring?within_days=7');
  const count = data?.deposits?.length ?? 0;

  return (
    <DashCard title="Expiring Deposits (7d)" count={count} accent={count > 0 ? 'var(--orange)' : null}>
      {loading && <Spinner />}
      {error && <ErrMsg msg={error} />}
      {data?.deposits?.length > 0 && (
        <ul className="dash-list">
          {data.deposits.slice(0, 5).map((d, i) => (
            <li key={i}>
              <span>${Number(d.amount || 0).toFixed(2)}</span>
              <span className="text-muted"> expires {d.expires_at?.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
      {count === 0 && !loading && <p className="text-muted" style={{ fontSize: '0.875rem' }}>None expiring.</p>}
    </DashCard>
  );
}

function ExpiredDepositsCard() {
  const { data, loading, error } = useApiData('/deposits/expired');
  const count = data?.deposits?.length ?? 0;

  return (
    <DashCard title="Expired Deposits" count={count} accent={count > 0 ? 'var(--red)' : null}>
      {loading && <Spinner />}
      {error && <ErrMsg msg={error} />}
      {count > 0 && (
        <ul className="dash-list">
          {data.deposits.slice(0, 5).map((d, i) => (
            <li key={i}>
              <span>${Number(d.amount || 0).toFixed(2)}</span>
              <span className="text-muted"> expired {d.expires_at?.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
      {count === 0 && !loading && <p className="text-muted" style={{ fontSize: '0.875rem' }}>None expired.</p>}
    </DashCard>
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
