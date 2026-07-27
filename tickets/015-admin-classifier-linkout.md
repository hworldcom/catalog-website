# Ticket 015 - Admin Link To Classifier

## Goal

Provide the lowest-risk first admin integration by linking Bazoria admins to the existing catalog-classifier admin tool.

## Context

The classifier frontend already owns upload, processing, grouping review, and batch approval flows:

- `/admin/ingest`
- `/admin/processing/{batchId}`
- `/admin/review/{batchId}`

Bazoria Web does not need to rebuild those screens for the first integration.

## Scope

- Add an admin-only route or admin dashboard entry in Bazoria Web.
- Link authorized admins to the configured classifier admin base URL.
- Keep seller-facing routes out of scope.
- Do not proxy image uploads through Bazoria Web.
- Do not create ProductDraft records in this ticket.

## Target Files

- `src/routes/_authenticated/admin.tsx`
- `src/features/admin/screens/admin-dashboard-screen.tsx`
- `src/features/admin/classifier-link.functions.ts`
- `src/features/admin/server/admin-auth.service.ts`
- optional focused tests for admin authorization/config helpers if the logic is
  extracted cleanly

## Configuration

Use server-side configuration for:

- `CLASSIFIER_ADMIN_BASE_URL`
  - public browser destination URL for the classifier admin tool
  - no credentials or tokens in this value
- `CLASSIFIER_ADMIN_LINK_ENABLED`
  - optional feature flag
  - default disabled when the base URL is missing

Do not put classifier API credentials in browser-visible environment variables.
Ticket 015 only needs a browser destination link, not classifier API access.

## Admin Authorization

- The `/admin` route should live under the existing authenticated route group.
- The visible classifier link should come from an authenticated server function,
  not directly from client-side environment variables.
- The server function should verify the current user has the `admin` role before
  returning the classifier URL.
- Prefer the existing Supabase `has_role` remote procedure with
  `_role: "admin"` and the authenticated `userId` from `requireSupabaseAuth`.
- Non-admin users should not receive the classifier URL from the server
  function.

## Link Behavior

- Link target should be the configured classifier admin base URL.
- Open the classifier in a new tab/window.
- If the link is disabled or unconfigured, show admin-safe disabled state copy.
- Do not embed classifier screens in an iframe.
- Do not pass authentication tokens in the URL.

## Questions For Classifier Team

- What are the classifier admin base URLs for local, staging, and production?
- Which path should Bazoria link to by default: admin home, `/admin/ingest`, or
  another landing page?
- Are `/admin/ingest`, `/admin/processing/{batchId}`, and
  `/admin/review/{batchId}` stable public admin paths?
- How does classifier admin authentication work today?
- Will Bazoria admins have separate classifier accounts, or is shared sign-in
  planned?
- If a Bazoria admin opens the classifier link without an active classifier
  session, where should the classifier redirect them?
- Should all Bazoria `admin` users see the classifier link, or only a smaller
  operations/admin subgroup?
- Should the link be enabled in local development, staging, and production, or
  only in selected environments?
- Is the classifier admin base URL safe to expose as a browser destination URL?
- Does classifier need or want a "Back to Bazoria" link after navigation?

## Non-Goals

- Do not call classifier APIs.
- Do not implement single sign-on in this ticket.
- Do not copy classifier upload, processing, grouping, or review screens.
- Do not create ProductDraft records.
- Do not add seller-facing classifier access.

## Acceptance Criteria

- Authorized admins can navigate from Bazoria Web to classifier admin.
- Non-admin users do not see the link.
- Non-admin users cannot retrieve the classifier URL through the server
  function.
- Missing or disabled classifier configuration does not crash the admin route.
- No classifier upload/review logic is copied into Bazoria Web.
- No product drafts or public products are created.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
