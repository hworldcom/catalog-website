# Ticket 0049f: Homepage Process and Seller Call To Action

## Status

Implemented and verified on 2026-08-30.

## Parent

Ticket 0049.

## Dependencies

- Ticket 0049a is implemented and committed.
- Tickets 0049b through 0049e are implemented and committed. Ticket 0049e is
  the direct implementation base because it most recently changed
  `MarketplaceHomeScreen` and its focused test.

## Goal

Restyle the lower homepage process and seller-account sections to match the
editorial public design while preserving their existing meaning and links.

## Scope

- Browse, Inquire, and Deal process section.
- Seller call-to-action section.
- Section spacing, typography, fixed step icons and numbers, and soft surfaces.
- Existing translations and destinations.

## Component Ownership

- Add
  `src/features/marketplace/components/marketplace-process-section.tsx` for the
  complete How it works section.
- Add `src/features/marketplace/components/marketplace-seller-cta.tsx` for the
  complete seller call-to-action section.
- Keep `MarketplaceHomeScreen` responsible only for placing those sections in
  the existing homepage order.
- Remove the homepage-local generic `Section` helper after it has no remaining
  callers. Do not replace it with another generic section abstraction.

## Copy Contract

- Keep the existing translated How it works title, subtitle, Browse, Inquire,
  and Deal titles and descriptions unchanged in English, Polish, German, and
  Vietnamese.
- Keep the existing translated seller title, supporting copy, and Create seller
  account button label unchanged in all four languages.
- Move the translation constants into the new owning components. Do not add new
  marketing claims or copy variants in this ticket.

## Process Presentation

- Render the process as one full-width warm-neutral band using the existing
  public semantic `secondary` surface and `PublicContainer`.
- Do not wrap the section or individual steps in cards.
- Use three equal columns on larger screens. Stack the steps on mobile.
- Use the Lucide `Search`, `MessageCircle`, and `Handshake` icons for Browse,
  Inquire, and Deal respectively. Treat the icons as decorative because the
  adjacent translated headings provide the accessible names.
- Retain visible `01`, `02`, and `03` step labels.
- Use subtle separators between steps: horizontal separators in the mobile
  stack and vertical separators in the larger-screen row.
- Use stable icon dimensions so loading, translation length, and wrapping do
  not move the layout.

## Seller Call-To-Action Presentation

- Render a separate full-width soft-peach band using the existing public
  semantic `accent` surface and `PublicContainer`.
- Center the existing heading, supporting copy, and one primary orange action.
- Keep the section unframed and do not render it as a floating card or dark
  banner.
- Keep one action only: Create seller account.
- Link the action directly to `/auth`. Do not add a role selector or change the
  authentication redirect behavior.
- Preserve the current `lang` and `audience` search state through the root
  search-retention contract.

## Expected Behavior

- Present Browse, Inquire, and Deal in one wide soft-background section rather
  than three heavily framed cards.
- Keep the current direct-contact and off-platform negotiation meaning.
- Do not imply checkout, payment processing, or transaction management.
- Keep the seller call to action near the bottom of the homepage.
- Use a soft peach or warm neutral surface rather than a dark banner.
- Preserve the existing `/auth` seller account destination.
- Preserve all language and audience state carried by relevant links.
- Stack process steps cleanly on mobile and present them horizontally on larger
  screens.

## Non-Goals

- Header, hero, product, category, or supplier changes.
- Join page redesign.
- Seller onboarding or authentication changes.
- New marketing claims or unsupported platform capabilities.
- Database changes, migrations, server functions, or marketplace data requests.
- Changes to the existing authentication screen or its post-authentication
  redirect behavior.

## Acceptance Criteria

- [x] Process section communicates the existing three-step model accurately.
- [x] Process steps use the approved icons, visible numbers, unframed layout,
      responsive separators, and existing translated copy.
- [x] Seller call to action links to `/auth` and preserves the current language
      and audience search state.
- [x] Both sections use `PublicContainer`, semantic public colors, and the
      approved full-width band treatment without nested or floating cards.
- [x] Existing copy remains unchanged and translated in all four languages.
- [x] Mobile stacking has no overlap or horizontal overflow.
- [x] No database, server-function, authentication, or marketplace-query
      behavior changes.

## Validation

- Add focused component tests for all process steps, icon and number presence,
  seller copy, `/auth` destination, and retained search state.
- Update the homepage screen test to verify the two components remain after the
  supplier section and in their approved order.
- Verify all supported languages and long copy wrapping.
- Run focused tests, lint, and production build.
- Inspect mobile, tablet, 13-inch laptop, and wide-desktop layouts.

## Implementation Notes

- Added feature-owned process and seller call-to-action components and reduced
  `MarketplaceHomeScreen` to section composition.
- Replaced the three framed process cards with one responsive semantic
  `secondary` band, decorative Lucide icons, visible step numbers, and
  breakpoint-aware separators.
- Replaced the bordered seller banner with one centered semantic `accent` band
  and a single primary `/auth` action that retains the current search state.
- Moved the existing four-language copy into the components that render it
  without changing wording or adding claims.
- Added focused component coverage for translations, process structure, icons,
  action destination, search retention, and homepage order.

## Verification Notes

- Focused verification passed with 3 test files and 12 tests.
- The full suite passed with 224 test files and 1,472 tests.
- Lint passed with zero errors and the existing 13 Fast Refresh warnings.
- The Node 22.13 production build passed.
- Browser checks passed at 390x844, 768x1024, 1440x900, and 1920x1080 in EN,
  PL, DE, and VI. There was no document or section overflow, no process-step
  overlap, and the seller action remained 44px high.
- Browser navigation confirmed `/auth` retains both `lang` and `audience`.
- Mobile and desktop captures were visually inspected for wrapping, hierarchy,
  spacing, separators, and surface contrast.
