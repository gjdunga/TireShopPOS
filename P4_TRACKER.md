# Phase 4: Mobile and Hardware -- Tracker

**Goal:** Responsive mobile interface for shop floor use, barcode/label
integration, NHTSA recall checking, customer communications (SMS/email).

**Baseline:** P1 + P2 + P3 complete (39 commits, 2983f86). 171 API routes,
28 page components, 94 modules. 53 tables. Public storefront live.

**Estimated Duration:** 6 weeks (roadmap estimate; single developer, part-time).

---

## Sub-task Status

| Chunk | Description | Status | Commit | Date |
|-------|-------------|--------|--------|------|
| P4a | Responsive layout (sidebar collapse, mobile-first refactor) | DONE | 81af5ad | 2026-03-05 |
| P4b | NHTSA tire recall checker | DONE | bf8d52b | 2026-03-05 |
| P4c | Barcode label generation (ZPL for Zebra printers) | DONE | 89bd294 | 2026-03-05 |
| P4d | Barcode scanning (camera API + USB HID) | DONE | 89bd294 | 2026-03-05 |
| P4e | Customer communicator (notifications, SMS/email framework) | DONE | 76e07cf | 2026-03-05 |

---

## Dependency Graph

```
P4a (responsive layout)
 |
 +-- P4b (recall checker, independent)
 |
 +-- P4c (barcode labels, independent)
 |
 +-- P4d (barcode scanning, benefits from P4c)
 |
 +-- P4e (customer comms, independent)
```

P4a is the foundation (mobile layout). P4b through P4e can run in any order
after P4a. P4d benefits from P4c (scanning reads codes that labels produce)
but doesn't strictly depend on it.
