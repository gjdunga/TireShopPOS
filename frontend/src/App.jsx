// ================================================================
// App
// Top-level router configuration.
//
// Route structure:
//   /login             Public, no layout shell
//   /change-password   Public (post-login), no layout shell
//   /                  Protected, AppShell layout
//     (index)          Dashboard
//     /tires           Tire search & inventory (P2c)
//     /tires/new       Add new tire (P2c)
//     /tires/:id       Tire detail/edit (P2c)
//     /customers       Customer search (P2d)
//     /customers/:id   Customer detail/create/edit (P2d)
//     /vehicles        Vehicle search (P2d)
//     /vehicles/:id    Vehicle detail/create/edit + lookup (P2d)
//     /work-orders     Work order list (P2e)
//     /work-orders/:id Work order detail/create (P2e)
//     /invoices        Invoice list (P2e)
//     /invoices/:id    Invoice detail/checkout (P2e)
//     /cash-drawer          Cash drawer (P2f)
//     /appointments         Appointment scheduler (P2f)
//     /purchase-orders      PO list (P2f)
//     /purchase-orders/:id  PO detail/create/receive (P2f)
//     /refunds              Refund management (P2f)
//     /quotes               OTD quote tool (P2f)
//     /reports              Reports dashboard with charts (P2g)
//     /audit                (P2g placeholder)
//     /print/invoice/:id    Printable invoice (P2g)
//     /print/work-order/:id Printable work order (P2g)
//     /print/deposit        Printable deposit receipt (P2g)
//     /print/estimate       Printable estimate (P2g)
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
import TireSearch from './pages/TireSearch.jsx';
import TireDetail from './pages/TireDetail.jsx';
import TireCreate from './pages/TireCreate.jsx';
import CustomerSearch from './pages/CustomerSearch.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import VehicleSearch from './pages/VehicleSearch.jsx';
import VehicleDetail from './pages/VehicleDetail.jsx';
import WorkOrderList from './pages/WorkOrderList.jsx';
import WorkOrderDetail from './pages/WorkOrderDetail.jsx';
import InvoiceList from './pages/InvoiceList.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import CashDrawer from './pages/CashDrawer.jsx';
import AppointmentList from './pages/AppointmentList.jsx';
import PurchaseOrderList from './pages/PurchaseOrderList.jsx';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail.jsx';
import RefundList from './pages/RefundList.jsx';
import QuoteTool from './pages/QuoteTool.jsx';
import SettingsAdmin from './pages/SettingsAdmin.jsx';
import WarrantyManager from './pages/WarrantyManager.jsx';
import { WheelSearch, WheelDetail } from './pages/WheelPages.jsx';
import FitmentSearch from './pages/FitmentSearch.jsx';
import RecallChecker from './pages/RecallChecker.jsx';
import BarcodeScanner from './pages/BarcodeScanner.jsx';
import CustomerComm from './pages/CustomerComm.jsx';
import DiscountManager from './pages/DiscountManager.jsx';
import BillingStatements from './pages/BillingStatements.jsx';
import TireStorageManager from './pages/TireStorageManager.jsx';
import PricingAdvisor from './pages/PricingAdvisor.jsx';
const MarketplaceHub = lazy(() => import('./pages/MarketplaceHub.jsx'));
import { StorefrontShell, StorefrontHome, StorefrontInventory, StorefrontTireDetail,
         StorefrontFitment, StorefrontAppointments, StorefrontWarranty } from './pages/Storefront.jsx';
import { lazy, Suspense } from 'react';
const ReportsDashboard = lazy(() => import('./pages/ReportsDashboard.jsx'));
const LazyPrintInvoice = lazy(() => import('./pages/PrintTemplates.jsx').then(m => ({ default: m.PrintInvoice })));
const LazyPrintWorkOrder = lazy(() => import('./pages/PrintTemplates.jsx').then(m => ({ default: m.PrintWorkOrder })));
const LazyPrintDeposit = lazy(() => import('./pages/PrintTemplates.jsx').then(m => ({ default: m.PrintDepositReceipt })));
const LazyPrintEstimate = lazy(() => import('./pages/PrintTemplates.jsx').then(m => ({ default: m.PrintEstimate })));
const SuspenseFallback = <div style={{padding:'2rem',textAlign:'center'}}>Loading...</div>;
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

          {/* Public storefront (no auth, P3d) */}
          <Route path="/shop" element={<StorefrontShell><StorefrontHome /></StorefrontShell>} />
          <Route path="/shop/inventory" element={<StorefrontShell><StorefrontInventory /></StorefrontShell>} />
          <Route path="/shop/inventory/:id" element={<StorefrontShell><StorefrontTireDetail /></StorefrontShell>} />
          <Route path="/shop/fitment" element={<StorefrontShell><StorefrontFitment /></StorefrontShell>} />
          <Route path="/shop/appointments" element={<StorefrontShell><StorefrontAppointments /></StorefrontShell>} />
          <Route path="/shop/warranty" element={<StorefrontShell><StorefrontWarranty /></StorefrontShell>} />

          {/* Protected routes (require auth, wrapped in AppShell) */}
          <Route element={<ProtectedRoute />}>
            {/* Print routes (no shell, own layout) */}
            <Route path="/print/invoice/:id" element={<Suspense fallback={SuspenseFallback}><LazyPrintInvoice /></Suspense>} />
            <Route path="/print/work-order/:id" element={<Suspense fallback={SuspenseFallback}><LazyPrintWorkOrder /></Suspense>} />
            <Route path="/print/deposit" element={<Suspense fallback={SuspenseFallback}><LazyPrintDeposit /></Suspense>} />
            <Route path="/print/estimate" element={<Suspense fallback={SuspenseFallback}><LazyPrintEstimate /></Suspense>} />

            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />

              {/* Operations (P2c, P2d, P2e) */}
              {/* Tire inventory (P2c) */}
              <Route path="tires"       element={<TireSearch />} />
              <Route path="tires/new"   element={<TireCreate />} />
              <Route path="tires/:id"   element={<TireDetail />} />
              {/* Customers (P2d) */}
              <Route path="customers"     element={<CustomerSearch />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              {/* Vehicles (P2d) */}
              <Route path="vehicles"      element={<VehicleSearch />} />
              <Route path="vehicles/:id"  element={<VehicleDetail />} />
              {/* Work Orders (P2e) */}
              <Route path="work-orders"     element={<WorkOrderList />} />
              <Route path="work-orders/:id" element={<WorkOrderDetail />} />
              {/* Invoices + Checkout (P2e) */}
              <Route path="invoices"        element={<InvoiceList />} />
              <Route path="invoices/:id"    element={<InvoiceDetail />} />

              {/* Shop operations (P2f) */}
              <Route path="cash-drawer"          element={<CashDrawer />} />
              <Route path="appointments"         element={<AppointmentList />} />
              <Route path="purchase-orders"      element={<PurchaseOrderList />} />
              <Route path="purchase-orders/:id"  element={<PurchaseOrderDetail />} />
              <Route path="refunds"              element={<RefundList />} />
              <Route path="quotes"               element={<QuoteTool />} />

              {/* Admin (P2g) */}
              {/* Admin / Reports (P2g) */}
              <Route path="reports" element={<Suspense fallback={SuspenseFallback}><ReportsDashboard /></Suspense>} />
              <Route path="audit"   element={<Placeholder title="Audit Log" chunk="P3+" />} />

              {/* Admin (P3) */}
              <Route path="settings"           element={<SettingsAdmin />} />
              <Route path="warranties"         element={<WarrantyManager />} />
              <Route path="wheels"             element={<WheelSearch />} />
              <Route path="wheels/:id"         element={<WheelDetail />} />
              <Route path="fitment"            element={<FitmentSearch />} />
              <Route path="recalls"            element={<RecallChecker />} />
              <Route path="scanner"            element={<BarcodeScanner />} />
              <Route path="communications"     element={<CustomerComm />} />
              <Route path="discounts"          element={<DiscountManager />} />
              <Route path="statements"         element={<BillingStatements />} />
              <Route path="tire-storage"       element={<TireStorageManager />} />
              <Route path="pricing-advisor"    element={<PricingAdvisor />} />
              <Route path="marketplace"        element={<Suspense fallback={SuspenseFallback}><MarketplaceHub /></Suspense>} />
              <Route path="users"              element={<Placeholder title="User Management" chunk="P3+" />} />

              {/* 404 within the shell */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
