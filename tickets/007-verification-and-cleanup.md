# Ticket 007 - Reorg Verification And Cleanup

## Status

Completed as the verification closeout for tickets `001` through `006`.

## Goal

Verify the reorganization did not change behavior or visual design.

## Scope

- Run `npm run lint:node22`.
- Run `npm run test` if the test harness has been added.
- Run `npm run build:node22`.
- Run the dev server and smoke test:
  - `/`
  - `/auth`
  - `/seller`
  - `/demo/marketplace`
  - `/demo/kesar-textiles`
- Check console output for reintroduced TanStack warnings.
- Check whether Fast Refresh warnings improved or require follow-up tickets.

## Acceptance Criteria

- App starts locally.
- Build passes.
- Tests pass if present.
- Lint has no errors.
- No known route breaks from moved imports.
- Any remaining warnings are documented as follow-up work.
