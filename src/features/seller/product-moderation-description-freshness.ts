import type { ProductModerationSnapshot } from "./product-moderation-snapshot.types";

export type ProductModerationDescriptionWarning = {
  language: ProductModerationSnapshot["descriptions"][number]["language"];
  descriptionFactsRevision: number | null;
  currentFactsRevision: number | null;
};

export function productModerationDescriptionWarnings(
  snapshot: ProductModerationSnapshot,
): ProductModerationDescriptionWarning[] {
  const currentFactsRevision = snapshot.facts?.factsRevision ?? null;
  return snapshot.descriptions.flatMap((description) =>
    description.factsRevision === currentFactsRevision
      ? []
      : [
          {
            language: description.language,
            descriptionFactsRevision: description.factsRevision,
            currentFactsRevision,
          },
        ],
  );
}
