// ================================================================
// ProtectedRoute
// Route wrapper that enforces authentication and optional permissions.
//
// Usage in route definitions:
//   <Route element={<ProtectedRoute />}>           (auth only)
//   <Route element={<ProtectedRoute need="INVENTORY_VIEW" />}>
//   <Route element={<ProtectedRoute needAny={["PO_CREATE", "PO_RECEIVE"]} />}>
//   <Route element={<ProtectedRoute needAll={["REPORT_VIEW", "AUDIT_VIEW"]} />}>
//
// Behavior:
//   Not authenticated  -> redirect to /login
//   Force password change -> redirect to /change-password
//   Missing permission -> render 403 message
//   Authorized -> render <Outlet />
//
// DunganSoft Technologies, March 2026
// ================================================================

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function ProtectedRoute({ need, needAny, needAll }) {
  const { user, loading, forcePasswordChange, can, canAny, canAll } = useAuth();
  const location = useLocation();

  // Still checking session on first load
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Must change password first (except on the change-password page itself)
  if (forcePasswordChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  // Permission checks
  if (need && !can(need)) {
    return <Forbidden required={need} />;
  }

  if (needAny && !canAny(...needAny)) {
    return <Forbidden required={needAny.join(' or ')} />;
  }

  if (needAll && !canAll(...needAll)) {
    return <Forbidden required={needAll.join(' and ')} />;
  }

  return <Outlet />;
}

function Forbidden({ required }) {
  return (
    <div style={{ padding: '2rem' }}>
      <div className="card" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--red)', marginBottom: '0.5rem' }}>Access Denied</h2>
        <p style={{ color: 'var(--gray)' }}>
          You do not have the required permission to view this page.
        </p>
        <p className="mono" style={{ marginTop: '0.5rem' }}>
          Required: {required}
        </p>
      </div>
    </div>
  );
}
