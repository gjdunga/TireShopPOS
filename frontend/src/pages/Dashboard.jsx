// ================================================================
// Dashboard (Placeholder)
// P2a: proves the scaffold works end to end.
// Fetches /api/health and displays system status.
// Will be replaced with live KPIs in P2c.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get('/health')
      .then((data) => { if (!cancelled) setHealth(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.25rem' }}>
        Welcome, {user?.display_name || user?.username}
      </h1>

      {loading && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="spinner" />
          <span>Loading system status...</span>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {health && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
          <StatusCard label="System" value={health.status} ok={health.status === 'ok'} />
          <StatusCard label="Database" value={health.database?.connected ? 'Connected' : 'Down'} ok={health.database?.connected} />
          <StatusCard label="Tables" value={health.database?.table_count} />
          <StatusCard label="PHP" value={health.php} />
          <StatusCard label="App Version" value={health.version || 'dev'} />
          <StatusCard label="Debug Mode" value={health.debug ? 'ON' : 'OFF'} ok={!health.debug} />

          {health.ops?.disk && (
            <>
              <StatusCard label="Disk Used" value={`${health.ops.disk.used_pct}%`} ok={!health.ops.disk.warning} />
              <StatusCard label="Disk Free" value={`${health.ops.disk.free_gb} GB`} />
            </>
          )}

          {health.ops?.sessions && (
            <StatusCard label="Active Sessions" value={health.ops.sessions.active_sessions} />
          )}

          {health.ops?.backups?.db_backup && (
            <StatusCard
              label="Last Backup"
              value={health.ops.backups.db_backup.stale ? 'STALE' : 'OK'}
              ok={!health.ops.backups.db_backup.stale}
            />
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem', color: 'var(--gray)', fontSize: '0.875rem' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--navy)' }}>
          P2a Scaffold Verification
        </p>
        <p>
          This page confirms the frontend scaffold is operational: Vite build, React Router, AuthContext (login, session, permissions), API client (Bearer token, JSON envelope unwrap), layout shell (sidebar, topbar), and the force-password-change gate all work end to end.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          The dashboard will be wired to live KPI queries in P2c.
        </p>
      </div>
    </div>
  );
}

function StatusCard({ label, value, ok }) {
  const color = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : 'var(--navy)';
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 600, color }}>
        {value ?? '\u2014'}
      </div>
    </div>
  );
}
