# Ticket 0049h: Public Redesign Responsive and Accessibility QA

## Status

Implemented. The final verification and focused correction slice for ticket
0049 is complete.

## Parent

Ticket 0049.

## Dependencies

- Ticket 0049a: public design foundations and header.
- Ticket 0049a1: medium-weight brand marks.
- Ticket 0049b: casual-fashion homepage hero.
- Ticket 0049c: homepage product seller metadata.
- Ticket 0049d: editorial homepage product rail.
- Ticket 0049e: homepage categories and suppliers.
- Ticket 0049f: homepage process and seller call to action.
- Ticket 0049g1: Join hero and audience panels.
- Ticket 0049g2: Join seller and buyer details.
- Ticket 0049g3: Join connection, trust, and final actions.

## Goal

Verify the complete homepage and Join page redesign across supported viewports,
languages, audience states, input methods, and incomplete-data conditions. Fix
defects that are small, local to ticket 0049, and do not change approved product
behavior.

## Scope

- Homepage and Join page integration verification.
- Shared public header and marketplace navigation verification.
- EN, PL, DE, and VI copy and layout checks.
- All, Women, Men, and Kids homepage checks.
- Keyboard, pointer, emulated-touch, and focus checks.
- Loading, empty, partial-data, missing-image, and failed-image states.
- Focused visual, translation, semantic-markup, and accessibility corrections
  within ticket 0049 scope.

## Coverage Strategy

Use a bounded matrix instead of testing every language, audience, page, and
viewport combination manually.

### Viewports

- `390x844`: representative mobile.
- `768x1024`: tablet.
- `1440x900`: 13-inch-laptop-class viewport.
- `1920x1080`: wide desktop.
- `320px` width: additional page-overflow and long-word spot check.

### Visual Matrix

- Inspect the homepage and Join page in EN at all four representative
  viewports.
- Inspect both pages in EN, PL, DE, and VI at `390x844` and `1440x900`.
- Inspect homepage All, Women, Men, and Kids states in EN at `390x844` and
  `1440x900`.
- Use automated tests to cover language, audience, and retained `lang`,
  `audience`, and `ref` search-state combinations not repeated manually.

### Data-State Matrix

- Product rail: empty, one product, overflowing products, populated price,
  quote-only price, missing optional metadata, long product and seller names,
  missing image, and failed image.
- Categories: optional Dresses and Sportswear categories present and absent,
  unsupported categories excluded, and failed editorial image.
- Suppliers: empty response, cover image, logo-only fallback, no media,
  verified and unverified states, missing location or category metadata, long
  seller name, and failed image.
- Hero: generated assets loaded and blocked or failed while dimensions remain
  stable.
- Route data: pending response and existing route error handling remain stable.
- Exercise synthetic states through focused tests, mocks, request blocking, or
  request throttling. Do not alter hosted UAT data to manufacture QA states.

## Workflow Checks

- The logo returns home, resets the audience to All, and preserves language.
- EN, PL, DE, and VI switching preserves compatible audience and route state.
- All, Women, Men, and Kids switch the homepage response and selected state.
- Clothing and Sellers disclosures open with keyboard and pointer input, close
  with Escape, restore trigger focus, and close when focus moves away.
- Join Us, homepage hero actions, product links, seller links, category links,
  seller account actions, and buyer browse actions use the approved routes and
  preserve compatible search state.
- Product-rail scrolling works with keyboard, pointer controls, trackpad-style
  scrolling, and touch emulation; disabled control states remain accurate.
- Join hero jump links move focus to the requested seller or buyer section and
  do not place the focused heading beneath the sticky header.
- Signed-out, signed-in seller, and unresolved authentication header states
  retain their tested destinations and do not introduce an incorrect action
  flash. A complete account-registration or seller-dashboard QA pass is not
  required by this ticket.
- Browser back and forward navigation preserve the selected language and
  audience on the two public pages.

## Expected Behavior

- No incoherent overlap, clipping, layout shift, or unintended page-level
  horizontal scroll occurs.
- Intentional product and navigation rails remain independently scrollable and
  operable without expanding the page width.
- Header disclosures remain keyboard and pointer accessible at every tested
  width.
- Long translations and user-managed names wrap without escaping controls or
  hiding adjacent content.
- Generated and data-driven images preserve stable dimensions during loading
  and failure.
- Empty product, category, and supplier states remain understandable.
- Missing images have intentional fallbacks without broken-image browser UI.
- Selection, stock, and verification are not communicated by color alone.
- Each page has one `h1`, heading levels remain logical, focus order follows
  visual order, and focus remains visible.
- Decorative images have empty alternative text. Product and seller images
  retain meaningful accessible names without duplicating nearby content.
- Primary command buttons and icon-only controls have at least `44x44px` target
  areas. Segmented language controls and inline text links remain separated and
  practically operable without requiring artificial `44x44px` boxes.
- Existing public routes, language, audience, product, seller, authentication,
  and Join behavior remain intact.

## Correction Boundary

- Fix small CSS, responsive-layout, translation, semantic-markup, accessible
  naming, focus, and focused-test defects found in ticket 0049-owned code.
- Add or update focused tests for every corrected behavior.
- Create a follow-up ticket instead of expanding 0049h when a defect requires a
  new product behavior, database migration, server contract, broad shared
  component redesign, or unrelated refactor.
- Record an environment limitation rather than claiming coverage when a state
  cannot be exercised safely.

## Non-Goals

- New features or design expansion beyond approved ticket 0049 behavior.
- Ticket 0050 newest-products work.
- Seller storefront, dashboard, administrator, product-detail, authentication,
  or registration redesign.
- Database writes, migrations, or UAT fixture changes.
- Introducing a permanent browser end-to-end test framework.
- Formal Web Content Accessibility Guidelines certification or a complete
  application accessibility audit.
- Replacing focused fixes with unrelated refactors.

## Acceptance Criteria

- [x] Homepage and Join page pass the defined visual matrix without unintended
      page-level overflow, overlap, clipping, or unstable fixed-format content.
- [x] EN, PL, DE, and VI remain usable at the required mobile and laptop widths.
- [x] All, Women, Men, and Kids homepage states remain usable and retain their
      selected state and query parameters.
- [x] Header disclosures, Join jump links, product-rail controls, primary
      actions, keyboard navigation, focus movement, and focus restoration pass
      the named workflow checks.
- [x] Command and icon-only targets meet the defined `44x44px` requirement and
      visible focus is not clipped or obscured.
- [x] Loading, empty, partial-data, missing-image, and failed-image states pass
      the defined data-state checks without modifying hosted UAT data.
- [x] Heading structure, image alternatives, accessible names, and non-color
      state indicators remain correct on both pages.
- [x] Public links retain compatible `lang`, `audience`, and `ref` state, and
      browser back and forward navigation remain coherent.
- [x] Signed-out, signed-in seller, and unresolved authentication header states
      retain their existing tested behavior.
- [x] Browser console and relevant development-server output contain no new
      runtime errors or ticket-0049 warnings.
- [x] Every defect corrected in 0049h has focused regression coverage.
- [x] All ticket 0049 child acceptance criteria remain satisfied.

## Validation

- Run the focused tests for public layout, marketplace navigation, homepage
  components, shared editorial product cards, Join components, and both public
  screens.
- Run the complete suite with `npm run test:node22`.
- Run `npm run lint:node22` and record errors separately from existing warnings.
- Run `npm run build:node22`.
- Perform the defined browser visual matrix against the local app using UAT
  read-only data where live data is required.
- Use locally available browser inspection or automation for screenshots,
  geometry, keyboard, pointer, touch-emulation, console, and request-failure
  checks. Do not make an undeclared global browser tool a project dependency.
- Check focus order manually from the browser address bar through the public
  footer and exercise Escape and focus-restoration behavior.
- Record in this ticket the test totals, lint and build results, inspected
  browser sizes, UAT environment, corrected defects, console findings, and any
  residual limitation.

## Implementation Notes

- Added `hasImageLoadFailed` so server-rendered images that fail before React
  hydration attaches `onError` handlers still enter their intentional fallback
  state.
- Applied the hydration-safe check to the homepage hero, editorial product
  cards, category tiles, and supplier cover/logo progression. Existing
  post-hydration `onError` behavior remains in place.
- Added a `44px` minimum width to the compact mobile logo destination and
  audience controls. Their existing height, appearance, and responsive layout
  remain unchanged.
- Made the selected audience scroll into the nearest visible portion of the
  narrow audience rail when the audience changes. This keeps All visible after
  the logo resets a previously selected Kids state.
- Added focused regression coverage for pre-hydration image failure, compact
  target sizing, and selected-audience visibility.
- No database write, migration, hosted UAT fixture change, route contract, or
  permanent browser-test dependency was introduced.

## Verification Results

- Focused public redesign suite: 19 files and 111 tests passed.
- Complete application suite: 231 files and 1,515 tests passed.
- Lint: passed with zero errors and 13 existing Fast Refresh warnings.
- Production build: passed with Node 22.13.0 and the Vercel Node 22 runtime.
- Formatting and `git diff --check`: passed for the touched files.
- Browser: Chrome 147.0.7727.138 against the local Vite app on port 8080 with
  hosted UAT data used read-only.
- Browser matrix: 28 unique page, language, audience, and viewport cases passed
  at `390x844`, `768x1024`, `1440x900`, `1920x1080`, and the additional `320px`
  overflow width.
- Browser geometry found no page-level horizontal overflow, incoherent overlap,
  clipped controls, duplicate identifiers, broken live images, or invalid
  homepage/Join heading counts.
- EN, PL, DE, and VI passed at mobile and laptop widths. All, Women, Men, and
  Kids passed at mobile and laptop widths; the live Kids empty-product state
  remained stable.
- Real Tab-key traversal produced visible, unobscured focus. Clothing opened
  from keyboard focus, Escape closed it and restored focus, and touch emulation
  opened and closed the disclosure.
- Language and audience changes preserved compatible query state. Browser back
  and forward navigation restored the expected selection. Join jump links
  focused visible seller and buyer sections below the sticky header.
- Product and seller links, buyer browse actions, and all three seller-account
  actions retained the expected `lang`, `audience`, and `ref` state.
- Blocking bitmap requests left stable hero, product, category, and supplier
  fallback areas with no broken-image elements or page overflow.
- The final browser run reported no console warning, console error, unhandled
  exception, or non-image network failure.
- One intermediate browser run received a route-level HTTP 500 while the QA
  process was repeating live UAT requests. Ten immediate direct repetitions and
  the final 28-case browser run all returned clean results, so no reproducible
  ticket-0049 defect remains.
- Signed-out browser behavior was inspected live. Signed-in seller and
  unresolved authentication states remain covered by focused component tests;
  no QA account or hosted data mutation was required.
