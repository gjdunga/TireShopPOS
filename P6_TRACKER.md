# Phase 6: Marketplace Integration -- Tracker

**Goal:** Connect the shop to external sales channels: distributor ordering,
eBay listings, classifieds selling tools, B2B network, directory listing.

**Baseline:** P1-P5 complete (49 commits, ee96e09). 202 API routes,
35 page components, 101 modules. 63 tables.

**Estimated Duration:** 8 weeks (roadmap estimate; single developer, part-time).

**Note:** Each marketplace integration requires external API credentials and
TOS agreements. This phase builds the integration framework, credential
management, listing templates, and order import pipeline. Actual live
connections activate when credentials are configured.

---

## Sub-task Status

| Chunk | Description | Status | Commit | Date |
|-------|-------------|--------|--------|------|
| P6a | Schema + integration framework (credential vault, sync log) | DONE | e5bbf79 | 2026-03-05 |
| P6b | Distributor ordering (ATD, TBC, NTW abstraction layer) | DONE | 2eac2ac | 2026-03-05 |
| P6c | eBay integration (listing sync, order import) | DONE | 2eac2ac | 2026-03-05 |
| P6d | Classifieds tools (Craigslist, FB Marketplace, OfferUp templates) | DONE | 2eac2ac | 2026-03-05 |
| P6e | B2B network + directory listing | DONE | 2eac2ac | 2026-03-05 |

---

## Dependency Graph

```
P6a (schema + framework)
 |
 +-- P6b (distributor ordering)
 |
 +-- P6c (eBay integration)
 |
 +-- P6d (classifieds tools)
 |
 +-- P6e (B2B network + directory)
```

P6a is the foundation. P6b through P6e are independent of each other.
