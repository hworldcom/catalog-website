# Ticket 0043: Basic Product And Seller Social Sharing

## Status

Implemented locally on 2026-08-24. Automated tests, production build, local
server-rendered metadata checks, and responsive browser checks are complete.
External crawler verification remains pending on the publicly reachable UAT
deployment owned by ticket `0038`; this ticket is not yet UAT-verified.

## Ownership

- Repository: `catalog-website`
- Product area: public marketplace sharing and route metadata
- Routes: `/p/$productId` and `/s/$sellerSlug`
- Route owners: `src/routes/p.$productId.tsx` and
  `src/routes/s.$sellerSlug.tsx`
- Shared interface owner: `src/features/marketplace/components`

## Objective

Let visitors share a published Bazoria product or seller storefront and ensure
that Facebook and other compatible services can render a simple link preview.

The basic preview contains:

- the published product title or seller name;
- the published product cover image or seller storefront cover image;
- a short, generic description of Bazoria.

This slice uses existing public images. It does not generate a branded image
containing text, prices, or other product details.

## User Experience

- Add one reusable share control to the public product page and seller
  storefront.
- Place the product control with the product heading and primary details.
- Place the seller control in the storefront hero or header without crowding
  existing navigation and contact actions.
- Use the Lucide share icon followed by a visible localized `Share` label in
  the trigger. Do not use an icon-only trigger.
- The share control always opens one keyboard-accessible menu so visitors can
  choose a destination consistently across browsers.
- Show the menu actions in this order:
  - Share using another app, only when `navigator.share` is available;
  - Facebook;
  - WhatsApp;
  - Copy link.
- Facebook receives the canonical shared URL. WhatsApp receives the localized
  page title followed by the canonical shared URL.
- Open social-sharing destinations in a new browser tab with
  `noopener noreferrer` and without granting the opened page access to the
  Bazoria window.
- Treat cancellation of the native share sheet as a normal outcome and do not
  show an error toast.
- Confirm a successful Copy link action with the existing toast component.
- Show a localized error toast when native sharing or clipboard access fails
  for a reason other than user cancellation. The menu remains available so the
  visitor can choose Copy link or another destination.
- Preserve supported `lang` and normalized `audience` values in the shared URL
  so the recipient opens the same public browsing context.

The feature shares Bazoria links. It does not publish content to, authenticate
with, or manage an account on any social-media platform.

## Preview Metadata

Render route-specific metadata in the server response so social crawlers do
not depend on client-side JavaScript.

### Product Page

- Title: `{published product title} — Bazoria`.
- Image: `cover_image_url`, falling back to the first published gallery image.
- Description: a concise generic Bazoria description rather than the product's
  long description.
- URL: the absolute public product URL.

The product route loader must return the already-fetched public product payload
so the route `head` function can build metadata without a duplicate fetch.

### Seller Storefront

- Title: `{published seller name} — Wholesale Storefront on Bazoria`.
- Image: the published storefront logo when available, falling back to the
  published storefront cover image.
- Description: the same concise generic Bazoria description.
- URL: the absolute canonical storefront URL after existing slug resolution.

The seller route already emits some dynamic Open Graph metadata. Extend and
normalize that implementation rather than creating a second metadata path.

### Required Tags

- page title and standard description;
- `og:title`, `og:description`, `og:image`, `og:image:alt`, `og:url`, and
  `og:type`;
- `twitter:card`, `twitter:title`, `twitter:description`, and `twitter:image`.

Use `summary_large_image` when a page has a usable social image. Metadata image
and page URLs must be absolute URLs. Use `website` as `og:type` for both routes.
Use the published product title or seller name as `og:image:alt`.

Build deterministic canonical URLs in this form:

```text
{origin}/p/{productId}?lang={language}&audience={audience}
{origin}/s/{canonicalSellerSlug}?lang={language}&audience={audience}
```

Always include both normalized query parameters, including the default `EN`
language and `all` audience. Append `lang` before `audience` for deterministic
output and tests.

## Image Rules

- Only use image URLs belonging to the effective published product or seller
  state. For seller previews, prefer the published logo, then the published
  storefront cover, then the repository-owned fallback image.
- The selected image must be reachable without authentication through a stable
  HTTPS URL in UAT and production.
- Approved seller profile media may use the existing root-relative
  `/v1/public/sellers/.../profile-images/...` delivery route. Resolve that route
  against the validated `BAZORIA_PUBLIC_SITE_URL` before emitting metadata.
  Reject protocol-relative URLs rather than allowing them to select another
  host.
- Never expose private draft, moderation working-copy, classifier, or signed
  temporary image URLs.
- Add one repository-owned, category-neutral Bazoria fallback social image at
  `public/assets/social/bazoria-default.jpg`.
- The fallback is a static 1,200-by-630-pixel JPEG suitable for both light and
  dark social-preview surfaces. It must not contain product-specific, seller,
  price, or description text and must not imply that Bazoria serves only one
  merchandise category.
- Use the absolute public URL of this fallback when the published entity has no
  usable cover or gallery image.
- Do not introduce runtime image generation in this ticket.

## Public Site URL

Add the non-secret server environment variable `BAZORIA_PUBLIC_SITE_URL` for
constructing absolute metadata and share URLs.

- Use the existing server-only `BAZORIA_DEPLOYMENT_ENVIRONMENT` value to decide
  whether the runtime is `local`, `uat`, or `production`. Do not use
  `NODE_ENV` as the Bazoria environment identity.
- Accept only an absolute root origin with no credentials, non-root path,
  query, or fragment. Normalize it to an origin without a trailing slash.
- When `BAZORIA_DEPLOYMENT_ENVIRONMENT` is `uat` or `production`, require an
  explicit HTTPS value. Missing or invalid hosted configuration is a
  configuration error and must not silently derive an origin from request
  headers.
- When `BAZORIA_DEPLOYMENT_ENVIRONMENT` is `local`, local development and
  automated tests may default to `http://localhost:8080` when the variable is
  absent.
- Add the variable and its local value to `.env.example`. Do not add an actual
  UAT or production origin to the repository.
- Return the validated origin through the existing public page read boundary
  and route loader data. Metadata and the visible share control must use that
  same value rather than maintaining separate URL construction paths.
- Do not derive production metadata URLs from an untrusted forwarded host.
- Do not add a secret or store the site origin in the database.

## Localization

- Localize visible share labels, fallback actions, success messages, and
  user-facing errors in English, Polish, German, and Vietnamese.
- Use this generic Bazoria preview description:
  - EN: `Discover wholesale products from real suppliers and contact sellers directly on Bazoria.`
  - PL: `Odkrywaj produkty hurtowe od prawdziwych dostawców i kontaktuj się ze sprzedawcami bezpośrednio na platformie Bazoria.`
  - DE: `Entdecken Sie Großhandelsprodukte von echten Lieferanten und kontaktieren Sie Anbieter direkt über Bazoria.`
  - VI: `Khám phá sản phẩm bán buôn từ các nhà cung cấp thực sự và liên hệ trực tiếp với người bán trên Bazoria.`
- Use the normalized route language for metadata and preserve it in the shared
  URL.

## Data And Security

- No database migration is required.
- No new table, social account credential, Facebook application secret, or
  server-side social API integration is required.
- Existing public product and seller reads remain the source of truth.
- Public metadata must obey the same publication and seller-visibility rules as
  the rendered page.

## Edge Cases

- Missing product cover image falls back to the first public gallery image,
  then to the Bazoria fallback image.
- Missing or unsafe seller logo falls back to the published storefront cover;
  a missing or unsafe cover then falls back to the Bazoria fallback image.
- Copy link remains available when the native share API and external social
  destinations are unavailable.
- Sharing an unpublished, withdrawn, archived, or hidden entity must not
  reveal its title or image; the existing not-found behavior remains in force.
- Metadata remains escaped and valid when titles contain punctuation or
  non-ASCII text.
- Social-platform preview caches may continue showing old metadata until the
  platform refreshes the URL.

## Non-Goals

- Product-specific descriptions, prices, currency, supplier details, or
  category information in the preview.
- Generated social-card images with text overlays.
- Share counters, click analytics, short links, campaign tracking, or database
  persistence.
- Human-readable product slugs.
- Automatic posting or synchronization with social-media accounts.
- Changing product or seller publication workflows.

## Dependencies

- Implemented classifier roadmap tickets `0040f1` through `0040f3`.
- Existing published product and seller public-read contracts.
- Existing durable public product and storefront image URLs.
- Existing localization and toast helpers.
- A publicly reachable UAT application origin from ticket `0038` is required
  for external crawler verification, but does not block local implementation
  and automated validation.

## Acceptance Criteria

- Published product and seller pages expose a localized, keyboard-accessible
  share control at mobile and desktop sizes.
- The share trigger visibly combines the share icon and localized `Share` text.
- The share menu always exposes Facebook, WhatsApp, and Copy link, and
  additionally exposes Share using another app when native sharing is
  supported.
- Copy link copies the expected absolute URL and confirms success.
- Product HTML contains the product title, selected public image, generic
  Bazoria description, and absolute URL in Open Graph and Twitter metadata.
- Seller HTML contains the seller name, preferred published logo or fallback
  public image, generic Bazoria description, and canonical absolute URL in Open
  Graph and Twitter metadata.
- A missing cover image produces the Bazoria fallback image rather than an
  incomplete social card.
- No private or temporary image URL appears in public metadata.
- Existing public navigation, inquiry, publication, and storefront behavior is
  unchanged.
- No database migration is added.

## Validation Notes

- Add focused tests for product metadata with and without cover images and
  seller metadata covering the logo, cover, and repository fallback order.
- Add component tests for native share, cancellation, fallback actions, Copy
  link, keyboard access, and localization.
- Add focused configuration tests for local defaulting, hosted HTTPS
  requirements, origin normalization, and rejection of credentials, paths,
  queries, and fragments.
- Inspect the product and seller layouts at mobile and desktop sizes.
- Verify server-rendered HTML contains metadata before client hydration.
- After UAT deployment, inspect one product and one seller URL with Facebook's
  sharing debugger and at least one other Open Graph consumer.
- Confirm the crawler can fetch the selected images without authentication.
- Do not mark the ticket UAT-verified until the public-origin crawler checks
  pass. Local implementation and automated validation may be recorded
  separately while deployment verification is pending.
- Run `npm run test`, `npm run lint`, and `npm run build`.

## Local Validation Record

Completed on 2026-08-24:

- `npm run test:node22`: 211 test files and 1,367 tests passed.
- `npm run lint:node22`: completed with no errors. The 13 existing Fast Refresh
  warnings remain unchanged; ticket `0043` adds no lint warnings.
- `npm run build:node22`: production build passed with the Node.js 22 runtime.
- Server-rendered product and seller HTML contained the route title, localized
  generic description, Open Graph tags, Twitter tags, absolute canonical URL,
  and selected absolute image URL before hydration.
- The tested published product image and repository fallback image both
  returned HTTP 200 without authentication.
- Product and seller pages were inspected in Chrome at 1,440 by 900 pixels and
  390 by 844 pixels. The icon-and-label share controls were visible without
  text overlap or layout displacement.
- `public/assets/social/bazoria-default.jpg` was verified as a 1,200 by
  630-pixel JPEG without text, logos, people, or category-specific claims.
- No database migration was added.

Still pending:

- Deploy the application origin through ticket `0038`.
- Verify one published product and one published seller URL with Facebook's
  Sharing Debugger and another Open Graph consumer.
- Confirm the deployed crawler can retrieve each selected image without
  authentication, then mark this ticket UAT-verified.

## Estimate

Approximately one engineering day when existing published image URLs are
stable and publicly reachable. External preview verification requires a UAT
deployment and may take additional elapsed time because social platforms cache
metadata.
