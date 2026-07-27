# AGENTS.md instructions for the Bazoria frontend

## Project Scope

- This repository is the Bazoria storefront and seller dashboard frontend.
- Use the ticket files in `tickets/` as the planning source of truth.
- Follow `src/routes/README.md` for route conventions and file-based routing rules.
- Work in small, reviewable steps instead of implementing large frontend changes all at once.

## Working Roles

- Planner: defines scope, user experience intent, data assumptions, and acceptance criteria in a ticket before code changes.
- Implementor: builds the approved change in the smallest safe slice.
- If the task is exploratory or the scope is unclear, stop and clarify before editing code.

## Planning Rule

- Capture the goal, expected behavior, edge cases, non-goals, and validation notes in a `tickets/` file before implementation begins.
- Keep route-specific notes in `src/routes/README.md` up to date when routing conventions change.
- Write planning notes so another agent can continue the work without guessing intent.

## Frontend Rule

- Preserve the app's existing visual language unless the request explicitly asks for a redesign.
- Keep layouts responsive, accessible, and usable on mobile and desktop.
- Reuse shared components from `src/components`, shared helpers from `src/lib`, and integration code from `src/integrations` before creating ad hoc code.
- Keep user-facing copy aligned across the supported languages in `src/lib/i18n.tsx` whenever visible text changes.
- Use the design tokens and Tailwind utilities in `src/styles.css` instead of adding new global CSS unless the change really needs it.

## Routing Rule

- TanStack Start uses file-based routing. Follow the conventions in `src/routes/README.md`.
- Do not hand-edit `src/routeTree.gen.ts`.
- Keep route loaders, search params, and auth boundaries in the route files that own them.

## Implementation Rule

- Do not implement code until the intended outcome is clear.
- If the change touches auth, data fetching, SSR, or browser-only APIs, check both client and server boundaries before editing.
- Keep each change small and focused.
- For shared logic or reusable UI, add or update tests when a test harness exists. If no test harness exists, validate with lint and build.
- Before a broad or risky change, summarize the intended approach and confirm with the user if behavior could change.

## Validation Rule

- Minimum validation for meaningful changes is `npm run lint` and `npm run build`.
- When the test harness is present, run `npm run test` for changes that touch
  tested behavior or shared logic.
- For UI work, verify the affected screens at mobile and desktop sizes.
- If formatting drifts, run `npm run format` only on the touched files.

## Project References

- Core planning and feature notes live in `tickets/`.
- Route conventions live in `src/routes/README.md`.
- App shell, authentication, and shared UI patterns live in `src/routes/__root.tsx`, `src/routes/_authenticated/route.tsx`, `src/components/layout`, and `src/components/product`.

## Language Rule

- Avoid unexplained acronyms in notes and comments. When a common industry term is necessary, spell it out once first.
- Keep wording direct and implementation-oriented.

## Working Style

- Prefer reusable components and shared helpers over duplicate page-specific logic.
- Keep changes isolated to the smallest files that own the behavior.
- Match the existing product intent and copy tone unless the user asks for a new direction.
- Surface assumptions early when a request touches data shape, navigation, or authenticated flows.
