# Ticket 0041: Public Join The Wholesale Network Page

## Status

Implemented on 2026-08-15. Automated tests, lint, the production build, and
responsive browser inspection passed. Lint retains the repository's existing
13 Fast Refresh warnings and no errors.

## Ownership

- Repository: `catalog-website`
- Product area: public marketplace and seller acquisition
- Route: `/join`
- Route owner: `src/routes/join.tsx`
- Screen owner: `src/features/marketplace/screens/join-network-screen.tsx`

The page belongs to the marketplace feature because it explains the public
buyer and seller network. It is not an authenticated seller, administrator, or
classifier workflow. The route file should own route metadata and search
normalization, while the marketplace screen should own the page content.

## Objective

Add a public, localized page that explains why wholesalers and professional
buyers use Bazoria without presenting the product as a generic sign-up page or
promising capabilities that are not yet available.

The central position is:

> Bringing Europe's traditional wholesale centres online.

Bazoria complements existing wholesale relationships: sellers publish a
structured catalogue, buyers discover products and suppliers, and both sides
continue the conversation or transaction in the way that works for them.

## Placement And Discovery

- Add a localized `Join Us` direct link to the existing
  `MarketplaceNavigation` audience row; it is navigation, not another
  disclosure panel.
- Keep Women, Men, and Kids grouped at the left and place Join Us at the far
  right of that same row on desktop.
- On mobile, keep Join Us in the same horizontally safe row as Women, Men, and
  Kids. The row may scroll horizontally when translated labels require more
  space, but no label may be clipped or forced into a narrow column.
- Keep Clothing and Sellers in their existing row below the audience and Join
  Us controls. Do not add another header row.
- Differentiate the audience and Join Us row from the Clothing and Sellers row
  with a subtle secondary-background band and bottom divider. Keep the lower
  row on the standard navigation background.
- Keep the link available on the marketplace home, category, seller, product,
  and `/join` pages wherever `MarketplaceNavigation` is rendered.
- The link preserves the current `lang` and `audience` search values.
- Render `/join` inside `PublicShell` with the normalized marketplace audience
  so Clothing and Sellers navigation remains available on the page.
- Prefetch the audience-navigation query in the route loader, following the
  other public marketplace routes.
- Keep the lower homepage seller banner's direct account-creation action; that
  banner already provides seller context before authentication.
- Keep the marketplace homepage's existing headline and Browse products
  action. Rename the second hero action from `List your catalog` to
  `Sell on Bazoria` and link it to `/join#for-sellers`, preserving `lang` and
  the normalized `audience`.
- Keep `Join the network` as the third hero action, linking to the top of
  `/join` while preserving `lang` and the normalized `audience`.
- Remove the redundant `Are you a wholesaler?` prompt from the homepage hero;
  the Sell on Bazoria action already communicates the seller path.

## Page Structure And Source Copy

### 1. Hero

- Kicker: `Bringing Europe's traditional wholesale centres online.`
- Heading: `Join the Wholesale Network`
- Lead: `More visibility for sellers. Easier sourcing for buyers.`
- Supporting copy should explain that Bazoria connects wholesalers and
  professional buyers across Europe, online and offline.
- Provide two in-page links:
  - `I'm a seller` moves focus to `#for-sellers`.
  - `I'm a buyer` moves focus to `#for-buyers`.

These are section-navigation links, not role selection and not account
creation controls.

### 2. Seller Benefits

Heading: `Show more. Send less. Reach further.`

Present a concise set of benefits grounded in current product behavior:

1. Create a structured, branded catalogue with published product information
   and images.
2. Share a seller catalogue or individual product link through WhatsApp,
   Facebook, Instagram, Messenger, or another channel.
3. Turn a shared product link into a path through the product page and the
   seller's wider catalogue.
4. Reach professional buyers beyond the seller's existing contact list through
   marketplace discovery.
5. Keep direct control of prices, branding, customer relationships, and the
   preferred way of trading.

Emphasize these supporting lines without repeating all of them as separate
sections:

- `Upload once. Share everywhere.`
- `Keep WhatsApp. Make it work better.`
- `Your customers remain your customers.`

The sharing claim means sharing Bazoria web links. It must not imply automatic
publishing or synchronization with social-media accounts.

After the seller benefits, show a compact `Start selling in three steps`
explanation before the account action:

1. Create an account through Google or email and password.
2. Set up the seller profile with company and storefront information.
3. Build the catalogue by uploading products and preparing them for
   publication.

Then provide `Create seller account` as the explicit next step to `/auth`,
preserving `lang`. Do not promise instant publication, a fixed approval time,
or an exact setup duration.

### 3. Buyer Benefits

Heading: `Discover more. Search faster. Source closer.`

Present benefits that work without a buyer account:

1. Discover products and wholesalers beyond existing personal contacts.
2. Browse current published catalogues and new products in one marketplace.
3. Review products before travelling, then contact the seller directly by
   inquiry or WhatsApp.
4. Find suppliers closer to the buyer's market, supporting shorter lead times,
   local pickup, easier replenishment, or physical inspection when offered by
   the seller.

Do not describe following sellers, alerts, personalized feeds, saved products,
or order history as current behavior.

### 4. How The Network Works

Show one simple three-step sequence:

1. A seller publishes products to a branded catalogue.
2. A buyer discovers a product or supplier through Bazoria.
3. The buyer contacts the seller and they trade online, through WhatsApp, or at
   a physical showroom.

Use the supporting line:

> Browse online. Trade however works for you.

### 5. Independent Businesses

Heading: `One Network. Independent Businesses.`

Explain that sellers keep their identity, catalogue, branding, prices,
customers, and business relationships. Buyers gain a common place to discover
published products and suppliers. Do not imply that Bazoria mediates every
transaction.

### 6. Final Actions

- Seller action: `Sell on Bazoria`, linking to `/auth` and preserving `lang`.
  The existing authentication page owns seller account creation.
- Buyer action: `Browse products`, linking to `/c/fashion` and preserving the
  current `lang` and normalized `audience`.

Do not offer `Join as a buyer`; Bazoria does not currently provide buyer
accounts.

## Content Integrity

The page may describe only shipped behavior. The following original vision
items remain future product ideas and must not be presented as available:

- buyer accounts, supplier follows, alerts, or new-arrival notifications;
- personalized product feeds, favorites, saved products, or order history;
- seller analytics, product-view reporting, traffic sources, or buyer
  geography;
- automatic publishing or synchronization to social networks;
- platform checkout, logistics, or managed ordering;
- automatic availability, reservation, or restock updates;
- multilingual product content unless the published product actually exposes
  the supported language.

Future capabilities can be added to this page only after their implementation
ticket is delivered. Avoid labels such as `Coming soon` in this slice.

## Interface Requirements

- Preserve Bazoria's existing typography, colors, borders, spacing, and dark
  public-marketplace visual language.
- Reuse `PublicShell`, marketplace navigation, shared design tokens, and
  existing button/link treatments.
- Prefer a clear editorial layout with a hero, bounded benefit groups, the
  three-step sequence, a trust section, and final actions. Avoid rendering the
  original long brief as a wall of cards or text.
- Do not add a new design system, global stylesheet, image dependency, content
  management system, or server data model.
- The first slice does not require custom illustrations or photography.
- Use one page-level heading, semantic section headings, meaningful landmarks,
  visible keyboard focus, and in-page targets that do not hide headings behind
  the sticky header.
- Keep content readable and navigation usable at mobile and desktop sizes.

## Localization

- Localize all visible page copy and the `Join Us` navigation label in English,
  Polish, German, and Vietnamese through the existing `t` and `tr` contract.
- Preserve the selected language in all route and in-page navigation.
- English source copy above defines the meaning; translations may read
  naturally but must not introduce stronger product claims.

## Route Metadata

Add route-specific metadata that describes Bazoria's wholesale network and the
seller/buyer value proposition. Include a page title, description, Open Graph
title and description, and Twitter card metadata consistent with the public
routes. Metadata must not claim unimplemented buyer-account or transaction
features.

## Non-Goals

- Changing authentication or seller onboarding behavior.
- Adding buyer registration or authenticated buyer features.
- Implementing any future capability listed under Content Integrity.
- Changing product, seller, inquiry, or classifier persistence.
- Redesigning the marketplace home, seller storefront, or product pages.
- Replacing existing seller-account actions with the Join Us page.
- Adding tracking or analytics merely to measure this page.

## Dependencies

- Implemented ticket `0039c-responsive-clothing-and-seller-navigation`.
- Existing `PublicShell`, marketplace audience normalization, audience
  navigation query, localization helpers, `/auth`, and `/c/$category` routes.

## Acceptance Criteria

- `/join` renders as a public marketplace page without requiring a session.
- On desktop, the marketplace navigation exposes Join Us at the far right of
  the row that contains the left-aligned Women, Men, and Kids controls.
- On mobile, Join Us remains in the Women, Men, and Kids row with an appropriate
  touch-target height and safe horizontal scrolling for long translations.
- Clothing and Sellers remain together in the row below.
- The audience and Join Us row has a subtle secondary-background band and
  divider that distinguishes it from the Clothing and Sellers row without
  changing the existing navigation hierarchy.
- Join Us is a direct link rather than an expandable menu and indicates the
  current page accessibly.
- The page preserves normalized `audience` and `lang` behavior.
- Seller and buyer hero links reach the correct page sections with keyboard
  focus remaining understandable.
- The seller action opens `/auth`; the buyer action opens the selected
  audience's Fashion catalogue.
- All visible copy is available in English, Polish, German, and Vietnamese.
- The page describes only currently supported product behavior.
- The layout has no horizontal overflow and remains readable at supported
  mobile and desktop breakpoints.
- Existing marketplace navigation and homepage actions continue to work.
- The marketplace homepage hero keeps Browse products first, routes Sell on
  Bazoria second to `/join#for-sellers`, and keeps Join the network third to
  `/join`.
- The seller-benefits section exposes Create seller account to `/auth` after
  explaining the seller value proposition.
- The seller-benefits section explains the three account, profile, and
  catalogue-preparation steps immediately before the account action.

## Validation Notes

- Add a screen test for the semantic heading structure, seller and buyer
  sections, final action destinations, and absence of unsupported feature
  claims.
- Extend marketplace-navigation tests for link order, localization, preserved
  search values, and accessible current-page state.
- Add a route-level test if needed for audience normalization, navigation-query
  prefetching, or metadata.
- Manually inspect `/join` at mobile and desktop sizes in every supported
  language, including long German copy.
- Run `npm run test:node22`, `npm run lint:node22`, and
  `npm run build:node22`.

## Implementation Notes

- Added the public `/join` route with normalized audience loading,
  audience-navigation prefetching, and route-specific search and social
  metadata.
- Added the marketplace-owned Join Network screen with localized English,
  Polish, German, and Vietnamese seller, buyer, network, trust, and final-action
  content.
- Added Join Us as a direct marketplace-navigation link in the audience row.
  Women, Men, and Kids remain grouped at the left, Join Us sits at the far
  right, and Clothing and Sellers remain together in the row below.
- Added Join the network as the marketplace homepage hero's third action while
  retaining the existing headline and Browse products action.
- Renamed the second homepage action to Sell on Bazoria and routed it to the
  seller explanation at `/join#for-sellers`. Added Create seller account after
  that explanation as the explicit transition to `/auth`.
- Added a localized three-step seller setup explanation immediately before
  Create seller account, without implying automatic approval or publication.
- Removed the redundant Are you a wholesaler? prompt from the homepage hero.
- Preserved the current language and audience through the Join Us and final
  marketplace links. Seller action continues to use the existing `/auth` flow,
  and buyer action opens the selected audience's Fashion catalogue.
- Added focused screen, navigation interaction, link-preservation, and public
  route-contract coverage. The focused suite passed with 19 tests.
- The full website suite passed with 171 test files and 1,040 tests. Lint passed
  with the existing 13 Fast Refresh warnings and no errors. The Node.js 22
  production build passed.
- Inspected the page at 1,440-pixel desktop and 390-pixel mobile widths in all
  four supported languages. The German compound heading required responsive
  word wrapping; after adjustment every language reported matching viewport
  and document widths with no horizontal overflow.
- The seller-explanation funnel follow-up passed five focused homepage and Join
  page tests, focused lint for all touched implementation files, and the
  Node.js 22 production build. Repository-wide lint was temporarily blocked by
  unrelated formatting errors in concurrently changed product-description and
  seller-moderation files; those files were not changed under this ticket.
- The three-step setup follow-up passed all three focused Join page tests,
  focused lint, and the Node.js 22 production build. Browser inspection
  confirmed the steps render as three columns on desktop and a readable stack
  on mobile, with the account action visually following the explanation.
- The audience-row placement follow-up passed all ten focused navigation tests,
  focused lint, and the Node.js 22 production build. Desktop and mobile
  Vietnamese browser inspection confirmed Join Us shares the Women/Men/Kids
  row while Clothing and Sellers remain together below.
- The navigation-contrast follow-up passed all ten focused navigation tests,
  focused lint, and the Node.js 22 production build. Browser inspection at
  desktop and mobile sizes confirmed the subtle secondary-background band and
  divider distinguish the audience and Join Us row from the lower navigation
  row without changing control placement or behavior.
