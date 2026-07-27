# Seller Feature

Owns the seller dashboard and seller-owned catalog management workflows.

Current status:

- seller-owned product create and edit workflows are implemented;
- title changes use the shared ProductDraft title contract and are written
  atomically with the other seller product fields; and
- published and archived ProductDraft titles are read-only;
- classifier upload and import remain administrator-operated in the current
  prototype; and
- classifier ticket `0029-seller-owned-classifier-workflow` defines the target
  migration into authenticated seller routes.

Expected ownership:

- seller onboarding;
- seller dashboard shell and navigation;
- storefront editing;
- product list, create, edit, and delete workflows;
- private imported ProductDraft image galleries and previews;
- classifier-assisted bulk upload, processing, group review, and approval; and
- seller leads inbox.

Boundaries:

- Public seller storefront pages stay in `src/features/marketplace`.
- Current administrator classifier operations stay in `src/features/admin`
  during migration and remain available for monitoring, retry, reconciliation,
  and support.
- Target seller classifier pages belong in `src/features/seller`.
- Authenticated seller server operations resolve the current seller from
  `sellers.owner_id`; browser requests never select a destination seller.
- Seller browsers call Bazoria Web server boundaries and never call private
  classifier export routes directly.
