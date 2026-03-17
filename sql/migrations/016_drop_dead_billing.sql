-- ============================================================================
-- Migration 016: Drop billing_statements and statement_line_items.
--
-- These tables were created in migration 005 with FKs to invoices and
-- payments, both dropped in migration 009. They have zero rows, zero
-- CRUD, zero routes, and broken FK constraints. If AR/AP is built
-- later, new tables will be designed against the work order model.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

DROP TABLE IF EXISTS statement_line_items;
DROP TABLE IF EXISTS billing_statements;
