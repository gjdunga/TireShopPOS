// ================================================================
// App
// Top-level router configuration.
//
// Route structure:
//   /login             Public, no layout shell
//   /change-password   Public (post-login), no layout shell
//   /                  Protected, AppShell layout
//     (index)          Dashboard
//     /tires           (P2c placeholder)
//     /customers       (P2d placeholder)
//     /vehicles        (P2d placeholder)
//     /work-orders     (P2e placeholder)
//     /invoices        (P2e placeholder)
//     /cash-drawer     (P2f placeholder)
//     /appointments    (P2f placeholder)
//     /purchase-orders (P2f placeholder)
//     /reports         (P2g placeholder)
//     /audit           (P2g placeholder)
//     /users           (admin placeholder)
//     *                404
//
// DunganSoft Technologies, March 2026
// ================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import AppShell from './layout/AppShell.jsx';
import Login from './pages/Login.jsx';
import PasswordChange from './pages/PasswordChange.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NotFound from './pages/NotFound.jsx';

// Placeholder component for pages not yet built.
// Shows which P2 chunk will deliver it.
function Placeholder({ title, chunk }) {
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{title}</h1>
      <div className="card" style={{ color: 'var(--gray)' }}>
        <p>This screen will be built in <strong>{chunk}</strong>.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes (no layout shell) */}
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<PasswordChange />} />

          {/* Protected routes (require auth, wrapped in AppShell) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />

              {/* Operations (P2c, P2d, P2e) */}
              <Route path="tires"       element={<Placeholder title="Tire Search & Inventory" chunk="P2c" />} />
              <Route path="customers"   element={<Placeholder title="Customers" chunk="P2d" />} />
              <Route path="vehicles"    element={<Placeholder title="Vehicles" chunk="P2d" />} />
              <Route path="work-orders" element={<Placeholder title="Work Orders" chunk="P2e" />} />
              <Route path="invoices"    element={<Placeholder title="Invoices & Checkout" chunk="P2e" />} />

              {/* Shop operations (P2f) */}
              <Route path="cash-drawer"     element={<Placeholder title="Cash Drawer" chunk="P2f" />} />
              <Route path="appointments"    element={<Placeholder title="Appointments" chunk="P2f" />} />
              <Route path="purchase-orders" element={<Placeholder title="Purchase Orders" chunk="P2f" />} />

              {/* Admin (P2g) */}
              <Route path="reports" element={<Placeholder title="Reports" chunk="P2g" />} />
              <Route path="audit"   element={<Placeholder title="Audit Log" chunk="P2g" />} />
              <Route path="users"   element={<Placeholder title="User Management" chunk="P2g" />} />

              {/* 404 within the shell */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
