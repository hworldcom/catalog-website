# Ticket 0039: Audience-Aware Storefront Navigation

## Status

Implemented through tickets `0039a` through `0039d` on 2026-08-10.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0039-audience-aware-storefront-navigation.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Replace the flat category-card discovery experience with an audience-first
public navigation inspired by the information architecture described for the
About You storefront:

- Women, Men, and Kids establish the current browsing audience;
- Clothing opens the applicable garment categories; and
- Sellers opens a visual directory of applicable seller logos.

Use Bazoria's existing visual language. Do not copy another storefront's brand,
content, source code, or exact styling.

## Product Model

Garment type and audience are separate concepts:

- category describes what the product is, such as T-shirts, trousers, or
  dresses;
- audience describes which public departments contain the product: `women`,
  `men`, and `kids`.

Do not duplicate garment categories into separate Men and Women taxonomy
branches. A product has exactly one garment category for taxonomy and product-
code purposes, but may have one or more audience memberships. An adult product
offered to everyone receives both `women` and `men`; no hidden `unisex` value or
special Kids rule exists.

Seller inclusion is derived from published products. Do not ask sellers to
maintain a second category or audience declaration that can drift from their
catalog.

## User Experience

The public header exposes:

```text
Women  Men  Kids
Clothing  Sellers
```

- Clothing opens garment-category links available for the selected audience.
- Sellers opens seller logos and accessible seller names for the selected
  audience.
- Products assigned to both Women and Men remain discoverable in both.
- Mobile uses tap-operated disclosures because hover is unavailable.
- Keyboard and pointer users receive equivalent behavior.

## Child Tickets

- `0039a-product-audience-persistence-and-editing`
- `0039b-audience-aware-public-catalog-reads`
- `0039c-responsive-clothing-and-seller-navigation`
- `0039d-homepage-category-discovery-cleanup`

Implement the child tickets in that order. `0039c` depends on the read contract
from `0039b`; `0039d` removes the old discovery surface only after the new
navigation is usable.

## Non-Goals

- Changing classifier garment-category prediction.
- Automatically inferring audience from an image.
- Adding an Unisex audience value or fourth public audience tab.
- Adding footwear, accessories, or non-clothing departments.
- Reproducing another company's visual design.

## Acceptance Criteria

- Product audience memberships are durable and independent from the singular
  garment category.
- Every published product has at least one Women, Men, or Kids membership.
- Women, Men, and Kids are the only public audience choices.
- Clothing and Sellers respond to the selected audience.
- A product assigned to Women and Men appears in both without a separate public
  audience.
- Seller inclusion is derived from matching published products rather than
  manually maintained seller-category memberships.
- The navigation works with pointer, keyboard, and touch interaction.
- The old homepage category-card grid is removed only after replacement
  navigation is complete.

## Dependencies

- Existing Bazoria categories and published-product read model.
- Existing seller logos, public seller routes, and seller publication state.
- Existing root `lang` search-parameter contract.
