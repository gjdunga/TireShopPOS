// ================================================================
// App
// Top-level router configuration.
//
// Route structure:
//   /login             Public, no layout shell
//   /change-password   Public (post-login), no layout shell
//   /                  Protected, AppShell layout
//     (index)          Dashboard
//     /tires, /wheels  Inventory
//     /customers, /vehicles  CRM
//     /work-orders     Work order lifecycle
//     /appointments, /purchase-orders, /quotes  Operations
//     /fitment, /recalls, /scanner  Tools
//     /reports, /settings, /warranties  Admin
//     /communications, /marketplace  Engagement
//     /print/*         Print templates
//     /shop/*          Public storefront
//     *                404
//
// Code-splitting: 12 eager (daily workflow), 22 lazy (on first nav).
// Main chunk target: <300 KB minified.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import AppShell from './layout/AppShell.jsx';
import { lazy, Suspense } from 'react';

// ---- Eager: core daily workflow (12 pages) ----
import Login from './pages/Login.jsx';
import PasswordChange from './pages/PasswordChange.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TireSearch from './pages/TireSearch.jsx';
import TireDetail from './pages/TireDetail.jsx';
import CustomerSearch from './pages/CustomerSearch.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import VehicleSearch from './pages/VehicleSearch.jsx';
import VehicleDetail from './pages/VehicleDetail.jsx';
import WorkOrderList from './pages/WorkOrderList.jsx';
import WorkOrderDetail from './pages/WorkOrderDetail.jsx';
import NotFound from './pages/NotFound.jsx';

// ---- Lazy: loaded on first navigation ----
const TireCreate = lazy(() => import('./pages/TireCreate.jsx'));
const AppointmentList = lazy(() => import('./pages/AppointmentList.jsx'));
const PurchaseOrderList = lazy(() => import('./pages/PurchaseOrderList.jsx'));
const PurchaseOrderDetail = lazy(() => import('./pages/PurchaseOrderDetail.jsx'));
const QuoteTool = lazy(() => import('./pages/QuoteTool.jsx'));
const SettingsAdmin = lazy(() => import('./pages/SettingsAdmin.jsx'));
const WarrantyManager = lazy(() => import('./pages/WarrantyManager.jsx'));
const WheelSearch = lazy(() => import('./pages/WheelPages.jsx').then(m => ({ default: m.WheelSearch })));
const WheelDetail = lazy(() => import('./pages/WheelPages.jsx').then(m => ({ default: m.WheelDetail })));
const FitmentSearch = lazy(() => import('./pages/FitmentSearch.jsx'));
const RecallChecker = lazy(() => import('./pages/RecallChecker.jsx'));
const BarcodeScanner = lazy(() => import('./pages/BarcodeScanner.jsx'));
const CustomerComm = lazy(() => import('./pages/CustomerComm.jsx'));
const TireStorage = lazy(() => import('./pages/TireStorage.jsx'));
const DisposalLog = lazy(() => import('./pages/DisposalLog.jsx'));
const ReportsDashboard = lazy(() => import('./pages/ReportsDashboard.jsx'));
const MarketplaceHub = lazy(() => import('./pages/MarketplaceHub.jsx'));
const UserManagement = lazy(() => import('./pages/UserManagement.jsx'));
const AuditLog = lazy(() => import('./pages/AuditLog.jsx'));
const PrintWorkOrder = lazy(() => import('./pages/PrintTemplates.jsx').then(m => ({ default: m.PrintWorkOrder })));
const PrintEstimate = lazy(() => import('./pages/PrintTemplates.jsx').then(m => ({ default: m.PrintEstimate })));

// Storefront (public, separate chunk)
const StorefrontShell = lazy(() => import('./pages/Storefront.jsx').then(m => ({ default: m.StorefrontShell })));
const StorefrontHome = lazy(() => import('./pages/Storefront.jsx').then(m => ({ default: m.StorefrontHome })));
const StorefrontInventory = lazy(() => import('./pages/Storefront.jsx').then(m => ({ default: m.StorefrontInventory })));
const StorefrontTireDetail = lazy(() => import('./pages/Storefront.jsx').then(m => ({ default: m.StorefrontTireDetail })));
const StorefrontFitment = lazy(() => import('./pages/Storefront.jsx').then(m => ({ default: m.StorefrontFitment })));
const StorefrontAppointments = lazy(() => import('./pages/Storefront.jsx').then(m => ({ default: m.StorefrontAppointments })));
const StorefrontWarranty = lazy(() => import('./pages/Storefront.jsx').then(m => ({ default: m.StorefrontWarranty })));

const L = <div style={{padding:'2rem',textAlign:'center'}}>Loading...</div>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={L}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<PasswordChange />} />

          {/* Public storefront */}
          <Route path="/shop" element={<StorefrontShell><StorefrontHome /></StorefrontShell>} />
          <Route path="/shop/inventory" element={<StorefrontShell><StorefrontInventory /></StorefrontShell>} />
          <Route path="/shop/inventory/:id" element={<StorefrontShell><StorefrontTireDetail /></StorefrontShell>} />
          <Route path="/shop/fitment" element={<StorefrontShell><StorefrontFitment /></StorefrontShell>} />
          <Route path="/shop/appointments" element={<StorefrontShell><StorefrontAppointments /></StorefrontShell>} />
          <Route path="/shop/warranty" element={<StorefrontShell><StorefrontWarranty /></StorefrontShell>} />

          {/* Protected */}
          <Route element={<ProtectedRoute />}>
            <Route path="/print/work-order/:id" element={<PrintWorkOrder />} />
            <Route path="/print/estimate" element={<PrintEstimate />} />

            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="tires" element={<TireSearch />} />
              <Route path="tires/new" element={<TireCreate />} />
              <Route path="tires/:id" element={<TireDetail />} />
              <Route path="wheels" element={<WheelSearch />} />
              <Route path="wheels/:id" element={<WheelDetail />} />
              <Route path="customers" element={<CustomerSearch />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="vehicles" element={<VehicleSearch />} />
              <Route path="vehicles/:id" element={<VehicleDetail />} />
              <Route path="work-orders" element={<WorkOrderList />} />
              <Route path="work-orders/:id" element={<WorkOrderDetail />} />
              <Route path="appointments" element={<AppointmentList />} />
              <Route path="purchase-orders" element={<PurchaseOrderList />} />
              <Route path="purchase-orders/:id" element={<PurchaseOrderDetail />} />
              <Route path="quotes" element={<QuoteTool />} />
              <Route path="fitment" element={<FitmentSearch />} />
              <Route path="recalls" element={<RecallChecker />} />
              <Route path="scanner" element={<BarcodeScanner />} />
              <Route path="reports" element={<ReportsDashboard />} />
              <Route path="settings" element={<SettingsAdmin />} />
              <Route path="warranties" element={<WarrantyManager />} />
              <Route path="communications" element={<CustomerComm />} />
              <Route path="storage" element={<TireStorage />} />
              <Route path="disposals" element={<DisposalLog />} />
              <Route path="marketplace" element={<MarketplaceHub />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
