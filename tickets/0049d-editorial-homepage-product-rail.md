# Ticket 0049d: Editorial Homepage Product Rail

## Status

Implemented and verified on 2026-08-29.

## Parent

Ticket 0049.

## Dependencies

- Ticket 0049a is implemented and committed.
- Ticket 0049b is implemented and committed.
- Ticket 0049c is committed, applied to hosted User Acceptance Testing (UAT),
  and verified to return non-empty `seller_name` and `seller_slug` values for
  every returned trending product.

No additional database migration or server-function change is required.

## Goal

Present the live Trending products as a minimalist, image-led horizontal rail
that includes and links the actual supplier without changing product cards on
category or seller pages.

## Component Ownership

- Add a homepage-owned
  `src/features/marketplace/components/marketplace-product-rail.tsx` component.
  It owns the section heading, View all action, native rail, controls, empty
  state, and homepage product-card composition.
- Add an opt-in `editorial` appearance to the shared `ProductCard`. Its existing
  appearance remains the default and must not change on category or seller
  pages.
- Require `seller_name`, `seller_slug`, and the current audience only for the
  editorial appearance. Keep the base product type usable by existing callers.
- Replace only the homepage Trending section in `MarketplaceHomeScreen` with
  the new rail. Keep its query, suppliers, process, and seller call to action
  unchanged.
- Use `PublicContainer` for the rail section so it follows the approved 1320px
  public-page width and responsive gutters.

## Link Structure

- Do not wrap the whole editorial card in one link because the supplier needs a
  separate destination and nested links are invalid.
- Make the image and product title one product-detail link to
  `/p/$productId`.
- Render the seller name immediately below the title as a separate storefront
  link to `/s/$sellerSlug`.
- Link View all to `/c/fashion`.
- Every product, seller, and View all link must merge the current `audience`
  into the existing search state so `lang` and any compatible search state are
  preserved.
- Give both destinations visible focus states. Do not make non-interactive
  price or stock metadata appear clickable.

## Product Presentation

- Continue using every product returned by the existing Trending homepage
  query. Do not reorder, truncate, or supplement the response in the browser.
- Use a stable 4:5 image region with restrained 6px to 8px rounding, a muted
  reserved surface, meaningful product-title alternative text, lazy loading,
  and subtle scaling on product-link hover.
- When an image URL is absent or loading fails, retain the reserved muted image
  region without a broken-image icon or fabricated placeholder copy.
- Clamp product titles to two lines and seller names to one line so long content
  cannot resize the rail unexpectedly. The full text remains available through
  the links' accessible names.
- Display the actual seller name directly from `seller_name`; do not infer it
  from the separate featured-seller response and do not add a fallback seller.
- Preserve `formatPrice` behavior, including the existing quote state and
  currency formatting.
- Always render the translated stock label using the existing stock helper;
  color must not be its only signal.
- Render translated minimum order quantity when `moq` is non-null. Render a
  non-empty `pack_size` whether or not a minimum order quantity is present, and
  use a separator only when both values are present.
- Use minimal framing and no heavy card border. Do not render a favorite or
  heart control.

## Rail Behavior

- Use a browser-native horizontal `overflow-x` rail with CSS scroll snapping.
  Do not use autoplay or the existing overflow-hidden Embla carousel because
  native touch and trackpad scrolling must remain available.
- Keep the rail itself keyboard focusable with a translated accessible name and
  a visible focus treatment. Native keyboard scrolling and the explicit
  controls must both remain usable.
- Use responsive fixed card bases that show approximately:
  - two cards below 768px;
  - three cards from 768px through 1023px;
  - five cards at 1024px and above.
- Keep gaps stable and contain horizontal overflow inside the rail; the page
  itself must never overflow horizontally.
- Previous and next controls use Lucide arrow icons, translated accessible
  names, and practical 44px targets.
- If the products fit without overflow, hide the directional-control group.
  This includes empty and single-product states and may include the current
  four-product UAT response on wide desktop.
- When overflow exists, render both controls. Disable Previous at the start,
  disable Next at the end, and update both states after user scrolling,
  programmatic scrolling, and viewport resizing.
- Each control advances approximately one visible viewport and settles to the
  nearest card through scroll snapping.
- Use smooth programmatic scrolling unless the user requests reduced motion.

## Section Behavior

- Keep the current translated `Trending this week` heading, supporting label,
  and empty-state copy.
- Add translated View all, Previous products, Next products, and rail accessible
  labels in EN, PL, DE, and VI.
- Show View all in both populated and empty states because the category catalog
  may contain products outside the curated Trending feed.
- Render all returned products; do not add pagination, client-side filtering,
  or popularity logic.

## Non-Goals

- Renaming the section to New this week; ticket 0050 owns that feed.
- Adding favorites, carousel autoplay, analytics, or popularity calculations.
- Globally redesigning default product cards on category or seller pages.
- Changing the Trending query, ordering, limit, or database contract.
- Adding or modifying database tables, functions, migrations, or UAT data.
- Redesigning homepage suppliers, categories, process, or seller call to action.

## Acceptance Criteria

- [x] The rail renders all live Trending products and their actual seller names.
- [x] Product and seller destinations are separate valid links with no nested
      anchors.
- [x] Product, seller, and View all links preserve language and audience state.
- [x] Price, quote state, currency, stock, minimum order quantity, and pack size
      remain accurate for null and populated values.
- [x] The responsive rail shows approximately two, three, and five cards at the
      approved mobile, tablet, and desktop breakpoints.
- [x] Touch, trackpad, keyboard, mouse, and control navigation remain usable.
- [x] Controls are hidden without overflow and have correct disabled states
      when overflow exists.
- [x] Empty, one-product, missing-image, and long-content states remain stable.
- [x] The editorial appearance does not change category or seller-page cards.
- [x] No favorite interface or automatic movement appears.
- [x] No database or server-function change is introduced.

## Validation

- Add focused shared-card tests proving the default appearance is unchanged and
  the editorial appearance renders accurate metadata, separate product/seller
  links, preserved search state, quote/null states, and image fallback.
- Add focused rail tests for all returned products, View all, empty state,
  one-item state, overflow detection, boundary-disabled controls, scrolling,
  resize updates, and translated accessible names.
- Update the homepage screen test to prove the new component receives the live
  Trending response and current audience without changing later sections.
- Verify missing images, failed images, long product and seller names, and long
  translated labels.
- Verify no horizontal page overflow and inspect 390x844 mobile, 768x1024
  tablet, 1440x900 13-inch-class laptop, and 1920x1080 wide-desktop layouts.
- Verify EN, PL, DE, and VI and all four audience states.
- Run focused tests, the complete application test suite, lint, and production
  build.

## Implementation Notes

- Added the opt-in editorial `ProductCard` appearance while retaining the
  existing default card markup and behavior.
- Added the homepage-owned native scroll-snap rail with translated controls,
  overflow-aware control states, reduced-motion handling, and a translated
  empty state.
- Replaced only the homepage Trending section and retained the existing live
  query and the later homepage sections.
- Added word wrapping to the translated homepage hero heading after the German
  mobile viewport exposed a long compound-word overflow.
- No database migration, server function, or fixture change was made.

## Verification Results

- Focused tests: 4 files and 20 tests passed.
- Complete test suite: 219 files and 1,441 tests passed.
- Lint: passed with 13 existing Fast Refresh warnings and no errors.
- Production build: passed with Node 22.13.0.
- Browser inspection: no page-level horizontal overflow at 390x844, 768x1024,
  1440x900, or 1920x1080 in EN, PL, DE, or VI.
- Live UAT inspection: all, women, and men render their filtered products with
  language and audience state in product and seller links; kids renders the
  empty state. The four-product all-audience response overflows on mobile and
  tablet and fits without controls on wider desktop layouts.
- Interaction inspection: native keyboard and trackpad-style scrolling work;
  directional controls advance the rail and update disabled boundary states.
