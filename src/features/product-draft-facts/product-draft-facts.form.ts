import {
  PRODUCT_DRAFT_FACT_FIELDS,
  type ProductDraftFactField,
  type ProductDraftFacts,
  type ProductDraftFactsPatch,
} from "./product-draft-facts.types";

export type ProductDraftFactsFormValues = Record<ProductDraftFactField, string>;

export function factsToFormValues(facts: ProductDraftFacts): ProductDraftFactsFormValues {
  return {
    colors: facts.colors.join("\n"),
    materialComposition: facts.materialComposition ?? "",
  };
}

export function parseFactsListInput(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildProductDraftFactsPatch(
  form: ProductDraftFactsFormValues,
  currentFacts: ProductDraftFacts,
  touchedFields: ReadonlySet<ProductDraftFactField>,
): ProductDraftFactsPatch | null {
  const patch: Partial<ProductDraftFactsPatch> = {};

  for (const field of PRODUCT_DRAFT_FACT_FIELDS) {
    if (!touchedFields.has(field)) continue;

    if (field === "colors") {
      const nextValue = parseFactsListInput(form[field]);
      if (!arraysEqual(nextValue, currentFacts[field])) patch[field] = nextValue;
      continue;
    }

    const nextValue = form[field].trim() || null;
    if (nextValue !== currentFacts[field]) patch[field] = nextValue;
  }

  return Object.keys(patch).length > 0 ? (patch as ProductDraftFactsPatch) : null;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
