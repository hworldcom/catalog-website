# Ticket 0032c2: Bazoria Workflow Documentation And Replacement Coverage

## Status

Implemented in `catalog-website` on 2026-08-01.

## Ownership

- Repository: `catalog-website`
- Split from:
  `catalog-classifier/tickets/0032c-migrate-standalone-web-qa-and-developer-workflows.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Make Bazoria Web the documented, test-covered authenticated browser
application for classifier-assisted seller and delegated-administrator
workflows before the standalone classifier package is removed.

## Scope

- Add the Bazoria Web root setup and runtime README.
- Add a committed non-secret environment template that separates browser-safe
  values from server-only classifier and Supabase credentials.
- Document the supported Vite development origin on port `8080`.
- Ensure browser workflows use authenticated Bazoria operations and opaque
  workflow identifiers rather than raw classifier batch identifiers.
- Add or identify exact Bazoria tests replacing legacy standalone coverage for
  upload validation and concurrency, durable registration and retry,
  finalization, processing start and polling, thumbnails, review editing,
  approval, comparison, terminal behavior, and recovery.
- Keep service-role credentials and classifier configuration out of browser
  bundles and logs.

## Acceptance Criteria

- A clean engineer setup can start Bazoria Web without installing `apps/web`.
- The website README and environment template describe every required
  browser-safe and server-only setting without containing credentials.
- Supported authenticated seller and delegated-administrator workflows have
  exact replacement test evidence.
- Website test, lint, and production-build commands do not depend on the
  retired package.
- Browser polling remains observational and never initiates durable work.

## Dependencies

- Classifier ticket `0032c1` for canonical cross-repository startup, manual
  quality assurance, parity evidence, and backend coverage.
- Ticket `0032b2-seller-multimodal-comparison-interface`.

## Validation Result

- Bazoria Web tests passed: `727 passed`.
- Lint passed with no errors and 12 existing Fast Refresh warnings.
- The production build passed.
- Ticket `0032d` later removed the standalone package after these replacement
  gates passed.
