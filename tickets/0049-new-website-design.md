# Ticket 0049: Public Homepage and Join Page Redesign

## Status

Approved parent design brief as of 2026-08-28. This ticket defines the shared
direction and must be split into small implementation tickets before code work
starts.

## Goal

Redesign the existing Bazoria marketplace homepage and Join page with a casual,
editorial fashion-marketplace presentation while preserving the application's
real data, routes, translations, accessibility, and business behavior.

The result should feel approachable and product-led rather than like a software
marketing page. It should use warm neutral surfaces, strong black typography,
restrained orange accents, generous whitespace, and image-led hierarchy.

## Design Reference

The approved mockup is a visual reference, not a page specification to copy
one-to-one.

Use it to guide:

- overall composition and visual hierarchy;
- header proportions and restraint;
- warm ivory, black, white, and orange balance;
- editorial image placement;
- section spacing;
- minimalist product and category presentation;
- soft borders and limited corner rounding.

Do not copy illustrative content or unsupported behavior from the mockup. The
application's terminology, live data, routes, and existing feature semantics
take precedence.

Specifically, do not copy:

- fake products, prices, suppliers, or testimonials;
- Home and Living products or categories;
- the ceramic vase or other home-decor imagery;
- favorite or wishlist controls;
- buyer registration behavior that does not exist;
- mockup wording that conflicts with the current translated product language;
- a shortened Join page that removes approved Bazoria content.

## Scope

- Shared public header and marketplace navigation visual treatment.
- Marketplace homepage layout and presentation.
- Homepage hero and generated editorial imagery.
- Homepage product, category, supplier, process, and seller-call-to-action
  sections.
- Join page layout and presentation.
- Responsive behavior for the affected public surfaces.
- Focused data-contract additions required by visible homepage metadata.

## Non-Goals

- Redesigning seller storefronts, product detail pages, category pages, seller
  dashboards, or administrator panels.
- Adding checkout, payments, buyer accounts, favorites, popularity analytics, or
  a supplier-directory route.
- Implementing `New this week`; that work belongs to ticket 0050.
- Adding category-image management to the database or administrator panel.
- Replacing existing authentication, audience filtering, or navigation logic.

## Brand and Typography

- Use the full lowercase `bazoria.` wordmark in the desktop header.
- Keep the supplied square `b.` artwork for the favicon and other genuinely
  constrained icon contexts.
- Do not restore the boxed `B` logo.
- Use Bodoni Moda for display headings through the existing `font-display`
  token.
- Use Inter for body copy, navigation, buttons, forms, metadata, and other
  interface text through the existing `font-sans` token.
- Do not apply the display serif indiscriminately to compact interface controls.

## Color and Surface Direction

Use the existing public semantic design tokens and express any adjusted values
in OKLCH in `src/styles.css`.

The target visual relationship is:

- warm ivory page background;
- white primary surfaces;
- subtle warm secondary surfaces;
- near-black primary text;
- quiet warm-gray secondary text and borders;
- orange primary actions, links, small labels, and selected accents.

Orange is an accent, not a section background. Avoid large saturated orange
areas and avoid adding one-off hexadecimal colors inside components.

Cards should generally use 6px to 8px corner radii. Do not make the interface
excessively rounded and do not place cards inside cards.

## Public Layout

- Increase the affected public-page content width to a maximum of approximately
  1320px.
- Use responsive horizontal padding equivalent to 20px on mobile, 24px on
  tablet, and 32px on wide screens.
- Use approximately 72px to 96px between major desktop sections, 56px to 72px
  on tablet, and 40px to 56px on mobile.
- Keep fixed-format image regions stable with explicit aspect ratios to avoid
  layout movement.

## Shared Header

### Desktop

Use three restrained horizontal bands:

1. Full wordmark on the left; language choices and Sign in on the right.
2. All, Women, Men, and Kids audience controls on the left; Join Us on the
   right.
3. Clothing and Sellers navigation triggers.

Preserve:

- sticky positioning;
- language search parameters;
- All, Women, Men, and Kids audience state;
- Clothing and Sellers panel data;
- keyboard and pointer interaction;
- Join and authentication destinations.

Visual treatment:

- warm ivory or white background;
- subtle separators;
- black Sign in action with white text;
- orange-outlined Join Us action;
- selected language with black background and white text;
- quiet unselected languages;
- minimum 44px interaction targets.

### Mobile

Retain and restyle the current responsive navigation rows for the first redesign
slice. Do not introduce a new drawer or hamburger interaction in ticket 0049.

A compact mobile drawer requires a separate design and implementation ticket
covering its contents, open state, focus containment, Escape behavior, outside
click behavior, route-change closing, and body scroll locking.

## Homepage Hero

### Layout

Desktop uses an approximately 48/52 two-column composition:

- left: eyebrow, headline, description, two actions, and three trust points;
- right: a stable three-image editorial composition.

Tablet may retain two columns where the content remains readable. Mobile stacks
copy, actions, imagery, and trust points in that order.

### Copy and Actions

Retain the existing translated Bazoria message and direct-contact business
positioning. Do not imply checkout or marketplace-managed transactions.

Use exactly two hero actions:

1. `Browse products`, linking to the fashion catalog while preserving language
   and audience state.
2. `Join the network`, linking to the Join page while preserving language and
   audience state.

The seller-specific account action remains available in the later seller call
to action.

### Trust Points

Add three compact, unframed trust points beneath the hero actions:

- Real suppliers;
- Direct contact;
- Global reach.

Each uses a small Lucide icon, a short heading, and one supporting line. Add
translations for all supported languages. Do not render them as cards.

## Generated Editorial Imagery

Generate equivalent fashion-focused assets rather than copying or extracting
images from the mockup.

### Hero Set

Generate three coordinated images:

1. Casual wholesale clothing rack or approachable showroom, wide composition.
2. Adult woman in casual contemporary clothing, vertical composition.
3. Casual fashion accessory such as a handbag, shoes, or garment detail,
   vertical composition.

### Style

- casual and approachable rather than luxury runway fashion;
- contemporary European wholesale-market context;
- natural daylight and warm neutral tones;
- simple real-world styling;
- commercially usable editorial composition;
- no visible trademarks, brand marks, watermarks, or embedded text;
- no home decor, ceramics, furniture, or unrelated lifestyle objects;
- no dark atmospheric treatment that obscures the subject.

The three hero images should feel like one photographic set. They may be treated
as decorative when the adjacent text already conveys the content.

### Asset Handling

- Store final optimized assets under `public/assets/marketplace/`.
- Prefer WebP output at suitable desktop resolution.
- Preserve stable aspect ratios in markup.
- Load hero images eagerly and assign high fetch priority only to the primary
  above-the-fold image.
- Lazy-load category imagery and content below the fold.

## Homepage Product Section

Keep the current `Trending this week` section and current trending feed during
ticket 0049. Do not relabel the manually curated trending feed as new products.
Ticket 0050 owns a future `New this week` feed.

Requirements:

- Use live database products only.
- Preserve product detail links, images, prices, quote state, currency, minimum
  order quantity, pack size, and stock state.
- Extend the public homepage product feed with `seller_name` and `seller_slug`.
- Display the seller name below the product name.
- Do not add a favorite or heart control.
- Use an editorial homepage variant of the shared product card so category and
  seller pages are not silently redesigned by this ticket.
- Make the image dominant with a stable 4:5 or agreed source-compatible aspect
  ratio and subtle image scaling on hover.
- Remove heavy card framing.

Present all returned products in a responsive, keyboard-accessible horizontal
scroll-snap rail:

- approximately five visible cards on wide desktop;
- approximately three visible cards on tablet;
- approximately two visible cards on mobile;
- no automatic movement;
- accessible previous and next controls where controls are shown.

`View all` may link to the fashion catalog while preserving language and
audience state.

## Homepage Categories

Add an `Explore categories` section after the product rail.

The initial presentation set is:

- Women;
- Men;
- Kids;
- Dresses, when present in the supported taxonomy;
- Sportswear, when present in the supported taxonomy.

Behavior:

- Women, Men, and Kids update the marketplace audience selection.
- Dresses and Sportswear link to their actual category routes and preserve the
  current audience and language.
- Do not render a category route that is absent from the live supported
  navigation data.
- Do not add Home and Living or unsupported categories.

Use generated casual fashion imagery stored as versioned static assets and map
those assets to the approved audience/category slugs in presentation code. Do
not add a category image column or administrator workflow in this ticket.

Category images should use stable aspect ratios, a subtle readability overlay,
and lower-left white labels. They must not imply fake products or suppliers.

## Homepage Suppliers

Retain a live-data supplier section titled `Discover suppliers` or the existing
translated equivalent.

- Use dynamically returned seller data.
- Show cover image, seller name, location, primary category when available, and
  existing verification state.
- Preserve seller storefront links, language, and audience state.
- Do not display product counts in the initial redesign.
- Do not add a `View all suppliers` link because no supplier-directory route
  currently exists.
- Use image-led cards with restrained framing and no nested cards.

## Homepage Process Section

Retain the existing three-step Browse, Inquire, and Deal behavior, but present it
as one wide soft-background section rather than three heavy cards.

The copy must continue to explain that buyers browse catalogs, meet suppliers,
and contact them directly. Do not imply Bazoria checkout.

## Homepage Seller Call To Action

Retain the seller call to action near the bottom of the homepage.

- Use a soft peach or orange-tinted neutral surface.
- Keep the existing translated seller message.
- Keep the real seller account destination.
- Do not use a dark software-marketing banner.

## Join Page

The mockup provides visual direction for the Join page but does not replace the
approved content architecture.

Retain:

- seller and buyer positioning;
- seller benefits;
- seller onboarding steps;
- buyer benefits;
- direct-connection process;
- independent-business trust messaging;
- final seller and catalog actions.

Use `buyers` and `sellers` as application concepts. Retailers may be described
as members of the buyer audience, but do not introduce a new retailer account
type.

### Join Hero

- Use a centered editorial composition inspired by the reference.
- Use a very subtle warm-peach background treatment.
- Keep the translated seller/buyer network message.
- Provide seller and buyer jump actions with valid 44px targets.
- Do not use a large solid orange hero.

### Audience Panels

Introduce two prominent panels immediately after the hero:

- For buyers: discover suppliers, browse catalogs, and contact directly.
- For sellers: create a catalog, share products, reach buyers, and retain direct
  relationships.

Buyer action: `Browse products`.

Seller action: `Create seller account`.

Do not use `Join as Retailer`, because a buyer account is not currently
required.

### Remaining Join Sections

Restyle the existing detailed sections using the same whitespace, typography,
soft surfaces, and limited borders as the homepage. Preserve all real links and
translated content.

Do not remove existing seller benefits, buyer benefits, onboarding, connection,
or trust content merely because the desktop mockup is shorter.

## Data Contract Decisions

### Required For 0049

Extend the public homepage product read model with:

- `seller_name`;
- `seller_slug`.

Implement this through the existing public database-read boundary with a
migration, generated Supabase type updates, and focused permission/filtering
tests. Do not infer seller names from the featured-seller response because that
response may not contain every product seller.

### Explicitly Deferred

- Newest-products feed: ticket 0050.
- Supplier product counts.
- Category image database fields or management.
- Supplier directory and `View all suppliers` destination.
- Favorites or wishlist persistence.
- Mobile navigation drawer.

## Internationalization

- Preserve `?lang=EN`, PL, DE, and VI behavior.
- Add translations whenever visible copy changes.
- Keep language and audience search parameters on all new or restyled links.
- Do not hardcode English-only public copy in components.

## Accessibility

- Preserve semantic heading order.
- Preserve keyboard behavior for audience, Clothing, and Sellers navigation.
- Provide visible focus states.
- Keep all controls at least 44px by 44px where practical.
- Provide accessible names for icon-only carousel controls.
- Use empty alternative text for genuinely decorative editorial imagery.
- Provide meaningful alternative text for data-driven product and seller images.
- Do not communicate stock, verification, or selection through color alone.

## Responsive Behavior

### Desktop, 1024px And Above

- three-band header;
- two-column hero;
- approximately five product cards visible in the rail;
- five category tiles where space permits;
- image-led supplier presentation;
- two-column benefit layouts;
- horizontal three-step processes.

### Tablet, 768px To 1023px

- two-column hero only while copy and images remain readable;
- approximately three product cards visible;
- three category columns;
- two-column audience and benefit layouts where viable.

### Mobile, Below 768px

- retain the existing responsive navigation model without a new drawer;
- stack hero copy, actions, images, and trust points;
- approximately two product cards visible in the horizontal rail;
- two category columns;
- one-column Join audience panels and benefits;
- vertical process steps;
- no horizontal page overflow outside intentional scroll rails.

## Implementation Slices

Implementation is split into these child tickets:

1. `0049a-public-design-foundations-and-header.md`
2. `0049b-casual-fashion-homepage-hero.md`
3. `0049c-homepage-product-seller-metadata.md`
4. `0049d-editorial-homepage-product-rail.md`
5. `0049e-homepage-categories-and-suppliers.md`
6. `0049f-homepage-process-and-seller-cta.md`
7. `0049g-join-page-redesign.md`
8. `0049h-public-redesign-responsive-accessibility-qa.md`

Recommended sequence:

`0049a -> 0049b -> 0049c -> 0049d -> 0049e/0049f -> 0049g -> 0049h`

`0049c` may be prepared in parallel with `0049b` because it owns an isolated
database read-model change. `0049e` and `0049f` may be implemented in parallel
after the shared foundation is stable.

Do not implement all slices in one change.

## Acceptance Criteria

- [ ] The mockup is used as visual direction rather than copied content.
- [ ] The desktop header uses the full lowercase wordmark and three restrained
      bands.
- [ ] Existing navigation, language, audience, authentication, and Join behavior
      still work.
- [ ] Mobile navigation remains functional without introducing an undefined
      drawer.
- [ ] The homepage hero uses three coordinated, casual fashion-focused generated
      images.
- [ ] No home-decor or unsupported category imagery appears.
- [ ] The homepage uses live product and seller data.
- [ ] The current Trending feed remains honestly labeled during ticket 0049.
- [ ] Product cards can display their actual seller name.
- [ ] No fake favorite control is introduced.
- [ ] Category tiles use approved audience links and supported category routes.
- [ ] Supplier product counts and `View all suppliers` are omitted.
- [ ] The existing direct-contact, no-checkout behavior remains accurate.
- [ ] The Join page retains approved seller, buyer, onboarding, connection, and
      trust content.
- [ ] Buyer actions do not imply that buyer registration is required.
- [ ] All changed public copy supports EN, PL, DE, and VI.
- [ ] Mobile, tablet, and desktop layouts have no incoherent overlap or overflow.
- [ ] Keyboard navigation and visible focus states remain functional.

## Validation

- Add focused component tests for each implementation slice.
- Add migration and server-function tests for product seller metadata.
- Run the full relevant test suite, `npm run lint`, and `npm run build` after each
  slice.
- Inspect the affected pages at representative mobile, tablet, 13-inch laptop,
  and wide-desktop viewports.
- Verify generated image rendering, aspect ratios, lazy/eager loading behavior,
  and layout stability.
- Verify all four languages, all audience states, keyboard navigation, empty
  data, partial image data, and image-load failure states.
