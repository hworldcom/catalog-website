# Ticket 0049g2: Join Seller and Buyer Details

## Status

Implemented and verified on 2026-08-30. Ticket 0049g1 is committed as
`4662c96`.

## Parent

Ticket 0049g.

## Goal

Move the existing seller benefits, seller onboarding, and buyer benefits into a
clear editorial detail sequence without removing or rewriting approved content.

## Scope

- Detailed seller benefits.
- Three-step seller onboarding.
- Detailed buyer benefits.
- Existing `#for-sellers` and `#for-buyers` anchor targets.
- Component extraction, responsive presentation, and translations.

## Component Ownership

- Add `src/features/marketplace/components/join-audience-details.tsx` to own the
  complete seller-benefits, seller-onboarding, and buyer-benefits sequence.
- `JoinAudienceDetails` accepts the current `audience` as its only prop. It owns
  all detail definitions and passes no content contract back through
  `JoinNetworkScreen`.
- Add `src/features/marketplace/components/join-section-heading.tsx` for the
  repeated Join section eyebrow, heading, and optional lead presentation.
- `JoinSectionHeading` accepts translated `eyebrow`, `title`, and optional
  `lead` strings plus an optional `align` value of `left` or `center`, defaulting
  to `left`. It renders the section `h2` and owns the shared responsive
  typography and spacing.
- Keep buyer and seller labels, leads, and benefit titles that are also used by
  the concise panels in `src/features/marketplace/join-audience-copy.ts`.
  Import those named values rather than redefining their translations.
- Keep the shared Create seller account action label in
  `join-audience-copy.ts`; the onboarding action imports it rather than
  redefining the translation.
- Keep feature-local presentation helpers inside that module unless a helper is
  reused outside the sequence.
- Move detail-only translation constants, benefit descriptions, promises, and
  onboarding definitions from `join-network-screen.tsx` into the new owner.
- Keep `JoinNetworkScreen` responsible only for composing the completed page.
- Ticket 0049g3 reuses `JoinSectionHeading`; do not recreate the heading pattern
  inside its connection, trust, or final-action components.

## Fixed Content and Order

- Preserve the current detailed order:
  1. Seller heading, lead, promise, and five benefits.
  2. Seller three-step onboarding and Create seller account action.
  3. Buyer heading, lead, and four benefits.
- Keep all existing wording and translations unchanged.
- Preserve `id="for-sellers"` and `id="for-buyers"`, `tabIndex={-1}`, sticky
  header scroll margins, and visible focus handling established by 0049g1.

## Presentation

- Render seller benefits as an unframed full-width background section using
  `PublicContainer` and a responsive numbered list.
- Render seller onboarding as a separate full-width `secondary` band, not as a
  card nested inside the seller section.
- Use visible `01` through `03` labels and decorative Lucide `UserPlus`, `Store`,
  and `PackagePlus` icons for the onboarding steps.
- Render buyer benefits as an unframed full-width background section using the
  same numbered-list rhythm as seller benefits.
- Use two benefit columns on suitable desktop widths and one column on mobile.
- Keep the seller account action linked to `/auth` with retained `lang` and
  `audience` state.

## Non-Goals

- Hero or audience-panel changes.
- Connection, trust, or final-action changes.
- Reordering, shortening, or rewriting benefits.
- Database, server, authentication, or onboarding workflow changes.

## Acceptance Criteria

- [x] All five seller benefits, three onboarding steps, and four buyer benefits
      remain present in the approved order.
- [x] Anchor targets retain accessible focus and sticky-header offsets.
- [x] Seller onboarding is a separate semantic band without nested cards.
- [x] Detail sections use the shared `JoinSectionHeading` presentation.
- [x] Seller action uses `/auth` and retains search state.
- [x] All four languages wrap without overlap or horizontal overflow.

## Validation

- Add focused coverage for section order, complete benefit titles, onboarding
  steps, anchor attributes, and seller destination.
- Verify all existing translated copy remains available in EN, PL, DE, and VI.
- Run focused tests, lint, and production build.
- Inspect mobile, tablet, 13-inch laptop, and wide-desktop layouts.

## Implementation Notes

- Added `JoinAudienceDetails` as the single owner of the seller benefits,
  seller onboarding, and buyer benefits sequence. It accepts only the current
  audience.
- Added `JoinSectionHeading` with left and centered alignment support. The
  extracted detail sequence uses this shared presentation owner; ticket 0049g3
  will adopt it when its sections are intentionally redesigned.
- Kept the seller and buyer targets as unframed full-width sections with
  responsive numbered lists and the focus behavior established by 0049g1.
- Moved onboarding into its own full-width `secondary` band with visible step
  numbers and decorative `UserPlus`, `Store`, and `PackagePlus` icons.
- The seller authentication action preserves existing search state and fills
  the current audience only when that parameter is absent.
- Left the hero, audience panels, connection, trust, final action, database,
  server, authentication, and onboarding workflows unchanged.

## Validation Results

- Focused Join tests: 3 files and 12 tests passed.
- Full test suite: 228 files and 1,493 tests passed.
- Lint passed with 13 existing Fast Refresh warnings and no errors.
- Production build passed with Node 22.13.0.
- Browser inspection passed in EN, PL, DE, and VI at 390x844, 768x1024,
  1440x900, and 1920x1080. No horizontal overflow or section overlap was
  found; detail and onboarding columns matched their responsive layouts, and
  the seller action remained 44px high with the expected route state.
- Real-browser activation of both hero links retained the URL hash, focused the
  requested detail section, and placed it below the sticky header.
