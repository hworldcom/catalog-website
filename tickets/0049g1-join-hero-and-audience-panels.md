# Ticket 0049g1: Join Hero and Audience Panels

## Status

Implemented and verified on 2026-08-30.

## Parent

Ticket 0049g.

## Goal

Redesign the top of the Join page as a centered editorial invitation followed
by concise buyer and seller panels that direct each audience to the correct
next action.

## Scope

- Join hero presentation.
- Buyer and seller hero jump links.
- New buyer and seller audience panels directly below the hero.
- Accessible anchor focus behavior.
- Existing translated top-page copy and route state.

## Component Ownership

- Add `src/features/marketplace/components/join-page-hero.tsx`.
- Add `src/features/marketplace/components/join-audience-panels.tsx`.
- Add `src/features/marketplace/join-audience-copy.ts` as the non-React shared
  owner of buyer and seller labels, leads, benefit titles, and route-action
  labels reused across the concise panels and later Join sections.
- Use named copy fields for each benefit title rather than positional array
  indexes. The panel and detail definitions must import the same named values.
- Keep `JoinNetworkScreen` responsible for page order and passing the current
  audience to route-owning components.
- Move hero-only translation constants into `join-page-hero.tsx`.
- Move panel-only translation constants into `join-audience-panels.tsx`.
- Move only the buyer and seller labels, leads, and benefit titles shared by
  the new panels and existing detail sections into `join-audience-copy.ts`.
- Move the existing translated `Create seller account` and `Browse products`
  labels into `join-audience-copy.ts`. Ticket 0049g1 uses both labels, ticket
  0049g2 reuses Create seller account, and ticket 0049g3 reuses both.
- Update the existing detail definitions in `join-network-screen.tsx` to import
  those shared values while leaving their descriptions, order, markup, and
  behavior unchanged.
- Do not duplicate a `t(...)` definition between the new panel and the existing
  detail content and do not pass the complete copy contract through screen
  props.
- Leave all detailed seller, onboarding, buyer, connection, trust, and final
  action content unchanged in this ticket.

## Hero Presentation

- Use one full-width subtle `accent` surface with `PublicContainer`; remove the
  current gradient.
- Center the existing translated kicker, `Join the Wholesale Network` title,
  lead, and introduction.
- Keep the hero unframed and do not place its text in a card.
- Keep the existing hero copy unchanged in EN, PL, DE, and VI.
- Present the hero actions in this order:
  1. `I'm a buyer`, linking to `#for-buyers`.
  2. `I'm a seller`, linking to `#for-sellers`.
- Use a restrained outlined treatment for both jump actions. They navigate
  within the page; they do not browse products or create accounts.
- When a jump action is activated, update the URL hash, respect the sticky
  header scroll offset, and move keyboard focus to the target section. Preserve
  `tabIndex={-1}` and a visible focus treatment on both target sections.

## Audience Panel Presentation

- Place the panels directly after the hero inside a full-width public section.
- Render Buyers first and Sellers second.
- Use two equal, individually framed panels on larger screens and one stacked
  column on mobile. Panels are repeated content items, not nested page sections.
- Use the Lucide `Search` icon for Buyers and `Store` icon for Sellers. Icons are
  decorative because each panel has a visible translated heading.
- Use restrained card borders, the semantic `card` surface, and no more than
  the shared medium corner radius.

## Buyer Panel Content

- Heading: use the existing translated `For buyers` label.
- Description: reuse the existing translated buyer lead beginning with
  `Explore published wholesale catalogues before you travel`.
- Reuse these existing translated buyer benefit titles as the concise list:
  1. `Discover new wholesalers`.
  2. `Browse current catalogues`.
  3. `Browse before travelling`.
  4. `Source closer to home`.
- Add the explicit translated note:
  - EN: `No buyer account required.`
  - PL: `Konto kupującego nie jest wymagane.`
  - DE: `Kein Käuferkonto erforderlich.`
  - VI: `Không cần tài khoản người mua.`
- Render one primary action: the existing translated `Browse products` label.
- Link to `/c/$category` with `{ category: "fashion" }`, preserve `lang`, and set
  `audience` to the current Join-page audience. Do not link to authentication.

## Seller Panel Content

- Heading: use the existing translated `For sellers` label.
- Description: reuse the existing translated seller lead beginning with
  `Build one clear catalogue`.
- Reuse these existing translated seller benefit titles as the concise list:
  1. `Create your digital catalogue`.
  2. `Share products anywhere`.
  3. `Reach new professional buyers`.
  4. `Keep selling your way`.
- Render one primary action: the existing translated `Create seller account`
  label.
- Link to `/auth` while preserving the current `lang` and `audience` search
  state. Do not add a role selector or change authentication behavior.

## Responsive Behavior

- Keep both hero jump actions and panel actions at least 44px high.
- Stack hero jump actions and audience panels without horizontal overflow on
  constrained mobile widths.
- Allow long headings, descriptions, and action labels to wrap without changing
  panel widths or covering adjacent content.

## Non-Goals

- Redesigning any section below the new audience panels.
- Changing detailed benefit copy or content order.
- New images, generated assets, database fields, or data fetching.
- Header, homepage, Join route metadata, authentication, or onboarding changes.

## Acceptance Criteria

- [x] Hero uses the centered warm editorial treatment without a gradient or
      floating card.
- [x] Buyer and seller jump links target the existing detail sections and move
      focus accessibly.
- [x] Buyers-first panels use only the approved existing copy and fixed account
      note.
- [x] Buyer action opens the current-audience fashion catalogue without an
      account requirement.
- [x] Seller action opens `/auth` and retains search state.
- [x] EN, PL, DE, and VI copy renders without overlap or overflow.
- [x] Panel and detail labels, leads, and benefit titles share one translation
      definition in `join-audience-copy.ts`.
- [x] Create seller account and Browse products each have one shared translated
      definition for all Join-page callers.
- [x] Existing lower Join content remains unchanged.

## Validation

- Add focused tests for hero copy, action order, hash targets, click-to-focus
  behavior, panel order, panel content, and route search state.
- Update the existing Join screen integration test to confirm the seller
  details, onboarding, buyer details, connection, trust, and final actions
  remain present after the top-section extraction.
- Test all four languages, including German and Vietnamese action wrapping.
- Run focused tests, lint, and production build.
- Inspect mobile, tablet, 13-inch laptop, and wide-desktop layouts.

## Implementation Notes

- Added `JoinPageHero` and `JoinAudiencePanels` and kept
  `JoinNetworkScreen` responsible for their order above the existing detail
  content.
- Added `joinAudienceCopy` as the shared translation owner for panel/detail
  labels, leads, repeated benefit titles, and repeated route-action labels.
- Preserved the current Join-page audience and remaining search state in the
  buyer and seller destinations.
- Added accessible jump-link focus behavior and visible focus rings on the
  existing detail targets.
- Used a smaller mobile-only hero title size so the longest German compound
  word remains intact at a 320px viewport; tablet and desktop sizing is
  unchanged.

## Validation Results

- Focused Join tests: 3 files and 15 tests passed.
- Full test suite: 226 files and 1,484 tests passed.
- Lint passed with 13 existing Fast Refresh warnings and no errors.
- Production build passed with Node 22.13.0.
- Browser inspection passed in EN, PL, DE, and VI at 390x844, 768x1024,
  1440x900, and 1920x1080, plus a 320px German title check. No horizontal
  overflow or section overlap was found; panel layouts and all 44px action
  targets matched the ticket.
- Real-browser activation of both hero links updated the hash, focused the
  requested section, and placed it below the sticky header.
