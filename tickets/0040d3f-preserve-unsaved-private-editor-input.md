# Ticket 0040d3f: Preserve Unsaved Private Editor Input

## Status

Implemented on 2026-08-17.

## Objective

Keep unsaved seller input in the optional product facts and multilingual
description editors while the product moderation page rerenders.

## Problem

Each editor receives a small client adapter around authenticated server
operations. The adapter can receive a new JavaScript identity when the parent
page rerenders. Both editors currently treat that identity change as a request
to reload their durable snapshot.

The first keystroke reports a dirty state to the parent and causes such a
rerender. The editor then reloads and replaces the local form with the last
saved values, making typed text appear to refresh away.

## Scope

- Keep the latest server-operation adapter in a ref for reads and writes.
- Reload facts only when the product identifier, explicit retry, or explicit
  refresh request changes.
- Reload descriptions only when the product identifier or explicit retry
  changes; imperative refresh continues to preserve dirty languages.
- Add focused regressions proving that replacing an equivalent adapter does
  not discard unsaved facts or description input.

## Non-Goals

- Persisting unsaved form text across a full browser reload or navigation.
- Automatic saving.
- Changing moderation polling or database behavior.

## Acceptance Criteria

- The first and subsequent keystrokes remain visible in both affected forms.
- Parent rerenders do not trigger a new durable read solely because an adapter
  object changed identity.
- Explicit refresh and save behavior remain unchanged.
- Focused tests, lint, and the production build pass.

## Validation

- All 16 focused facts and description editor tests pass, including the two
  adapter-replacement regressions.
- All 21 edit-screen and description-section integration tests pass.
- Project lint completes with zero errors and the existing 13 Fast Refresh
  warnings.
- The Node.js 22 production build completes successfully.
