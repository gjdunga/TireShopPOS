# Phase 3: Online Presence -- Tracker

**Goal:** Public-facing online tire shop with inventory display, vehicle fitment
search, road hazard warranty sales, and online appointment booking. Bridges
in-shop operations with web customer acquisition.

**Baseline:** P1 + P2 complete (32 commits, 7e9bc35). Full API server with
129 routes, 23 page components, 87 modules. Shop runs daily operations
entirely through the browser. 44 tables, 14 views in schema v2.4.

**Estimated Duration:** 8 weeks (roadmap estimate; single developer, part-time).

---

## Sub-task Status

| Chunk | Description | Status | Commit | Date |
|-------|-------------|--------|--------|------|
| P3a | Schema migration + settings foundation | DONE | 3c42f32 | 2026-03-05 |
| P3b | Warranty module (policies, claims, invoice integration) | DONE | bdaab41 | 2026-03-05 |
| P3c | Wheel inventory + fitment search | DONE | d6d6090 | 2026-03-05 |
| P3d | Public storefront (inventory, fitment, appointments, shop info) | DONE | 48485b6 | 2026-03-05 |
| P3e | Customizable fields + advanced config UI | DONE | e108f13 | 2026-03-05 |
| P3f | Embed widget + public API | DONE | e108f13 | 2026-03-05 |

---

## Dependency Graph

```
P3a (schema + settings)
 |
 +-- P3b (warranty module)
 |
 +-- P3c (wheels + fitment)
 |     |
 |     +-- P3d (public storefront) <-- also depends on P3b
 |
 +-- P3e (custom fields + config)
       |
       +-- P3f (embed widget + public API) <-- also depends on P3d
```

P3a is the foundation; everything else depends on it. P3b and P3c can run in
parallel. P3d depends on P3b + P3c (needs warranty display and fitment search).
P3e is independent of P3b/P3c but needs P3a. P3f is the caboose (needs P3d +
P3e for full widget feature set).

---

## P3a: Schema Migration + Settings Foundation (DONE)

**Scope:** New tables, migration tooling, admin settings UI.

**Schema additions (8 new tables):**

1. `shop_settings` -- generic key-value store for shop configuration
   - setting_id (PK), setting_key (UNIQUE VARCHAR 60), setting_value (TEXT),
     setting_type ENUM('text','number','boolean','json','color','url'),
     category VARCHAR(40), label VARCHAR(120), description TEXT,
     is_public TINYINT (visible on public storefront), updated_by INT FK users,
     updated_at DATETIME
   - Seed keys: shop_name, shop_phone, shop_email, shop_address_line1,
     shop_address_line2, shop_city, shop_state, shop_zip, shop_hours_json
     (7-day schedule), tax_rate, logo_url, accent_color, tagline,
     appointment_slot_minutes, appointment_max_per_slot, website_enabled,
     website_inventory_public, website_fitment_enabled,
     website_appointment_enabled

2. `website_config` -- public storefront appearance and behavior
   - config_id (PK), config_key (UNIQUE), config_value (TEXT),
     config_type ENUM('text','boolean','json','color','html'),
     updated_at DATETIME
   - Seed keys: hero_title, hero_subtitle, hero_image_url, about_html,
     footer_html, meta_title, meta_description, google_analytics_id,
     show_prices BOOLEAN, show_tread_depth BOOLEAN, show_condition BOOLEAN,
     featured_tire_ids JSON, announcement_banner_html, announcement_active

3. `warranty_policies` -- road hazard and other warranty templates
   - policy_id (PK), policy_name VARCHAR(120), policy_code VARCHAR(20) UNIQUE,
     coverage_months SMALLINT, coverage_miles INT, price DECIMAL(8,2),
     is_per_tire TINYINT, terms_text TEXT, exclusions_text TEXT,
     max_claim_amount DECIMAL(10,2), deductible DECIMAL(8,2) DEFAULT 0,
     is_active TINYINT, created_at, updated_at

4. `warranty_claims` -- claim lifecycle against sold warranties
   - claim_id (PK), invoice_id INT FK, line_id INT FK (the warranty line item),
     customer_id INT FK, policy_id INT FK, tire_id INT FK (failed tire),
     claim_date DATE, failure_description TEXT, mileage_at_failure INT,
     claim_amount DECIMAL(10,2), status ENUM('filed','reviewing','approved',
     'denied','paid'), reviewed_by INT FK users, reviewed_at DATETIME,
     denial_reason VARCHAR(255), paid_amount DECIMAL(10,2), paid_at DATETIME,
     paid_by INT FK users, notes TEXT, created_at DATETIME

5. `wheels` -- OEM and aftermarket wheel inventory
   - wheel_id (PK), brand VARCHAR(80), model VARCHAR(80),
     diameter DECIMAL(4,1) (inches), width DECIMAL(4,1) (inches),
     bolt_pattern VARCHAR(20) (e.g. "5x114.3"), offset_mm SMALLINT,
     center_bore DECIMAL(5,2) (mm), material ENUM('steel','alloy','forged',
     'carbon','unknown'), finish VARCHAR(60), condition ENUM('new','used'),
     retail_price DECIMAL(8,2), cost DECIMAL(8,2), quantity_on_hand SMALLINT,
     bin_location VARCHAR(20), notes TEXT, is_active TINYINT DEFAULT 1,
     created_at DATETIME

6. `wheel_fitments` -- maps wheels to year/make/model
   - fitment_id (PK), wheel_id INT FK wheels, make VARCHAR(40),
     model VARCHAR(60), year_start SMALLINT, year_end SMALLINT,
     trim VARCHAR(40), is_oem TINYINT (factory wheel vs aftermarket fit),
     notes VARCHAR(255)
   - INDEX on (make, model, year_start, year_end)

7. `custom_fields` -- user-defined fields on tires, customers, vehicles
   - field_id (PK), entity_type ENUM('tire','customer','vehicle','work_order'),
     field_name VARCHAR(60), field_label VARCHAR(120),
     field_type ENUM('text','number','boolean','date','select'),
     select_options JSON (for select type), is_required TINYINT DEFAULT 0,
     sort_order SMALLINT, is_active TINYINT DEFAULT 1, created_at DATETIME

8. `custom_field_values` -- values for custom fields
   - value_id (PK), field_id INT FK custom_fields, entity_id INT
     (tire_id, customer_id, vehicle_id, or work_order_id),
     field_value TEXT, updated_at DATETIME
   - UNIQUE INDEX on (field_id, entity_id)

**Backend:**
- Migration script (SQL file) that ADDs tables to existing schema
- CRUD functions for shop_settings (get all, get by key, update by key)
- CRUD functions for website_config (get all public, get by key, update)
- Admin routes: GET/PATCH /api/settings, GET/PATCH /api/website-config
- Public route (no auth): GET /api/public/shop-info (returns is_public settings only)

**Frontend:**
- Settings admin page: tabbed interface (Shop Info, Hours, Tax/Fees, Website,
  Appearance). Each tab loads relevant setting_key groups, renders appropriate
  input types (text, number, color picker, toggle, JSON editor for hours).
  Save button per tab.
- Website config page: hero content editor, SEO fields, feature toggles,
  featured tires picker, announcement banner editor.

---

## P3b: Warranty Module (DONE)

**Scope:** Warranty policy management, claim lifecycle, invoice integration.

**Backend:**
- CRUD: createWarrantyPolicy, updateWarrantyPolicy, listWarrantyPolicies,
  getWarrantyPolicy, deactivateWarrantyPolicy
- CRUD: fileWarrantyClaim, reviewClaim (approve/deny), payClaim,
  listClaims (by status), getClaimDetail
- Integration: when invoice line_type='warranty', link to warranty_policies
  for terms capture. Warranty expiration calculated from policy coverage_months.
- Validation: claim must be within coverage_months and coverage_miles of
  original purchase. Claim amount <= max_claim_amount. Deductible applied.
- Report: warranty claims summary (filed/approved/denied/paid by period)

**Frontend:**
- Warranty Policies admin page: list with add/edit/deactivate. Fields: name,
  code, coverage (months/miles), price, terms (rich text), exclusions,
  max claim amount, deductible.
- Warranty Claims page: list with status filter (filed/reviewing/approved/
  denied/paid). Claim detail: original invoice link, tire info, failure
  description, mileage, review controls (approve with amount, deny with
  reason), pay button.
- Invoice integration: when adding a warranty line item, dropdown of active
  policies auto-fills price and captures terms snapshot. Warranty expiration
  date auto-calculated and stored on line item.

**Routes (estimated 10-12):**
- GET/POST/PATCH /api/warranty-policies, GET /api/warranty-policies/{id}
- POST /api/warranty-claims, GET /api/warranty-claims,
  GET /api/warranty-claims/{id}, POST /api/warranty-claims/{id}/review,
  POST /api/warranty-claims/{id}/pay
- GET /api/reports/warranty-claims

---

## P3c: Wheel Inventory + Fitment Search (DONE)

**Scope:** Wheel catalog, bolt pattern cross-reference, vehicle fitment
search (tires + wheels), reverse tire size lookup.

**Backend:**
- CRUD: createWheel, updateWheel, searchWheels (by diameter, bolt pattern,
  brand, material, condition), getWheel
- CRUD: addWheelFitment, removeWheelFitment, listFitmentsForWheel
- Fitment search: given (year, make, model), return matching tires
  (from v_tire_inventory by OEM size) and matching wheels (from wheel_fitments
  + wheels). Uses NHTSA VPIC data already cached in VehicleLookupService
  for OEM tire size resolution.
- Reverse tire size lookup: given a tire size string, return all vehicles
  that use that size as OEM (query lkp_torque_specs which has make/model/year
  ranges, plus NHTSA VPIC if needed).
- Bolt pattern cross-reference: given a bolt pattern (e.g. "5x114.3"),
  return all wheels in inventory + all vehicles that use that pattern.

**Frontend:**
- Wheel search page: filter by diameter, bolt pattern, brand, material,
  condition. Results grid with wheel details.
- Wheel detail page: view/edit form, fitment list (which vehicles this
  wheel fits), add fitment form.
- Fitment search page (internal): year/make/model cascading dropdowns
  (year list from torque specs + NHTSA, make filters model, model filters
  trim). Results show compatible tires in inventory + compatible wheels.
- Reverse lookup page: enter tire size, see vehicles that use it.

**Routes (estimated 8-10):**
- GET/POST/PATCH /api/wheels, GET /api/wheels/{id},
  GET /api/wheels/search
- POST/DELETE /api/wheels/{id}/fitments
- GET /api/fitment/search?year=&make=&model= (public-capable)
- GET /api/fitment/reverse?size= (public-capable)
- GET /api/fitment/bolt-pattern?pattern= (public-capable)

---

## P3d: Public Storefront (DONE)

**Scope:** Public-facing website served from the same application. No
authentication required. Reads shop_settings for branding, website_config
for content, inventory data for display.

**Architecture decision:** The public storefront is a separate React SPA
entry point (frontend/public/) with its own Vite config, or a set of
routes in the existing SPA that bypass ProtectedRoute. Decision: separate
entry point is cleaner (different CSS, no auth overhead, smaller bundle,
SEO-friendlier with SSR option later).

**Pages:**
1. **Home page**: hero section (from website_config), shop info, featured
   tires, quick fitment search form, call-to-action for appointment booking.
2. **Inventory browser**: filterable tire grid (size, brand, condition, price
   range). Tile layout with photo, size, brand, price, tread depth, condition
   badge. Pagination. Respects show_prices, show_tread_depth toggles.
3. **Tire detail page**: full-size photos, specs, DOT info, related sizes.
   "Call to inquire" or "Book appointment" CTA (no online checkout in P3).
4. **Wheel browser**: filterable grid by diameter, bolt pattern, brand.
5. **Fitment search page**: year/make/model cascading dropdowns. Results
   show tires in stock + wheels in stock that match. "No exact match" shows
   nearest sizes with compatibility notes.
6. **Reverse lookup page**: enter tire size, see vehicles + available
   inventory in that size.
7. **Online appointment booking**: date picker, time slot selection
   (respects appointment_slot_minutes and max_per_slot settings), service
   type selector, customer name/phone/email, notes. Creates appointment
   record with status='scheduled'. Confirmation page with appointment details.
8. **Shop info page**: address, hours, phone, map embed (Google Maps iframe
   from coordinates in shop_settings), directions link.
9. **Warranty info page**: list active warranty policies with terms,
   coverage, pricing. "Ask about warranty" CTA.

**Public API routes (no auth):**
- GET /api/public/shop-info
- GET /api/public/inventory (paginated, filtered)
- GET /api/public/inventory/{id}
- GET /api/public/wheels (paginated, filtered)
- GET /api/public/fitment/search
- GET /api/public/fitment/reverse
- GET /api/public/appointments/slots?date= (available time slots)
- POST /api/public/appointments (create appointment, rate-limited)
- GET /api/public/warranty-policies

**Security:** Public routes are read-only except appointment creation.
Appointment POST is rate-limited (max 10 per IP per hour) and
honeypot-protected (hidden form field) to prevent spam. No customer PII
exposed in public inventory queries. Tire photos served from existing
photo directory.

**SEO:** Each page has configurable meta title/description from
website_config. Semantic HTML. Open Graph tags for social sharing.

---

## P3e: Customizable Fields + Advanced Config UI (DONE)

**Scope:** User-defined custom fields on entities, fee schedule management,
advanced configuration screens.

**Backend:**
- CRUD: createCustomField, updateCustomField, listCustomFields (by entity_type),
  deactivateCustomField
- CRUD: setCustomFieldValue, getCustomFieldValues (for an entity)
- Integration: custom fields returned with entity GET responses (tire, customer,
  vehicle, work order). Custom field values saved alongside entity updates.
- Fee schedule management: list active fees, add new fee with effective date,
  deactivate fee. Historical fee lookup (which fee was active on a given date).

**Frontend:**
- Custom Fields admin page: grouped by entity type (tire, customer, vehicle,
  work order). Add field form: name, label, type (text/number/boolean/date/
  select), required flag, sort order. For select type: options editor (add/
  remove/reorder). Deactivate button (soft delete, preserves historical data).
- Entity forms updated: tire detail, customer detail, vehicle detail, work
  order detail all render active custom fields below their standard fields.
  Fields render by type (text input, number input, checkbox, date picker,
  select dropdown).
- Fee Configuration admin page: table of active fees with edit/deactivate.
  Add new fee form. Effective date handling (new rate starts on date,
  previous rate preserved for historical invoices).

**Routes (estimated 6-8):**
- GET/POST/PATCH /api/custom-fields, GET /api/custom-fields/{id}
- GET/PATCH /api/custom-field-values/{entity_type}/{entity_id}
- GET/POST/PATCH /api/fee-configuration

---

## P3f: Embed Widget + Public API (DONE)

**Scope:** JavaScript widget that shop owner can embed on their existing
website via a single script tag. Public REST API with API key authentication
for third-party integrations.

**Backend:**
- API key management: generate/revoke API keys per shop. Keys stored hashed
  (SHA-256). Rate limiting per key (1000 req/hour default).
- Public API middleware: validates API key from X-API-Key header or ?api_key
  query param. Returns 401 if invalid, 429 if rate limited.
- CORS configuration: allowed_origins stored in shop_settings, enforced
  in middleware. Preflight (OPTIONS) handled.
- All public routes from P3d also accessible via API key.

**Widget:**
- Single JS file (~15 KB minified) loadable via:
  `<script src="https://shop.example.com/widget.js" data-api-key="KEY"></script>`
- Widget renders an iframe or shadow DOM container (prevents CSS conflicts
  with host page).
- Configurable modules: inventory search, fitment search, appointment booking.
  Shop owner selects which modules to include via data attributes:
  `data-modules="inventory,fitment,appointments"`
- Widget fetches data from public API using the embedded API key.
- Customizable: data-accent-color, data-font, data-layout (sidebar/inline).

**Frontend (admin):**
- API Keys page: list active keys, generate new key (displayed once),
  revoke key. Usage stats per key (request count, last used).
- Widget Builder page: interactive configurator. Select modules, colors,
  layout. Live preview in iframe. Copy-paste embed code generator.
- Allowed Origins page: manage CORS whitelist (add/remove domains).

**Routes (estimated 6-8):**
- POST/GET/DELETE /api/api-keys
- GET /api/api-keys/{id}/usage
- GET/PATCH /api/settings/cors-origins
- GET /widget.js (served from public directory, not API-routed)

---

## Notes

**Runway constraint (18-24 months):** P3 is the first phase that generates
potential new revenue (online customer acquisition, warranty sales). The
sub-task ordering prioritizes the highest-value deliverables first:
- P3a (settings) is required infrastructure, ~1 week
- P3b (warranty) generates direct per-transaction revenue, ~1.5 weeks
- P3c (fitment) is a differentiator no competitor has at this level, ~1.5 weeks
- P3d (storefront) is the customer-facing payoff, ~2 weeks
- P3e (custom fields) is operational polish, ~1 week
- P3f (widget) extends reach but is the lowest priority, ~1 week

**Schema migration strategy:** P3a produces a single SQL migration file
(sql/migrations/003_online_presence.sql) that can be run against an existing
v2.4 database without data loss. All new tables use IF NOT EXISTS. No
existing table columns are modified.

**No online checkout in P3.** The public storefront shows inventory and
accepts appointment bookings. Actual tire purchases happen in-shop. Online
checkout (payment processing, shipping) is a P4+ consideration if the
shop owner wants to sell tires online. This avoids PCI-DSS scope in P3.

**Technology stack unchanged.** PHP 8.1+ backend, React frontend, MySQL.
The public storefront is a second Vite entry point sharing the same API
client and component library. No new runtime dependencies except potentially
a rate-limiting library for the public API (or hand-rolled with the existing
session/token infrastructure).
