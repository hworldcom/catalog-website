# Ticket 0049b: Casual Fashion Homepage Hero

## Status

Implemented on 2026-08-29. Ticket 0049a is complete and the component boundary,
responsive composition, asset contract, actions, trust copy, loading behavior,
and failure behavior are resolved below.

## Parent

Ticket 0049.

## Dependencies

Ticket 0049a.

## Goal

Build the editorial marketplace homepage hero with a coordinated, generated set
of casual fashion images and compact trust highlights.

## Scope

- Generate and optimize the three-image hero set.
- Add
  `src/features/marketplace/components/marketplace-home-hero.tsx` as the
  reusable homepage-owned hero component.
- Render it as `<MarketplaceHomeHero audience={audience} />`. The component owns
  its translated hero/trust copy and static asset references; it does not issue
  data queries.
- Use `PublicContainer` for the hero's shared 1320px content width and responsive
  gutters.
- Two-column desktop composition and stacked mobile composition.
- Existing translated headline and marketplace description.
- Browse products and Join the network actions.
- Real suppliers, Direct contact, and Global reach trust highlights.
- Loading priority, aspect ratios, alternative text, and image failure behavior.

## Image Direction

Generate three coordinated images:

1. `hero-clothing-rack.webp`: wide casual wholesale clothing rack in an
   approachable showroom, generated at 1600x900.
2. `hero-casual-woman.webp`: vertical adult-woman casual fashion portrait,
   generated at 900x1200.
3. `hero-casual-handbag.webp`: vertical casual, unbranded handbag or garment
   detail, generated at 900x1200.

Use natural daylight, warm neutrals, contemporary European-market context, and
approachable styling. Avoid runway luxury, dark atmosphere, trademarks, text,
watermarks, home decor, ceramics, and furniture-focused compositions.

Store optimized assets under `public/assets/marketplace/` with stable,
descriptive filenames. Deliver WebP assets with the primary image at no more
than approximately 300KB and each secondary image at no more than approximately
220KB, provided visual quality remains acceptable. Do not commit unused source
variants.

## Expected Behavior

- Use an approximately 48/52 copy-to-images split on wide screens.
- Switch to the two-column composition at the `lg` breakpoint. Below `lg`, stack
  copy, actions, the compact image collage, and trust points in that order.
- Build one stable collage with the wide image across the top and the two
  portrait sources side by side below it. Crop with `object-cover`; do not
  distort source proportions.
- Use approximately 42% of the collage height for the wide top image and 58%
  for the lower portrait row, with restrained 6px to 8px gaps and corner radii.
- Cap the collage at approximately 500px high on desktop, 360px on tablet, and
  280px on mobile. Reserve these dimensions before images load.
- Keep the desktop hero compact enough that the Trending section heading is
  visible at 1440x900 and wide-desktop viewports.
- Use exactly two hero actions and preserve language and audience state.
- Link Browse products to `/c/fashion` and Join the network to `/join`. Remove
  the current Sell on Bazoria action from the hero; the existing lower seller
  call to action remains unchanged.
- Keep direct-contact and no-checkout messaging accurate.
- Use `Store`, `MessageCircle`, and `Globe2` Lucide icons for the trust
  highlights. Use these English source strings and add PL, DE, and VI
  translations:
  - Real suppliers: `Independent wholesalers with real catalogs.`
  - Direct contact: `Inquire and negotiate with sellers directly.`
  - Global reach: `Discover products across markets.`
- Keep trust highlights unframed. Render them as three compact columns on
  desktop and as a compact responsive grid below the collage on smaller
  screens.
- Treat all three images as decorative because the adjacent copy owns the
  meaning. Use empty alternative text and do not expose duplicate accessible
  names.
- Set only `hero-clothing-rack.webp` to `loading="eager"` and
  `fetchPriority="high"`. Lazy-load both secondary images and do not assign them
  high fetch priority.
- Reserve image dimensions so font or image loading does not move the layout.
- If an image fails, remove the broken image element while preserving its
  allocated soft-surface region. Do not show broken-image icons, replacement
  marketing copy, or collapse the collage.
- Use the existing semantic public tokens on a solid warm surface. Remove the
  current hero gradient and do not introduce component-local color literals.
- Keep the existing translated kicker, two-part headline, and marketplace lead
  copy unchanged.
- Give both actions visible focus states and minimum 44px interaction height.

## Non-Goals

- Product, category, or supplier section changes.
- Data migrations or product-feed changes.
- Reusing live product images for the hero composition.
- Copying or extracting low-resolution photos from the mockup.
- Changing homepage queries, loaders, or any section below the hero.
- Changing the lower seller call to action.

## Acceptance Criteria

- [x] Three casual, fashion-focused generated assets form one coherent set.
- [x] Hero copy and both actions work in all supported languages.
- [x] Trust highlights are compact and unframed.
- [x] No home-decor imagery or unsupported marketplace content appears.
- [x] Mobile and desktop compositions have stable dimensions and no overlap.
- [x] Decorative imagery does not add redundant screen-reader output.
- [x] Primary and secondary images follow the approved loading-priority
      contract.
- [x] Missing images preserve the collage dimensions without broken-image UI.
- [x] The hero uses `PublicContainer` and semantic public color tokens.
- [x] The Trending heading remains visible at 1440x900 and wider viewports.

## Validation

- Add focused homepage hero tests for copy, links, and trust highlights.
- Verify generated assets visually and check their optimized file sizes.
- Verify image loading, missing-image fallback, and layout stability.
- Test that the current Sell on Bazoria hero action is removed while the lower
  seller call to action remains outside this component and unchanged.
- Test decorative image accessibility and the primary/secondary loading
  attributes.
- Verify EN, PL, DE, and VI at constrained widths.
- Run focused tests, lint, and production build.
- Inspect mobile, tablet, 13-inch laptop, and wide-desktop layouts.

## Implementation Notes

- Added the homepage-owned `MarketplaceHomeHero` component and kept homepage
  loaders and content sections unchanged.
- Added optimized WebP assets at 1600x900, 900x1200, and 900x1200. Their final
  sizes are approximately 114KB, 40KB, and 56KB.
- Added focused component and homepage regression tests for actions, audience
  and language state, trust content, decorative images, loading priority, and
  failed-image behavior.
- Verified responsive geometry at 390x844 and 1024x768 with no horizontal
  overflow. Verified the Trending heading is visible at 1440x900.
- `npm run test:node22`: 215 files and 1,423 tests passed.
- `npm run lint:node22`: passed with 13 pre-existing Fast Refresh warnings.
- `npm run build:node22`: passed.
