# Marketplace Feature

Owns buyer-facing public marketplace surfaces.

Current status: scaffold only.

Expected ownership:

- marketplace home;
- category catalog pages;
- public seller storefront pages;
- public product detail pages;
- buyer inquiry flows.

Boundaries:

- Seller dashboard workflows stay in `src/features/seller`.
- Admin workflows stay in `src/features/admin`.
- TanStack route files stay in `src/routes` and import screens from this
  feature.
