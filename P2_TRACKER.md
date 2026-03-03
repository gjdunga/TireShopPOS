# Phase 2: Core Operations UI -- Tracker

**Goal:** Shop can run daily operations entirely through browser.
Production-ready for in-shop use after P2.

**Baseline:** P1 complete (19 commits, 9b98407). Backend is a full API server:
boot, authenticate, authorize, dispatch, respond, backup.

---

## Sub-task Status

| Chunk | Description | Status | Commit | Date |
|-------|-------------|--------|--------|------|
| P2a | Frontend scaffold: Vite, React Router, AuthContext, API client, layout shell | DONE | d0643bf | 2026-03-03 |
| P2b | CRUD API completion: remaining 12 permissions, all entity endpoints | DONE | de3c3b8 | 2026-03-03 |
| P2c | Dashboard (live KPIs) + tire inventory screens + photo upload UI | DONE | b87ad4e | 2026-03-03 |
| P2d | Customer/vehicle CRUD + VehicleLookupService integration | DONE | 2b01121 | 2026-03-03 |
| P2e | Work order + invoice + waiver + checkout (core transaction flow) | TODO | | |
| P2f | Cash drawer, appointments, PO, refunds, quotes | TODO | | |
| P2g | Print/PDF templates + 25 report charts | TODO | | |

---

## P2a: Frontend Scaffold (DONE)

**Deliverables:**
- Vite 7 build with React 19, React Router 7, dev proxy to PHP backend
- API client: Bearer token injection, JSON envelope unwrap, 401 interception, ApiError class, FormData support
- AuthContext: login/logout, session check on mount, permission loading from roles API, can/canAny/canAll helpers
- ProtectedRoute: auth guard, force-password-change redirect, single/any/all permission gates, 403 fallback
- AppShell: fixed sidebar (permission-filtered nav groups), fixed topbar (user info, role badge, logout), scrollable content
- Login page: full-screen, redirect to origin after auth
- PasswordChange page: client-side validation (8+ chars, upper, lower, digit, match), calls /auth/password
- Dashboard: fetches /api/health, displays system status cards, proves full pipeline works
- Placeholder routes for all P2b-P2g pages with chunk labels
- Global CSS: brand palette (Navy #1A2744, Red #C9202F, Cream #F4F0E8), Oswald/Bitter fonts, card/badge/alert/spinner/button system
- Google Fonts loaded from CDN (Oswald + Bitter)

**File count:** 18 source files (JSX, JS, CSS, HTML, config)

**Dependency decisions:**
- React SPA served behind PHP API (not Alpine.js with PHP templates)
- Token in memory only (no localStorage), clears on hard refresh (intentional security posture)
- Vite dev server proxies /api to php -S on :8080
- Production: build to dist/, Apache/Nginx serves static + proxies /api to PHP

---

## P2b: CRUD API Completion (DONE)

**Deliverables:**
- 53 new CRUD functions in `php/tire_pos_crud.php` (1,194 lines)
- 53 new API routes in `routes/api.php` (110 total, up from 57)
- All 30 schema permissions now enforced end-to-end via Middleware::permit()
- Every mutation audited via auditLog() + logActivity()

**Entity coverage:**
- Tires: get, create, update, write-off, photo upload/delete (multipart, MIME validation, 10 MB limit)
- Customers: get, create, update
- Vehicles: get, create, update, link/unlink customer M:M
- Work orders: get, create, update, assign, positions CRUD, complete (torque gate enforced)
- Invoices: get, create, line items add/remove, void (with reason)
- Payments: record, list per invoice, auto-status to "paid" when fully covered
- Deposits: create (with config-driven expiration), apply to invoice, forfeit
- Refunds: create request (with validation), approve (tiered: manager <$60, owner >$60)
- Purchase orders: get, create, line items, receive (partial/full auto-status)
- Appointments: get, list by date range, create, update, cancel
- Waivers: create with template auto-fill and acknowledgment timestamp
- Vendors: list, get, create
- Service catalog: list, get (read-only, auth only)
- Configuration: list, get, update (CONFIG_MANAGE / owner only)
- Fee waiver: zero out line item price with audit trail (FEE_WAIVE / owner only)

**Permission gap closed:** INVENTORY_ADD, INVENTORY_EDIT, INVENTORY_WRITE_OFF, INVOICE_VOID, PAYMENT_ACCEPT, FEE_WAIVE, CONFIG_MANAGE, PO_RECEIVE, PHOTO_UPLOAD, WORK_ORDER_ASSIGN (10 permissions that had no standalone routes in P1e)

---

## P2c: Dashboard + Inventory (DONE)

**Deliverables:**
- Dashboard rewrite: 8 live KPI widgets (open WOs, today's appointments, re-torque due, cash drawer, expiring deposits, expired deposits, inventory count, system health). Each widget fetches independently, permission-aware (403 silently hidden).
- TireSearch page: advanced filter panel (size with auto-parse, brand dropdown, condition, status, tread depth, price range, BIN facility). Paginated table (25/page) with condition badges and status pills.
- TireDetail page: edit form (INVENTORY_EDIT) or read-only view. Photo gallery with upload/delete/primary badge. DOT/TIN parser display with age warning. Waiver detection panel. Write-off action with reason.
- TireCreate page: creation form with size auto-parse preview, brand dropdown, navigates to detail on success.
- Backend fix: searchTiresAdvanced route corrected to match function signature.
- New endpoints: /api/lookups/brands, /api/lookups/tire-types, /api/lookups/construction-types.

**File count:** 6 new files (3 JSX, 3 CSS), 3 modified (App.jsx, Dashboard.jsx, api.php). 1,567 insertions.
**Build:** 272 KB (84 KB gzipped), 61 modules, zero warnings.

---

## P2d: Customers + Vehicles + VehicleLookup (DONE)

**Deliverables:**
- CustomerSearch: debounced search (name/phone/email), results table, link to detail.
- CustomerDetail: create/edit form (name, phone primary/secondary, email, full address, tax exempt toggle with ID). Linked vehicles panel (search-and-link, unlink, create-new shortcut).
- VehicleSearch: debounced search (VIN, plate, year/make/model), owner column from M:M join.
- VehicleDetail: create/edit form (year, make, model, trim, VIN with inline check-digit validator, plate+state, color, drivetrain, lug count, lug pattern, torque override, OEM size, notes). Service history table.
- VehicleLookup panel: two-tab interface (Plate Lookup, VIN Decode). Plate runs full 4-stage pipeline (cache, PlateToVIN $0.05, NHTSA VPIC, torque match). VIN runs NHTSA decode (free). Results auto-fill form. Source/cost badge. Torque spec inline.
- TorqueSpecPanel: three-tier matching display (exact/partial/fallback), range, match level + confidence badges, lug info, verified status, manual override awareness.
- 3 new API routes: /vehicles/lookup/plate, /vehicles/lookup/vin, /vehicles/torque-spec.
- VehicleLookupService.php loaded in boot. CRUD column alignment fixed for customers + vehicles tables.

**File count:** 5 new files (4 JSX, 1 CSS), 4 modified. 1,205 insertions.
**Build:** 298 KB (89 KB gzipped), 66 modules, zero warnings. 116 API routes total.

---

## P2e: Work Order + Invoice + Checkout (TODO)

**Scope:** Core transaction flow (heaviest chunk).
- Work order form: vehicle selection, per-position tire assignment (5/7 positions), action type, tread in/out, PSI, condition notes
- Torque verification gate: hard block in UI, cannot proceed without torque confirmation
- Invoice builder: 7 line item types, auto-insert CO tire fees, tax calc (labor/parts split), deposit application
- Waiver auto-detection modal: template display, customer acknowledgment capture
- Payment recording: cash, check, card stub

---

## P2f: Supporting Operations (TODO)

**Scope:** Cash drawer, appointments, vendor/PO, refunds, quotes.
- Cash drawer UI: open, record transactions, close with variance calculation
- Appointment scheduler: calendar view, create/edit/cancel
- Vendor/PO management: create PO, receive against PO, link received tires to inventory
- Refund processing: tiered auth modal (tech requests, manager <$60, owner >$60), anti-split validation
- Out-the-door pricing quote tool: select tires + services, calculate total with tax/fees, print/email

---

## P2g: Print Templates + Reports (TODO)

**Scope:** PDF generation and reporting suite.
- Receipt/print templates: invoice (with CO fee disclosure), deposit receipt (with forfeit policy), work order printout, estimate
- PDF generation (browser-side or server-side TBD)
- Reporting suite: 25+ charts (Chart.js)
  - Sales performance, inventory turnover, fee compliance
  - Employee activity, service usage
  - Cash reconciliation, outstanding deposits, pending refunds
  - CDPHE quarterly report generation

---

## Dependency Graph

```
P1 (complete)
  |
  +-- P2a (frontend scaffold) ----+
  |                                |
  +-- P2b (CRUD API) -------------+
       |                           |
       +-- P2c (dashboard/inventory)
       |
       +-- P2d (customers/vehicles/lookup)
       |         |
       +-- P2e --+ (work order/invoice/checkout)
       |
       +-- P2f (cash drawer/appointments/PO/refunds/quotes)
       |         |
       +-- P2g --+ (print templates + reports)
```

P2a and P2b can run in parallel. P2c and P2d can run in parallel after both.
P2e depends on P2c + P2d. P2f is independent of P2e. P2g is the caboose.
