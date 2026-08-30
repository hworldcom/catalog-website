# Ticket 0049g3: Join Connection, Trust, and Final Actions

## Status

Implemented and verified on 2026-08-30. Ticket 0049g2 is committed as
`41d45b2`.

## Parent

Ticket 0049g.

## Goal

Complete the Join redesign by restyling the existing connection process,
independent-business trust content, and final seller/catalogue actions.

## Scope

- Catalogue-to-conversation process section.
- Independent-business trust section.
- Final seller and buyer actions.
- Component extraction, responsive presentation, and translations.

## Component Ownership

- Add `src/features/marketplace/components/join-connection-section.tsx`.
- Add `src/features/marketplace/components/join-trust-section.tsx`.
- Add `src/features/marketplace/components/join-final-cta.tsx`.
- `JoinConnectionSection` and `JoinTrustSection` accept no props. Each owns its
  complete translated copy and fixed content definitions.
- Reuse `src/features/marketplace/components/join-section-heading.tsx` from
  ticket 0049g2 for left-aligned connection and trust headings and the centered
  final-action heading.
- Import the shared Create seller account and Browse products translations from
  `src/features/marketplace/join-audience-copy.ts` rather than defining either
  action label again.
- `JoinFinalCta` accepts the current `audience: PublicAudience` as its only prop;
  `JoinNetworkScreen` passes it when composing the section.
- Move each section's translation constants and fixed content into its owning
  component.
- Remove obsolete Join-page presentation helpers from
  `join-network-screen.tsx` after they have no remaining callers.
- After extraction, keep `JoinNetworkScreen` limited to composing, in order,
  `JoinPageHero`, `JoinAudiencePanels`, `JoinAudienceDetails`,
  `JoinConnectionSection`, `JoinTrustSection`, and `JoinFinalCta` inside
  `PublicShell`.

## Connection Presentation

- Preserve the existing eyebrow, title, three steps, and closing promise.
- Use one full-width `secondary` band with `PublicContainer` rather than a
  bordered grid of cards.
- Keep visible `01`, `02`, and `03` labels.
- Use decorative Lucide `BookOpen`, `Search`, and `MessageCircle` icons for
  Seller publishes, Buyer discovers, and Both sides connect. Set each icon to
  `aria-hidden="true"` because its step already has a visible heading.
- Below the `md` breakpoint, stack the steps in one column and use horizontal
  separators only between adjacent steps.
- From the `md` breakpoint, render three equal unframed columns and replace the
  horizontal separators with vertical separators between adjacent steps.
- Keep the closing promise left-aligned beneath the complete step sequence.
- Do not imply checkout, payment, transaction management, or platform-owned
  customer relationships.

## Trust Presentation

- Preserve the existing eyebrow, title, seller-control statement, and
  buyer-clarity statement without copy changes.
- Render the two trust statements as equal repeated panels using restrained
  borders, the semantic `card` surface, and the shared medium `rounded-md`
  corner radius.
- Use one column below `md` and two equal columns from `md`. Do not nest the
  panels inside another card.
- Use a full-width unframed section with `PublicContainer`; do not add a section
  background or outer border in this ticket.

## Final Action Presentation

- Preserve the existing Start here eyebrow, title, and explicit no-buyer-account
  lead.
- Use one full-width subtle `accent` band with centered content and no floating
  card. Use `PublicContainer` for its inner width.
- Present actions in this order:
  1. `Create seller account`, linking to `/auth`.
  2. `Browse products`, linking to the current-audience `/c/fashion` catalogue.
- Replace the current final `Sell on Bazoria` button label with the already
  translated `Create seller account` label for consistency with the seller
  panel and onboarding action.
- The `/auth` action preserves the complete existing search state.
- The `/c/$category` action uses `{ category: "fashion" }`, preserves `lang`,
  and sets `audience` from the `JoinFinalCta` prop.
- Preserve arbitrary existing search parameters such as `ref`; do not rebuild
  either destination from only `lang` and `audience`.
- Stack both actions below the `sm` breakpoint and render them inline from
  `sm`. Keep each action at least 44px high, use the primary treatment for
  Create seller account, and use the outlined treatment for Browse products.
- Both actions retain the shared visible keyboard focus-ring treatment.

## Non-Goals

- Hero, audience-panel, seller-detail, onboarding, or buyer-detail changes.
- New copy beyond reusing the existing Create seller account translation.
- Database, server, authentication, or marketplace-query changes.

## Acceptance Criteria

- [x] Connection steps preserve the direct-contact model in the approved
      unframed responsive presentation.
- [x] Both independent-business trust statements remain present.
- [x] Final seller and catalogue actions use the fixed labels, destinations,
      order, and retained search state.
- [x] Connection, trust, and final-action headings reuse
      `JoinSectionHeading`; route-action translations remain shared through
      `join-audience-copy.ts`.
- [x] All four languages wrap without overlap or horizontal overflow.
- [x] `JoinNetworkScreen` is reduced to page composition after obsolete inline
      helpers are removed.

## Validation

- Add focused component tests for process copy and order, icons and numbers,
  trust content, final labels, destinations, and search state.
- Route tests must verify that arbitrary existing search state such as `ref` is
  retained in addition to `lang` and `audience`.
- Update the Join screen integration test to verify the final section order and
  retained unsupported-feature assertions.
- Verify all four languages and keyboard focus states.
- Run focused and full tests, lint, and production build.
- Inspect mobile, tablet, 13-inch laptop, and wide-desktop layouts.

## Implementation Notes

- Added `JoinConnectionSection` with the existing three-step direct-contact
  sequence, decorative `BookOpen`, `Search`, and `MessageCircle` icons, and
  responsive horizontal-to-vertical separators.
- Added `JoinTrustSection` with the two existing independent-business
  statements in equal semantic-card panels from the `md` breakpoint.
- Added `JoinFinalCta` as a centered full-width `accent` band. It replaces the
  old final Sell on Bazoria label with the shared Create seller account label
  and keeps Browse products second.
- Preserved complete existing search state for authentication and preserved
  arbitrary parameters while setting the current audience for the fashion
  catalogue destination.
- Reused `JoinSectionHeading` and the shared Join action translations in all
  three section owners.
- Reduced `JoinNetworkScreen` to ordered page composition with no local copy,
  fixed-content arrays, route actions, or presentation helpers.
- Left the hero, audience panels, audience details, database, server,
  authentication, and marketplace queries unchanged.

## Validation Results

- Focused Join tests: 4 files and 20 tests passed.
- Full test suite: 231 files and 1,510 tests passed.
- Lint passed with 13 existing Fast Refresh warnings and no errors.
- Production build passed with Node 22.13.0.
- Browser inspection passed in EN, PL, DE, and VI at 390x844, 768x1024,
  1440x900, and 1920x1080. No horizontal overflow or section overlap was
  found; connection and trust columns, separator direction, and final action
  layout matched their fixed breakpoints.
- Both final actions remained 44px high, retained `ref=qa`, used the expected
  audience-aware destinations, and displayed visible keyboard focus rings.
