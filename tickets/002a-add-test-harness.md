# Ticket 002a - Add Test Harness

## Goal

Add a lightweight test harness before continuing component and server-function
refactors.

## Reason

The project currently has no app-owned test files, test script, or test
configuration. Lint, build, and dev smoke tests are enough for scaffolding and
very mechanical route moves, but ticket 003 starts moving shared layout and
product code that would benefit from quick regression tests.

## Recommended Stack

- Vitest for unit tests.
- React Testing Library for component rendering tests.
- jsdom for browser-like component tests.
- Keep Playwright out of this ticket unless a later ticket needs browser-level
  end-to-end coverage.

## Scope

- Add test dependencies.
- Add `test` and `test:watch` scripts.
- Add test configuration compatible with the existing Vite/TanStack setup.
- Add a small setup file for React Testing Library matchers if needed.
- Add initial tests around low-risk extracted or soon-to-be-extracted behavior:
  - product price formatting;
  - stock label mapping if separated from component-only files;
  - route/helper validation such as product ID validation if extracted.

## Out Of Scope

- Browser end-to-end tests.
- Supabase integration tests.
- Server function database tests.
- Large component snapshots.
- Reworking app code only to make it testable.

## Acceptance Criteria

- `npm run test` exists and passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
- Test files are colocated with the code they cover or placed in a consistent
  `__tests__` folder.
- Ticket 003 can rely on the harness for small regression tests when extracting
  shared product/layout modules.
