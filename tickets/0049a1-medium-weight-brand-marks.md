# Ticket 0049a1: Medium-Weight Brand Marks

## Status

Implemented locally on 2026-08-28.

## Parent

Ticket 0049a.

## Goal

Increase the visual weight of the Bazoria wordmark and compact `b.` mark to
match the approved design direction without changing header layout or brand
color.

## Scope

- Rebuild `public/assets/brand/bazoria-logo.svg` from the locally installed
  Bodoni Moda Medium (`500`) font.
- Rebuild `public/favicon.svg` from the same font and weight.
- Convert both marks to self-contained vector paths with no runtime font
  dependency.
- Keep both marks black and preserve their current file paths and accessible
  ownership in `PublicShell` and root metadata.

## Expected Behavior

- The full `bazoria.` wordmark has visibly stronger strokes while retaining
  Bodoni Moda's letter contrast and spacing.
- The compact `b.` mark uses the same Medium weight and remains legible in the
  mobile header and browser tab.
- Existing responsive logo dimensions and header alignment do not change.

## Non-Goals

- Changing logo wording, color, header dimensions, or responsive breakpoints.
- Replacing the vector assets with raster images.
- Changing body or display typography elsewhere in the application.

## Acceptance Criteria

- [x] Both assets use Bodoni Moda Medium outlines.
- [x] Both SVGs are self-contained and render without an external font.
- [x] The desktop wordmark remains correctly framed at its existing size.
- [x] The mobile mark remains centered and legible at 36px.
- [x] The browser-tab icon renders without clipping.

## Validation

- Validate both SVG files structurally.
- Run focused PublicShell tests, lint, and production build.
- Inspect mobile and desktop header screenshots.
- Inspect the favicon at small rendered sizes.

## Implementation Notes

- Generated both path-only SVGs from the locally installed
  `bodoni-moda-latin-500-normal.woff` font file.
- Preserved the wordmark canvas proportion and the compact mark's square canvas,
  so no component dimensions or responsive rules changed.
- Validated both assets with `xmllint` and inspected the header at 375x812 and
  1440x900.
- Inspected the compact mark directly at 16px, 32px, and 64px.
- Focused PublicShell tests passed, lint completed with zero errors, and the
  production build passed.
