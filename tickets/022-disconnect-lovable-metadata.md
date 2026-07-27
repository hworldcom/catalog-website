# Ticket 022 - Disconnect Lovable Metadata

## Status

Completed.

## Goal

Remove Lovable project metadata and Lovable-specific repository instructions
after useful planning context has been migrated into tickets.

## Context

The project should no longer be connected to Lovable. Current planning lives in
`tickets/`.

`.lovable/plan.md` currently contains only a legacy pointer to:

```text
tickets/021-product-image-uploads.md
```

## Scope

- Confirm `.lovable/plan.md` has no remaining product requirements that are not
  already captured in tickets.
- Remove `.lovable/plan.md`.
- Remove `.lovable/project.json`.
- Remove the `.lovable/` directory if it becomes empty.
- Update `AGENTS.md` to remove Lovable connection/history warnings and legacy
  planning references.
- Update any ticket or README wording that says Lovable metadata should be kept
  for compatibility.

## Out Of Scope

- Do not remove `@lovable.dev/*` npm dependencies in this ticket.
- Do not replace the Vite/TanStack config in this ticket.
- Do not replace Lovable OAuth behavior in this ticket.
- Do not remove Lovable error-reporting code in this ticket.

## Acceptance Criteria

- `.lovable/` no longer exists, or contains no project connection metadata.
- `AGENTS.md` no longer tells agents to preserve Lovable connection state.
- Planning source of truth remains `tickets/`.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

## Implementation Notes

- Confirmed `.lovable/plan.md` contained only a pointer to
  `tickets/021-product-image-uploads.md`; no product requirements were lost.
- Removed `.lovable/plan.md` and `.lovable/project.json`.
- Removed obsolete `.lovable/plan.md` references from `AGENTS.md`.
- Corrected the stale `src/components/bazoria.tsx` project reference in
  `AGENTS.md` to the current shared component directories.
- Preserved historical Lovable scope notes in completed tickets because they
  document what those earlier tickets intentionally did not change.

## Verification

- `npm run test:node22` — 13 tests passed
- `npm run lint:node22` — 0 errors, 12 existing warnings
- `npm run build:node22` — passed
