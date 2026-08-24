# Ticket 0044: Rich Product And Seller Social Previews

## Status

Implemented locally on 2026-08-24. Focused and full automated tests, lint,
production build, server-rendered metadata checks in all supported languages,
and representative product and seller checks through a public HTTPS temporary
origin are complete. Final visual verification with Facebook's sharing debugger
and another Open Graph consumer remains pending; this ticket is not yet
UAT-verified.

## Ownership

- Repository: `catalog-website`
- Product area: public marketplace route metadata
- Routes: `/p/$productId` and `/s/$sellerSlug`
- Dependency: ticket `0043-basic-product-and-seller-social-sharing`

## Objective

Enrich the basic social previews with concise, published marketplace details
that help a recipient understand the product or supplier before opening the
link.

This ticket enriches metadata text. It does not render the price or description
onto the image. Facebook and other services control their own preview layout
and may omit metadata even when Bazoria provides it correctly.

## Product Preview Content

Build the description from these ordered segments:

1. A normalized excerpt of the effective published description returned by the
   existing localized public-description read model. When no description is
   available, use the localized generic product description established by
   ticket `0043`.
2. `Price: {formatted price}`, when the effective published price and currency
   are valid. Localize the `Price` label.
3. `Supplier: {published supplier name}`. Localize the `Supplier` label.

Join available segments with `·`. Do not render empty separators. Limit the
description excerpt to 100 characters and the supplier name within the
description to 60 characters before composition. These limits include any
ellipsis.

Preserve valid price and supplier segments as complete trailing segments. If
the composed description would exceed the shared 200-character limit, shorten
only the leading description excerpt further until the complete trailing
segments fit. Do not truncate inside, partially render, or remove a valid price
or supplier segment merely to satisfy the final limit.

Keep the exact ticket `0043` product preview title,
`{published product title} — Bazoria`, and its published-product image selection
contract unchanged. Do not repeat a long product title in the description.

Extract a pure server-safe price-value formatter from the existing public price
formatting behavior. It must:

- accept a number or numeric string and a currency string;
- return `{UPPERCASE CURRENCY} {amount with two decimal places}`;
- accept finite, nonnegative prices, including zero, up to the existing
  `products.price` database maximum of `9999999999.99`;
- for string prices, accept only an already-trimmed decimal representation
  matching `\d+(\.\d+)?`; reject blank or whitespace-padded strings,
  hexadecimal values, exponent notation, a leading sign, and incomplete forms
  such as `.5` or `1.`;
- convert accepted values with `Number` and format them with `toFixed(2)`;
- accept only an already-trimmed uppercase currency matching `[A-Z]{3,6}`;
- return `null` for a missing or invalid price or currency; and
- not read global language, browser, or React state.

Keep the visible public-page formatter and metadata formatter aligned by having
both use this pure value formatter. The visible page may continue converting a
`null` result to its localized `Ask for quote` copy; metadata must omit the
price segment instead. Price copy must not introduce unsupported claims such as
`from`, discounts, tax inclusion, shipping, or availability guarantees.

## Seller Preview Content

Build the storefront description from these ordered segments:

1. A normalized excerpt of the effective published seller `about` text. When
   `about` is unavailable, use the localized generic supplier fallback below.
2. The normalized published location as `{city}, {country}`. Omit missing
   values and do not repeat equal city and country values.

Join available segments with `·`. Limit the `about` excerpt to 150 characters
and the complete normalized location segment to 80 characters before
composition. These limits include any ellipsis. Compare city and country for
equality after whitespace normalization; when they are exactly equal, render
the value once.

Preserve the location as a complete trailing segment. If the composed seller
description would exceed the shared 200-character limit, shorten only the
leading `about` or fallback excerpt further until the complete location fits.
Do not truncate inside or partially render the location segment.
Seller-authored `about` and location text is not translated; only the fallback
copy and interface-owned joining labels are localized.

Use this generic supplier fallback:

- EN: `Browse this supplier's wholesale catalog and contact them directly on Bazoria.`
- PL: `Przeglądaj katalog hurtowy tego dostawcy i skontaktuj się z nim bezpośrednio na platformie Bazoria.`
- DE: `Entdecken Sie den Großhandelskatalog dieses Anbieters und kontaktieren Sie ihn direkt über Bazoria.`
- VI: `Xem danh mục bán buôn của nhà cung cấp này và liên hệ trực tiếp với họ trên Bazoria.`

Keep the exact ticket `0043` seller preview title,
`{published seller name} — Wholesale Storefront on Bazoria`, and its effective
published storefront image selection contract unchanged. Do not include
private contact details, moderation state, unpublished product counts, or
working-copy content.

## Metadata Contract

- Reuse the absolute URL, image selection, fallback image, and server-rendering
  contract established in ticket `0043`.
- Keep standard description, Open Graph description, and Twitter description
  aligned for each route.
- Normalize every segment by trimming it and replacing line breaks and repeated
  whitespace with one space.
- Count all limits in Unicode code points rather than UTF-16 code units. Every
  maximum includes the Unicode ellipsis when truncation adds one.
- Truncate excerpts at a word boundary. The maximum includes the Unicode
  ellipsis. If no word boundary exists, truncate by Unicode code point rather
  than splitting a surrogate pair.
- Limit the final standard, Open Graph, and Twitter description to 200 Unicode
  code points by budgeting the leading excerpt around the complete trailing
  segments as defined above. Apply a final defensive assertion in tests; do not
  solve an over-limit composition by cutting through a trailing segment.
- Produce deterministic output for the same published data and language.
- Put product price and supplier context only in the aligned description text.
  Do not add `product:*`, payment, Schema.org, or other structured-commerce
  metadata in this ticket, and do not change the `website` Open Graph type from
  ticket `0043`.
- Do not make the social preview depend on browser-only formatting or a second
  client request.

## Localization

- Use the selected supported route language.
- Use the existing localized published product-description read model.
- Use these joining labels:
  - EN: `Price`, `Supplier`;
  - PL: `Cena`, `Dostawca`;
  - DE: `Preis`, `Lieferant`;
  - VI: `Giá`, `Nhà cung cấp`.
- Use the selected route language for these labels and generic fallbacks even
  when the existing public-description read model resolves missing localized
  product text to English.
- Fall back to the existing English behavior only where the public product
  description contract already permits it.

## Data And Database Impact

- No database migration is expected.
- Use existing published product descriptions, prices, currencies, seller
  names, seller locations, and seller `about` text.
- Do not add social-preview columns or duplicate generated metadata in the
  database.
- If implementation reveals that an effective published field cannot be read
  without exposing a working copy, stop and define a separate public-read
  contract ticket instead of weakening publication boundaries.

## Edge Cases

- A missing localized description falls back without rendering an empty or
  malformed preview.
- A missing or invalid price omits the price segment.
- Very long descriptions and seller `about` text are truncated at a word
  boundary.
- A long unbroken token is truncated safely without splitting a Unicode code
  point.
- Newlines and repeated whitespace are normalized.
- Prices use the same currency display semantics as the public page.
- Removed or hidden published data does not remain in newly rendered metadata,
  although external social-platform caches may require an explicit refresh.

## Platform Limitation

Bazoria can supply title, enriched description, image, and URL, but cannot
guarantee that Facebook, WhatsApp, or another platform will display the full
enriched description. In particular, a guaranteed visible price would require
a separately approved generated social-card image that bakes the price into
the image itself.

## Non-Goals

- Generated or stored social-card images.
- Text, price, logo, or badge overlays on product photographs.
- New product-description generation.
- Price history, promotions, discounts, tax calculations, stock guarantees,
  or shipping information.
- Share analytics, counters, campaign tracking, or social API integrations.
- Changes to public page content outside the shared price-formatter hardening
  defined by this ticket.
- Structured-commerce metadata or a change from `og:type=website`.
- Database migrations.

## Dependencies

- Ticket `0043-basic-product-and-seller-social-sharing` implemented and locally
  validated. Its pending external crawler verification does not block local
  implementation and may be combined with the final ticket `0044` verification.
- Existing effective published product descriptions, prices, currencies,
  supplier names, seller locations, and seller `about` text available through
  the public route loaders.

## Acceptance Criteria

- Product previews use the localized published description when available and
  add valid public price and supplier context using the defined segment order,
  limits, labels, and separators.
- Product previews degrade cleanly to the generic Bazoria description when
  richer fields are absent.
- Seller previews use effective published `about` and location data without
  exposing private or working-copy fields.
- Metadata is deterministic, localized, whitespace-normalized, and safely
  truncated to the defined Unicode-code-point per-segment and final limits
  without cutting complete price, supplier, or location segments.
- Invalid or absent prices are omitted from metadata and continue to use the
  existing `Ask for quote` behavior on the visible public page.
- No undefined structured-commerce metadata is emitted.
- Existing title, image, absolute URL, and fallback behavior from ticket `0043`
  remains unchanged.
- No database migration or social-preview persistence is introduced.
- The interface does not claim that every platform will render every supplied
  field.

## Validation Notes

- Add unit tests for description composition, localization, truncation,
  whitespace normalization, missing fields, invalid prices and currencies,
  zero prices, the existing database price maximum, rejected decimal-string
  forms, long supplier names, repeated location values, location budgeting,
  and unbroken Unicode content.
- Add focused tests proving the pure price-value formatter is independent of
  global language and browser state while preserving visible public-page price
  behavior.
- Extend product and seller route-metadata tests for rich and fallback states.
- Verify server-rendered metadata for at least one product in each supported
  language.
- On one public HTTPS UAT or temporary test origin, refresh and inspect
  representative product and seller URLs with Facebook's sharing debugger and
  another Open Graph consumer. This may serve as the combined external crawler
  verification for tickets `0043` and `0044`.
- Run `npm run test`, `npm run lint`, and `npm run build`.

## Estimate

Approximately half to one engineering day after ticket `0043`, assuming all
required effective published fields are already available to the public route
loaders. Generated image cards are outside this estimate.
