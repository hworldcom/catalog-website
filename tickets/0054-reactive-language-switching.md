# Ticket 0054: Reactive Language Switching

## Goal

Changing the language in the shared language switcher must update the complete
visible page immediately, without requiring a browser refresh.

## Observed behavior

- The marketplace category bar updates immediately because it subscribes to the
  language context with `useLang()`.
- Several page screens and shared public components render translated strings
  through the plain `tr(...)` helper without subscribing to language changes.
- Those components keep their existing render until another event, such as a
  full page refresh, causes them to render again.

## Expected behavior

- Home, join, category, product detail, and seller storefront content updates
  immediately after selecting `EN`, `PL`, `DE`, or `VI`.
- Header, footer, empty states, controls, accessible labels, and product detail
  labels update with the rest of the page.
- Product detail data that depends on language follows the selected language.
- Switching language does not reload the browser or discard form and route
  state through a forced subtree remount.

## Implementation slice

- Make the public screens that contain plain `tr(...)` calls subscribe to the
  language context.
- Make shared public header and footer content subscribe independently so error
  and not-found shells also update.
- Keep the existing URL and local-storage language persistence behavior.

## Edge cases

- Language switching while a public inquiry form is being edited must not reset
  its local form state.
- Product detail query and social-share language values must stay aligned with
  the selected language.
- Existing category and seller storefront behavior must remain unchanged.

## Non-goals

- Redesigning the translation catalog or adding new languages.
- Translating database-owned product, seller, or category content that has no
  localized value.
- Changing route search parameter persistence.

## Validation

- Add or update focused component coverage for language-reactive public screens.
- Run the relevant tests, `npm run lint`, and `npm run build`.
- Manually verify the home and product detail pages at desktop and mobile widths.

## Implementation notes

- Added language-context subscriptions to the home, join, and product-detail
  public screens so descendants using `tr(...)` rerender without a forced
  remount.
- Added independent subscriptions to public header, footer, not-found, and
  page-error content.
- Kept product detail query language sourced from the route language while the
  live context supplies the rerender signal.
- Updated the affected public-shell test mock.

## Validation results

- Focused public language-related tests: 4 files, 23 tests passed.
- `npm run build` passed through the Node 22.13 fallback.
- Touched-file lint passed.
- Repository-wide lint remains blocked by the pre-existing formatting error in
  `scripts/terraform/identity-contract.mjs:314`.
- The full test suite has 4 unrelated deployment configuration failures because
  the current repository configuration exposes unclassified `BAZORIA_IMAGE_DIGEST`.
