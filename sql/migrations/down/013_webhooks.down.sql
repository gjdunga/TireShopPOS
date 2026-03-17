-- Down: 013_webhooks.sql
-- Reverses: webhook_endpoints, webhook_deliveries, webhook_inbound_log tables.
-- Safe: drops infrastructure tables only. No business data lost.

DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_inbound_log;
DROP TABLE IF EXISTS webhook_endpoints;
