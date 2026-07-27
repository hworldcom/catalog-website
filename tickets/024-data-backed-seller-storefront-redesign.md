# Ticket 024 - Data-Backed Seller Storefront Redesign

## Status

Implemented locally on 2026-07-18.

## Goal

Bring the information architecture, visual hierarchy, and conversion-focused structure of
`/demo/kesar-textiles` into every real seller storefront at `/s/$sellerSlug`.

The demo is a design reference only. All seller identity, claims, products, categories, contact
details, images, and counts must come from Supabase or an explicit neutral fallback. Do not copy
the demo's hard-coded business data into production storefronts.

## Design Intent

The storefront should feel like a seller-branded wholesale microsite while remaining part of
Bazoria.

Use these structural patterns from the sample:

- seller-branded navigation;
- a large, readable hero over the seller cover image;
- clear catalog, about, and contact sections;
- category-based product discovery;
- repeated but non-intrusive inquiry and WhatsApp actions;
- a seller-specific footer with restrained Bazoria attribution;
- responsive section spacing and typography.

Preserve the existing visual language, design tokens, fonts, and square-cornered component style.
This is not a new theme system.

## Existing Data Mapping

This ticket should use the current schema without adding seller profile columns.

| Storefront element             | Source                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Seller name                    | `sellers.name`                                                                    |
| Brand mark                     | `sellers.logo_url`, falling back to the first character of the seller name        |
| Hero image                     | `sellers.cover_image_url`                                                         |
| Verification badge             | `sellers.verified`                                                                |
| Seller description             | `sellers.about`                                                                   |
| Location                       | `sellers.city` and `sellers.country`                                              |
| Established year               | `sellers.established_year`                                                        |
| Email                          | `sellers.email`                                                                   |
| WhatsApp                       | `sellers.whatsapp`                                                                |
| Catalog                        | Published products belonging to the seller                                        |
| Category names and identifiers | Categories related to the seller's published products                             |
| Category count                 | Number of the seller's published products in that category                        |
| Category image                 | First available cover image from a product in that category                       |
| Product count                  | Number of published products returned for the seller                              |
| Inquiry submission             | Existing `submitLead` server function with `sellerId` and no required `productId` |

Do not infer or display claims such as countries served, export readiness, custom manufacturing,
response time, stock keeping unit count, or business hours unless the schema gains explicit fields
in a later ticket.

## Data Fetching

Extend the seller storefront query so each published product includes the category data required
for grouping:

```text
category id
category slug
category name
```

Requirements:

- continue returning only published sellers and published products;
- preserve the current seller query key and route loader behavior;
- do not add client-side requests per product or per category;
- create a small pure helper that groups products by category and selects the first usable category
  image;
- treat products without a category as catalog products, but do not create a fabricated category
  card for them;
- keep product links and the active `lang` search parameter working.

## Page Structure

### 1. Seller-Branded Header

- Show the seller logo, or a name initial when no logo exists.
- Show the seller name.
- Include anchor navigation for Catalog, About, and Contact when those sections exist.
- Keep the shared language switcher and URL-based language behavior.
- Show a WhatsApp action only when the seller has a WhatsApp number.
- Provide a keyboard-accessible mobile menu.
- Link the seller brand back to the top of the storefront.
- Do not show seller-dashboard or sign-in controls inside this branded header.

### 2. Hero

- Use `cover_image_url` as a full-width background with a contrast-preserving gradient.
- Use a neutral branded background when no cover image exists.
- Show the verification badge only for verified sellers.
- Show seller name, location, established year, and description only when present.
- Provide a working “Browse catalog” action that moves focus or scrolls to the catalog.
- Provide a working “Request a quote” action that moves to the seller inquiry section.
- Provide a direct WhatsApp action only when available.
- Do not render empty labels, placeholder claims, or made-up trust badges.

### 3. Category Discovery

- Render this section only when at least one published product has a category.
- Build category cards from the seller's real product/category data.
- Show the real category product count.
- Use the first product cover image in the category when available.
- Use a neutral visual fallback when no category product has an image.
- Selecting a category filters the catalog in place and then moves to the catalog section.
- Include a clear way to return to all products.

### 4. Product Catalog

- Render all published products returned for the seller.
- Reuse the shared `ProductCard` and price/stock formatting rather than duplicating card logic.
- Keep links to `/p/$productId`.
- Show the current product count and selected category state.
- Preserve the existing empty-catalog message when the seller has no published products.
- Do not label products “featured” or “best selling” without real data supporting that claim.

### 5. About

- Render only when at least one of description, location, or established year is available.
- Use the seller description as the primary content.
- The number of years in business may be derived from `established_year`, but must not be negative
  or displayed for a future year.
- Show only factual values already present in the seller record.

### 6. Seller Inquiry

- Extract the existing product inquiry form into a reusable marketplace component instead of
  maintaining two separate form implementations.
- Product detail inquiries continue sending both `productId` and `sellerId`.
- Storefront inquiries send `sellerId` without a `productId`.
- Keep the existing validation, translations, success state, and error behavior.
- Do not require buyer authentication.
- A quote action must focus or scroll to this form.

### 7. Contact and Footer

- Show available seller email, WhatsApp, city, and country.
- Omit missing contact methods rather than displaying placeholders.
- Include seller name/logo in the footer.
- Include a small “Powered by Bazoria” link back to the marketplace.
- Do not copy the demo address, phone number, business hours, or copyright disclaimer.

### 8. Floating WhatsApp

- Show only when `sellers.whatsapp` is present.
- Normalize the number to digits for the `wa.me` URL.
- Include an accessible translated label.
- Keep the action clear of mobile navigation and other fixed controls.

## Missing-Data Behavior

- No logo: show the seller name initial.
- No cover image: show a neutral hero background with the same readable layout.
- No description: omit descriptive copy and keep the hero compact.
- No categorized products: omit category discovery.
- No products: retain seller information, inquiry, and contact sections with an empty catalog state.
- No WhatsApp: omit all WhatsApp actions while keeping the inquiry form.
- No email: omit email from the contact section.
- Missing optional data must not leave empty cards, headings, separators, or navigation links.

## Component Ownership

- Keep route loading and not-found behavior in `src/routes/s.$sellerSlug.tsx`.
- Keep storefront orchestration in
  `src/features/marketplace/screens/seller-storefront-screen.tsx`.
- Add focused reusable storefront components under `src/features/marketplace/components`.
- Extract the existing product inquiry form from
  `src/features/marketplace/screens/product-detail-screen.tsx` into a shared marketplace component.
- Continue using shared components and helpers from `src/components` and `src/lib`.
- Do not move the demo route into production code or grow the production route into a single
  demo-sized file.

## Search, Metadata, and Routing

- Keep `/s/$sellerSlug` working without redirects.
- Keep this screen compatible with the future hostname resolution in Ticket 020.
- Continue returning controlled not-found behavior for missing or unpublished sellers.
- Use the real seller name and description for page metadata when loader data is available.
- Preserve the active language search parameter across internal product and marketplace links.
- Anchor navigation must account for the sticky header.

## Accessibility and Responsive Behavior

- Use semantic header, navigation, main sections, headings, and footer landmarks.
- Keep one page-level `h1`.
- Provide useful image alt text for seller logos and products; decorative hero imagery may use an
  empty alt attribute.
- Ensure the hero text remains readable over very light and very dark cover images.
- All actions must have visible keyboard focus and usable touch targets.
- Mobile navigation must expose expanded state and an accessible label.
- Avoid horizontal overflow with long seller names, translated copy, and contact values.
- Verify the page at approximately 390 px, 768 px, and 1440 px widths.

## Implementation Slices

Implement in small reviewable slices:

1. Extend the seller query and add tested product-category grouping helpers.
2. Build the seller-branded header and hero with missing-data fallbacks.
3. Add category discovery and the real product catalog.
4. Extract and reuse the inquiry form.
5. Add about, contact, seller footer, and conditional floating WhatsApp.
6. Complete translations, metadata, accessibility, and responsive validation.

## Out of Scope

- Copying hard-coded seller data or claims from `/demo/kesar-textiles`.
- Reusing demo-only phone numbers, addresses, product counts, images, or products.
- Adding new seller profile or capability fields.
- A seller-controlled page builder.
- Per-seller fonts, colors, themes, or arbitrary layout customization.
- Custom seller domains or subdomain routing from Ticket 020.
- Product-detail redesign.
- Product image cleanup or replacement for existing sample records.
- Search, pagination, or price-range filtering.
- Multiple product images, image optimization, or thumbnail generation.

## Acceptance Criteria

- `/s/$sellerSlug` uses the seller-branded structure described in this ticket.
- The demo route remains a design reference and is not imported by the production storefront.
- Every seller-specific value shown on the page comes from current Supabase data or a documented
  neutral fallback.
- No unsupported business claims from the demo appear on production storefronts.
- Seller logo, cover image, verification, description, location, established year, email, and
  WhatsApp render conditionally.
- Real product categories are grouped without per-product client requests.
- Category selection filters the real seller catalog and can be reset.
- Real published products link to their existing product-detail pages.
- Storefront inquiries create seller-level leads without requiring a product or buyer account.
- Product-detail inquiries continue working after the inquiry form extraction.
- Missing optional data does not leave broken or empty sections.
- Storefronts with no published products retain a useful seller and inquiry experience.
- Internal navigation preserves the active language.
- The layout is usable without horizontal overflow at mobile, tablet, and desktop widths.
- Visible copy is available in English, Polish, German, and Vietnamese.
- Focus order, mobile navigation, anchor navigation, and external contact actions are keyboard
  accessible.
- Focused tests cover category grouping, year derivation, missing-data behavior, and inquiry input
  differences.
- `npm run lint:node22` passes with no new errors.
- `npm run test:node22` passes.
- `npm run build:node22` passes.

## Validation Notes

Validate at least these data states:

1. A complete seller with logo, cover, categorized products, email, and WhatsApp.
2. A minimal published seller with no images, description, email, WhatsApp, or categorized
   products.
3. A published seller with no published products.
4. A seller with a long name and translated German or Vietnamese copy.
5. Category selection, reset, product navigation, inquiry success/error states, and WhatsApp links.

Compare the finished page with `/demo/kesar-textiles` for hierarchy and section rhythm, not for
literal content parity.

## Implementation Notes

- `getSellerPage` now returns each published product's category identifier,
  slug, and name in the existing seller query.
- `seller-storefront.ts` owns pure category grouping, filtering, established
  year, seller initial, and WhatsApp URL helpers.
- The production storefront now uses focused seller header, hero, category,
  catalog, about, inquiry, contact, footer, and floating WhatsApp components.
- All seller-specific content comes from the existing seller and published
  product records. The demo route is not imported by the production route.
- The product inquiry was extracted into a shared form. Product pages retain
  `productId` and `sellerId`; storefront submissions send `sellerId` without a
  product identifier.
- Seller loader data now supplies the production route's title, description,
  and optional Open Graph cover image.
- Runtime validation exposed a Ticket 023 warmup-order regression that could
  prevent hydration. `vite.config.ts` now gates the first request until the
  sequential server-function warmup and dependency crawl are complete.

## Completed Validation

- `npm run test:node22`: 30 tests passed across 7 files.
- `npm run lint:node22`: passed with 0 errors. The 12 existing Fast Refresh
  warnings remain in untouched shared user-interface and translation files.
- `npm run build:node22`: passed with the Vercel Node 22 output. The existing
  large-chunk advisory remains.
- Verified `/s/kesar-textiles?lang=EN` against live Supabase data at 1440 px,
  500 px, and 390 px widths with no horizontal overflow.
- Verified a full storefront capture including category discovery, catalog,
  factual about statistics, seller-level inquiry, contact details, footer, and
  conditional WhatsApp actions.
- Verified category select/reset, catalog-heading focus, mobile menu
  expansion, and `lang=EN` preservation on product links in a hydrated browser.
- Verified `/s/sports?lang=DE` at 390 px, including uploaded seller logo,
  translated quote copy, and no horizontal overflow.
- Verified the shared inquiry on a real product page hydrates, retains the
  product-specific initial message, and shows client validation without
  submitting test lead data.
- Verified the real seller metadata renders in the server response.
- The current Supabase project has no published minimal seller or published
  seller without products, so those exact live route states were not created
  or mutated for validation. Pure helper tests cover missing logo, invalid or
  absent WhatsApp, absent and future established years, uncategorized products,
  and catalog filtering; the screen conditionally omits unavailable sections.
