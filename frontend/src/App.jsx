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
// DunganSoft Technologies, March 2026
// ================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import AppShell from './layout/AppShell.jsx';
import Login from './pages/Login.jsx';
import PasswordChange from './pages/PasswordChange.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TireSearch from './pages/TireSearch.jsx';
import TireDetail from './pages/TireDetail.jsx';
import TireCreate from './pages/TireCreate.jsx';
import CustomerSearch from './pages/CustomerSearch.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import VehicleSearch from './pages/VehicleSearch.jsx';
import VehicleDetail from './pages/VehicleDetail.jsx';
import WorkOrderList from './pages/WorkOrderList.jsx';
import WorkOrderDetail from './pages/WorkOrderDetail.jsx';
import AppointmentList from './pages/AppointmentList.jsx';
import PurchaseOrderList from './pages/PurchaseOrderList.jsx';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail.jsx';
import QuoteTool from './pages/QuoteTool.jsx';
import SettingsAdmin from './pages/SettingsAdmin.jsx';
import WarrantyManager from './pages/WarrantyManager.jsx';
import { WheelSearch, WheelDetail } from './pages/WheelPages.jsx';
import FitmentSearch from './pages/FitmentSearch.jsx';
import RecallChecker from './pages/RecallChecker.jsx';
import BarcodeScanner from './pages/BarcodeScanner.jsx';
import CustomerComm from './pages/CustomerComm.jsx';
import TireStorage from './pages/TireStorage.jsx';
import DisposalLog from './pages/DisposalLog.jsx';
import { StorefrontShell, StorefrontHome, StorefrontInventory, StorefrontTireDetail,
         StorefrontFitment, StorefrontAppointments, StorefrontWarranty } from './pages/Storefront.jsx';
import { lazy, Suspense } from 'react';
const MarketplaceHub = lazy(() => import('./pages/MarketplaceHub.jsx'));
const ReportsDashboard = lazy(() => import('./pages/ReportsDashboard.jsx'));
const UserManagement = lazy(() => import('./pages/UserManagement.jsx'));
const AuditLog = lazy(() => import('./pages/AuditLog.jsx'));
const LazyPrintWorkOrder = lazy(() => import('./pages/PrintTemplates.jsx').then(m => ({ default: m.PrintWorkOrder })));
const LazyPrintEstimate = lazy(() => import('./pages/PrintTemplates.jsx').then(m => ({ default: m.PrintEstimate })));
const SuspenseFallback = <div style={{padding:'2rem',textAlign:'center'}}>Loading...</div>;
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="/print/work-order/:id" element={<Suspense fallback={SuspenseFallback}><LazyPrintWorkOrder /></Suspense>} />
            <Route path="/print/estimate" element={<Suspense fallback={SuspenseFallback}><LazyPrintEstimate /></Suspense>} />

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
              <Route path="reports" element={<Suspense fallback={SuspenseFallback}><ReportsDashboard /></Suspense>} />
              <Route path="settings" element={<SettingsAdmin />} />
              <Route path="warranties" element={<WarrantyManager />} />
              <Route path="communications" element={<CustomerComm />} />
              <Route path="storage" element={<TireStorage />} />
              <Route path="disposals" element={<DisposalLog />} />
              <Route path="marketplace" element={<Suspense fallback={SuspenseFallback}><MarketplaceHub /></Suspense>} />
              <Route path="audit" element={<Suspense fallback={SuspenseFallback}><AuditLog /></Suspense>} />
              <Route path="users" element={<Suspense fallback={SuspenseFallback}><UserManagement /></Suspense>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
