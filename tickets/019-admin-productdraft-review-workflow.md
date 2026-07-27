# Ticket 019 - Admin ProductDraft Review Workflow

## Goal

Add Bazoria admin screens for reviewing imported `ProductDraft` records before publication.

## Scope

- List imported drafts.
- Show source classifier batch/group references for traceability.
- Show promoted images.
- Allow admins to fill or edit public catalog fields.
- Validate required public product fields before publication.
- Publish drafts to public products only through explicit admin action.

## Out Of Scope

- Classifier upload, processing, and grouping review.
- Seller-facing import.
- Automatic publication after classifier approval.

## Acceptance Criteria

- Admins can review imported drafts inside Bazoria.
- Drafts cannot become public products without explicit publish action.
- Product fields not supplied by classifier are clearly editable before publish.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

