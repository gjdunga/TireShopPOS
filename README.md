# Tire Shop POS System

**Dungan Soft Technologies** | March 2026

Point-of-sale system for tire shops with integrated vehicle lookup, torque specification management, Colorado tax/fee compliance, and full RBAC security.

## Repository Structure

    sql/
      tire_pos_schema_full.sql    Consolidated schema v2.4 (44 tables, 14 views, 410 torque seed rows)

    php/
      tire_pos_helpers.php        Business logic: validation, tax, torque gate, waivers, RBAC, audit
      VehicleLookupService.php    Plate-to-VIN lookup, NHTSA decode, three-tier torque matching, caching

    docs/
      tire_pos_roadmap.docx       6-phase development roadmap (14 months)
      vehicle_lookup_integration.docx   Technical integration specification
      instant_vehicle_lookup.docx       Client-facing feature documentation

## Schema Version History

- v2.3: 41 tables, 13 views (inventory, customers, vehicles, invoices, work orders, RBAC, audit)
- v2.4: +3 tables, +1 view (lkp_torque_specs, plate_lookup_cache, plate_lookup_log, v_plate_lookup_monthly_cost)

## Requirements

- PHP 8.1+
- MySQL 8.x / MariaDB 10.6+
- ext-curl, ext-json, ext-bcmath
- PlateToVIN API key (environment variable: PLATETOVIN_API_KEY)

## License

See LICENSE file.
