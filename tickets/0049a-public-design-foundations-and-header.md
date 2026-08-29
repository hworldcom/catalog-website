# Ticket 0049a: Public Design Foundations and Header

## Status

Implemented locally on 2026-08-28. The theme boundary, container scope, header
destinations, authentication states, responsive branding, and language selector
ownership are implemented and validated below.

## Parent

Ticket 0049.

## Dependencies

None beyond the approved parent design direction.

## Goal

Establish the shared public layout and header treatment required by the homepage
and Join page redesign without changing marketplace behavior.

## Scope

- An isolated `.public-marketplace` semantic theme in `src/styles.css`.
- A reusable `PublicContainer` layout component.
- Shared public header and marketplace navigation styling.
- Desktop three-band header composition.
- Existing responsive mobile navigation styling.
- Language, Sign in, Join Us, audience, Clothing, and Sellers controls.

## Expected Behavior

- Use the full black `bazoria.` wordmark in the first desktop band.
- Keep language choices and Sign in aligned to the right.
- Keep audience choices and Join Us in the second band.
- Keep Clothing and Sellers triggers in the third band.
- Remove the separate Home text link from the first band. The logo remains the
  home link and continues resetting the marketplace audience to All while
  preserving language.
- Render both the signed-out Sign in action and the signed-in Seller dashboard
  action as restrained black actions with white text.
- Keep the current loading behavior that renders no authentication action until
  the initial session check resolves.
- Render Join Us as an orange-outlined action.
- Render the selected language with black background and white text.
- Add a `publicHeader` appearance to `LanguageSwitcher` for the approved compact
  black selection treatment. Keep the default LanguageSwitcher appearance
  unchanged for seller storefront and administrator usage.
- Use the square `b.` asset below the small breakpoint where the full wordmark
  would compete with language and authentication controls.
- Use the full black wordmark from the small breakpoint upward.
- Keep one accessible Bazoria name on the responsive logo link and prevent the
  two visual logo variants from producing duplicate screen-reader output.
- Add `src/components/layout/public-container.tsx` with the shared base layout:
  `mx-auto w-full max-w-[1320px] px-5 sm:px-6 lg:px-8`.
- Apply `PublicContainer` only to the public header first band, marketplace
  navigation bands and panels, and public footer in this ticket.
- Leave homepage, Join, category, product-detail, and other page-section
  containers unchanged until their owning redesign tickets adopt the shared
  component.
- Apply `.public-marketplace` to `PublicShell` and keep `.storefront-dark`
  unchanged for seller storefronts.
- Use these approved public palette targets, expressed as OKLCH semantic tokens:
  - background: `oklch(0.9825 0.0057 84.57)`;
  - primary white surface: `oklch(1 0 0)`;
  - soft surface: `oklch(0.9601 0.0108 76.60)`;
  - primary text: `oklch(0.1969 0.0067 78.16)`;
  - muted text: `oklch(0.5308 0.0144 75.27)`;
  - border: `oklch(0.9120 0.0138 78.26)`;
  - orange: `oklch(0.6295 0.2038 37.52)`;
  - orange hover reference: `oklch(0.5871 0.1938 36.83)`;
  - orange-soft reference: `oklch(0.9648 0.0195 50.16)`.
- Map the approved targets through existing semantic Tailwind tokens rather than
  adding page-specific color literals.
- Preserve sticky behavior, search parameters, dropdown contents, keyboard
  behavior, pointer behavior, and minimum interaction sizes.
- Retain the existing responsive navigation rows on mobile.

## Non-Goals

- Homepage hero or section redesign.
- Join page content redesign.
- New mobile drawer or hamburger behavior.
- Seller storefront, product detail, category page, dashboard, or administrator
  layout changes.
- Changing `.storefront-dark` or the default LanguageSwitcher appearance.
- Migrating homepage, Join, category, or product-detail section containers to
  `PublicContainer`.
- Authentication or marketplace query changes.

## Acceptance Criteria

- [x] Desktop public header uses the approved three-band hierarchy.
- [x] Full desktop wordmark, compact mobile mark, language controls,
      authentication action, Join Us, audiences, Clothing, and Sellers remain
      functional.
- [x] The logo is the only first-band home destination and resets audience to
      All while preserving language.
- [x] Signed-out Sign in and signed-in Seller dashboard states use the approved
      black action treatment.
- [x] Mobile navigation remains usable without a new drawer.
- [x] PublicShell uses the isolated `.public-marketplace` theme without changing
      seller storefront styling.
- [x] Header, marketplace navigation, and footer use `PublicContainer`; page
      sections remain in their current containers.
- [x] Public-header language styling does not alter seller or administrator
      LanguageSwitcher instances.
- [x] Public colors use semantic tokens rather than page-specific literals.
- [x] All controls have visible focus states and practical 44px targets.
- [x] No header content overlaps at mobile, 13-inch laptop, or wide desktop
      widths.

## Validation

- Update focused PublicShell and MarketplaceNavigation tests.
- Add focused PublicContainer coverage where behavior or class merging requires
  it.
- Update LanguageSwitcher tests for default and `publicHeader` appearances.
- Test signed-out, signed-in, and unresolved authentication states.
- Test responsive logo accessibility without relying only on CSS visibility.
- Verify EN, PL, DE, and VI labels at constrained widths.
- Verify keyboard opening, closing, Escape handling, and focus restoration for
  both marketplace panels.
- Run focused tests, lint, and production build.
- Inspect mobile, tablet, 13-inch laptop, and wide-desktop layouts.

## Implementation Notes

- Added the isolated public semantic palette and shared `PublicContainer`.
- Reworked `PublicShell` and `MarketplaceNavigation` into the approved three
  bands without changing route, query, disclosure, pointer, or keyboard logic.
- Kept Join Us visible on constrained mobile layouts while audience choices
  remain horizontally scrollable.
- Added focused coverage for the container, language appearances, authentication
  states, responsive logo accessibility, and navigation structure.
- Validation passed with 214 test files and 1,416 tests, lint with zero errors,
  and the production build.
- Playwright screenshots were inspected at 375x812 for EN, PL, DE, and VI, at
  768x1024, 1440x900, and 1920x1080.
