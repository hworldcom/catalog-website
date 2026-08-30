# Ticket 0049e: Homepage Categories and Suppliers

## Status

Implemented and verified on 2026-08-29.

## Parent

Ticket 0049.

## Dependencies

- Ticket 0049a is implemented and committed.
- Ticket 0049b is implemented and defines the approved casual generated-image
  direction.
- Ticket 0049d is implemented and verified. Commit it before beginning 0049e
  because both tickets change `MarketplaceHomeScreen` and its focused test.
- The supplier-category migration introduced by this ticket must be applied to
  hosted User Acceptance Testing (UAT) before browser validation is complete.

## Goal

Add visual category discovery after the homepage product rail and restyle the
live featured-supplier section using the approved casual fashion direction,
without inventing products, taxonomy, sellers, locations, or verification
states.

## Section Order

The affected homepage order is:

1. Marketplace hero.
2. Trending product rail.
3. Explore categories.
4. Featured suppliers.
5. Existing process section.
6. Existing seller call to action.

Ticket 0049e changes only the Explore categories and Featured suppliers
sections. Ticket 0049f owns the later process and seller call-to-action
redesign.

## Component Ownership

- Add a homepage-owned
  `src/features/marketplace/components/marketplace-category-discovery.tsx`
  component. It owns the translated section heading, approved static tile map,
  live-category filtering, audience and category links, image failure state,
  and responsive category layout.
- Add a homepage-owned
  `src/features/marketplace/components/marketplace-supplier-grid.tsx`
  component. It owns translated supplier copy, live seller cards, category
  labels, verification presentation, image fallback state, links, empty state,
  and responsive supplier layout.
- Pass the current `audience`, live navigation categories, and live featured
  sellers from `MarketplaceHomeScreen`. Do not issue duplicate queries inside
  either presentation component.
- Replace the existing inline supplier section in `MarketplaceHomeScreen` and
  insert category discovery immediately before it. Leave the product query,
  product rail, process section, and seller call to action unchanged.
- Use `PublicContainer` in both sections so they follow the approved 1320px
  public-page width and responsive gutters. Do not keep the narrower local
  `Section` wrapper for these two sections.

## Category Discovery

### Audience Tiles

- Render exactly three static audience tiles: Women, Men, and Kids.
- Do not render an All image tile. All remains available in the persistent
  marketplace audience navigation and is a filter reset rather than a visual
  category.
- Link each audience tile to `/c/fashion` and set its corresponding `audience`
  value. Merge that value into the existing search state so the current
  language and compatible search state are preserved.
- Render all three approved audience tiles even when the current UAT audience
  has an empty feed. Women, Men, and Kids are supported application audience
  states; the destination catalog owns its existing empty state.

### Live Category Tiles

- Support static presentation mappings only for the `dresses` and `sportswear`
  slugs.
- Render a Dresses or Sportswear tile only when that exact slug exists in the
  current `audienceNavigationQueryOptions(audience)` category response.
- Link live category tiles to `/c/$category` using the returned slug. Preserve
  the current audience, including `all`, and merge it into the existing search
  state so language and compatible search state remain intact.
- Use `getPublicCategoryLabel` with the live slug and fallback name. Do not
  hard-code untranslated database labels into the interface.
- Keep the approved display order: Women, Men, Kids, Dresses, Sportswear. An
  unavailable live category is omitted without leaving an empty tile.
- Do not render Shorts, Sweatpants, or future live category slugs until a later
  ticket explicitly approves their imagery and homepage presentation.
- Do not show a category empty-state message because the three supported
  audience tiles are always present.

### Category Imagery

- Generate one coordinated 4:5 asset for each approved tile and store only the
  optimized final WebP files under `public/assets/marketplace/categories/`:
  - `audience-women.webp`;
  - `audience-men.webp`;
  - `audience-kids.webp`;
  - `category-dresses.webp`;
  - `category-sportswear.webp`.
- Generate at approximately 1024x1280 and optimize each final file to no more
  than approximately 180KB when visual quality permits. Do not commit unused
  source variants.
- Match the 0049b hero set: casual contemporary fashion, approachable European
  wholesale-market context, natural daylight, warm neutrals, and unbranded
  styling. Avoid runway luxury, dark atmospheric treatment, text, watermarks,
  trademarks, home decor, ceramics, and furniture.
- Use an age-appropriate clothing rack, display, or flat lay for the Kids tile;
  do not require an identifiable child model.
- Treat tile imagery as decorative because the visible label owns the meaning.
  Use empty alternative text, lazy loading, and fixed width/height attributes.
- Map assets to approved audience values and category slugs in presentation
  code. Do not add a category image column, database-managed asset record, or
  administrator workflow.
- Use a stable 4:5 image region, restrained 6px to 8px rounding, a subtle
  readability overlay, and a lower-left white label with sufficient contrast.
- On an absent or failed static image, retain the muted image region and show
  the visible tile label without a broken-image icon or fabricated copy.

### Responsive Category Layout

- Use two columns below 768px, three columns from 768px through 1023px, and five
  columns at 1024px and above.
- Keep tile dimensions and gaps stable. Long translated labels must wrap within
  the overlay and must not resize or overflow the grid.
- Give every tile a visible focus treatment and at least a 44px practical
  interaction area.

## Featured Suppliers

### Supplier Data Contract

- Extend `list_public_featured_sellers(text, integer)` with:
  - `primary_category_slug text`;
  - `primary_category_name text`.
- Populate both values through a left join from `sellers.primary_category_id`
  to `categories`. Preserve the existing audience filtering, ordering, limit,
  security mode, grants, and all existing return fields.
- Add a new forward-only migration. Because PostgreSQL cannot change a
  function's table return type with `CREATE OR REPLACE FUNCTION`, explicitly
  replace the existing signature in the migration and restore its execute
  grants.
- Regenerate the Supabase TypeScript types and update focused migration and
  catalog-function tests for the expanded response.
- Use the returned category slug and fallback name with
  `getPublicCategoryLabel`. Do not infer a seller's category from the separate
  audience-navigation category array.
- Omit the category text when either the seller has no primary category or no
  category row resolves. Do not fabricate a fallback category.

### Supplier Presentation

- Keep the existing translated `Featured suppliers` heading, supporting label,
  and seller-empty copy in EN, PL, DE, and VI.
- Render every seller returned by the existing featured-seller response. Do not
  reorder, truncate, supplement, or combine it with the navigation seller
  response in the browser.
- Use image-led cards with a stable 16:9 media region, restrained 6px to 8px
  rounding, and minimal framing. Do not nest cards.
- Use this live image hierarchy:
  1. cover image when present and loadable;
  2. centered, contained seller logo on the muted media surface when the cover
     is absent or fails;
  3. the stable muted media surface when neither image is present or loadable.
- Treat cover and logo images as decorative because the visible seller name
  labels the linked card. Use empty alternative text and lazy loading.
- Show the live seller name and location. Join city and country only when each
  value is present; do not leave leading punctuation or empty metadata rows.
- Show the translated primary category when the expanded live response
  provides it.
- Preserve the existing positive verification behavior: show the translated
  Verified label only when `verified` is true. Do not invent a negative or
  pending status for false values.
- Preserve source capitalization for seller names and locations. Do not repair
  or normalize UAT content in presentation code.
- Make each card one valid storefront link to `/s/$sellerSlug`. Merge the
  current audience into existing search state so language and compatible search
  state are preserved.
- Do not display supplier product counts and do not add View all suppliers
  because no supplier-directory route exists.
- Clamp long seller names and metadata so card dimensions remain stable. Keep
  the full seller name in the link's accessible name.

### Responsive Supplier Layout

- Use one column below 640px, two columns from 640px through 1023px, and three
  columns at 1024px and above.
- Ensure missing images, long translated labels, and sparse metadata do not
  collapse cards, create page-level horizontal overflow, or overlap adjacent
  content.
- Give storefront links visible hover and focus states with a practical minimum
  target size.

## Non-Goals

- An All category image tile.
- Home and Living, home decor, Shorts, Sweatpants, or any other unapproved
  homepage category tile.
- Category-image database fields or administrator asset management.
- Supplier-directory route, View all suppliers, or seller product counts.
- Fake products, suppliers, locations, categories, imagery attributed to live
  sellers, or verification states.
- Changes to category-page, seller-storefront, product-card, process-section,
  or seller-call-to-action presentation.
- Changes to featured-seller selection, audience filtering, ordering, or limit.

## Acceptance Criteria

- [x] Women, Men, and Kids tiles open `/c/fashion` with the selected audience
      while preserving language and compatible search state.
- [x] No duplicate All image tile appears; the header remains the All filter
      control.
- [x] Dresses and Sportswear tiles render only when their exact slugs are in the
      current live navigation response.
- [x] No Home and Living, home-decor, or other unapproved category content
      appears.
- [x] Category imagery forms one optimized casual-fashion set and remains
      stable when an image fails.
- [x] Supplier cards use only the live featured-seller response and valid
      storefront links with preserved language and audience state.
- [x] Supplier cover, logo, and empty-media fallback states preserve the media
      dimensions without broken-image UI.
- [x] Live seller name, location, translated primary category, and positive
      verification state render accurately for present and absent values.
- [x] No supplier product counts or unsupported View all link appear.
- [x] Category and supplier sections use the approved public container and
      remain stable at mobile, tablet, laptop, and wide-desktop widths.
- [x] No database-managed category-image field or administrator workflow is
      introduced.

## Validation

- Add migration tests proving the expanded featured-seller return shape,
  category join, unchanged filtering/order/limit, grants, and anonymous access.
- Update catalog-function tests to prove seller category slug/name values reach
  the marketplace response unchanged.
- Add focused category-discovery tests for all three audience destinations,
  preserved search state, live Dresses/Sportswear filtering, approved order,
  translated labels, missing-image behavior, and exclusion of unsupported
  slugs.
- Add focused supplier-grid tests for live storefront links, preserved search
  state, cover/logo/empty media states, failed images, optional location and
  category metadata, verification true/false, empty response, and absence of
  product counts and View all.
- Update the homepage screen test to prove both components receive the current
  audience and their existing live query responses in the approved order,
  without changing the product rail or later sections.
- Apply the migration to hosted UAT and inspect anonymous responses before live
  browser validation.
- Verify generated category assets visually and check dimensions and optimized
  file sizes.
- Verify EN, PL, DE, and VI; `all`, `women`, `men`, and `kids`; image failures;
  and long content.
- Inspect 390x844 mobile, 768x1024 tablet, 1440x900 13-inch-class laptop, and
  1920x1080 wide-desktop layouts for contrast, wrapping, overlap, and page-level
  horizontal overflow.
- Run focused tests, the complete application test suite, lint, and production
  build.

## Implementation Notes

- Added homepage-owned `MarketplaceCategoryDiscovery` and
  `MarketplaceSupplierGrid` components and replaced only the previous inline
  supplier presentation in `MarketplaceHomeScreen`.
- Generated five coordinated category images with the built-in image-generation
  workflow and optimized them to 1024x1280 WebP assets under
  `public/assets/marketplace/categories/`. Final sizes are approximately 43KB
  to 158KB.
- Added migration `20260829212000_homepage_featured_seller_category_metadata.sql`
  to append primary-category slug/name values to the existing featured-seller
  response without changing its selection behavior.
- Applied the migration to hosted UAT. Anonymous publishable-key calls return
  `fashion` and `Fashion & Apparel` for the three UAT sellers that have a
  primary category.
- Generated hosted public-schema TypeScript output and compared the function
  contract. The two confirmed fields were added to the repository's existing
  generated-file format without accepting unrelated generator-version churn.
- No category-image table field, administrator workflow, supplier-directory
  route, product count, or fake marketplace record was added.

## Verification Results

- Focused 0049e tests: 5 files and 25 tests passed.
- Complete test suite: 222 files and 1,462 tests passed.
- Lint: passed with 13 existing Fast Refresh warnings and no errors.
- Production build: passed with Node 22.13.0.
- Asset inspection: all five files are 1024x1280 WebP images and remain below
  the approximately 180KB target.
- Browser inspection: no page, category-tile, or supplier-card horizontal
  overflow at 390x844, 768x1024, 1440x900, or 1920x1080 in EN, PL, DE, or VI.
- Audience inspection: All and Women render Women, Men, Kids, and live Dresses;
  Men and Kids render only the three audience tiles; Sportswear remains hidden
  because it is absent from live navigation.
- Live supplier inspection: All/Women/Men/Kids return 3/3/2/0 supplier cards;
  Kids renders the translated empty state. The two available covers load, the
  seller without media keeps a stable muted region, and focused tests cover
  cover-to-logo and logo-to-empty failure transitions.
