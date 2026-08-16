import type {
  ProductDraftDescriptionEntry,
  ProductDraftDescriptionPatch,
  ProductDraftDescriptionStatus,
} from "./product-draft-descriptions.types";

export type ProductDraftDescriptionRecord = {
  productDraftId: string;
  moderationRevision: number;
  editable?: boolean;
  productStatus: ProductDraftDescriptionStatus;
  categoryId: string | null;
  currentFactsRevision: number | null;
  descriptions: ProductDraftDescriptionEntry[];
} | null;

export type ProductDraftDescriptionPatchResult =
  | {
      result: "applied";
      snapshot: NonNullable<ProductDraftDescriptionRecord>;
    }
  | { result: "not_found" | "facts_missing" | "not_editable" };

export interface ProductDraftDescriptionRepository {
  get(
    productDraftId: string,
    expectedSellerId: string | null,
  ): Promise<ProductDraftDescriptionRecord>;
  applyPatch(
    productDraftId: string,
    patch: ProductDraftDescriptionPatch,
    expectedSellerId: string | null,
    expectedModerationRevision: number,
  ): Promise<ProductDraftDescriptionPatchResult>;
}
