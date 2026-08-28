# Ticket 0031b: Website Clothing Category Mapping

## Status

Implemented in `catalog-website`.

## Ownership

- Repository: `catalog-website`
- Split from: `catalog-classifier/tickets/0031-expanded-clothing-taxonomy-and-website-mapping.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Ensure every selectable classifier clothing leaf from classifier ticket
`0031a` has an exact Bazoria destination category so approved category slugs
can be imported without broad fallback mapping.

## Scope

Add or preserve exact Bazoria category rows for:

- `t-shirts`
- `hoodies`
- `trousers`
- `jackets`
- `sportswear`
- `sweatshirts`
- `sweaters`
- `cardigans`
- `jeans`
- `shorts`
- `skirts`
- `leggings`
- `sweatpants`
- `dresses`
- `blazers`
- `coats`
- `vests`
- `tracksuit-sets`

The migration preserves an existing destination row with the same slug. It
does not dynamically synchronize databases, remap an approved leaf to a
broader category, or introduce non-clothing taxonomy.

## Acceptance Criteria

- A fully migrated website database contains every required destination slug.
- Reapplying the category insert does not overwrite an existing category.
- Exact category import succeeds for all listed classifier leaves.
- The previously failing `jackets` import no longer returns
  `category_not_mapped`.

## Dependencies

- Classifier ticket `0031a-expanded-classifier-clothing-taxonomy`.
- Ticket `0024b1-durable-import-coordination-and-product-draft-creation`.

## Validation Result

- The focused website database mapping test passed.
- The linked website database reported all 18 required slugs.
- The previously failed `jackets` import completed successfully on explicit
  retry and created its ProductDraft.
