import type {
  ProductDraftFacts,
  ProductDraftFactsPatch,
  ProductStatus,
} from "./product-draft-facts.types";

export type ProductDraftFactsRecord = {
  productDraftId: string;
  facts: ProductDraftFacts;
  factsRevision: number;
  updatedAt: string;
};

export type ProductDraftFactsReadResult = {
  productDraftId: string;
  moderationRevision: number;
  editable?: boolean;
  productStatus: ProductStatus;
  factsRecord: ProductDraftFactsRecord | null;
} | null;

export type ProductDraftFactsPatchResult =
  | ({
      result: "updated" | "unchanged";
      moderationRevision: number;
      productStatus: ProductStatus;
    } & ProductDraftFactsRecord)
  | {
      result: "not_found";
    }
  | {
      result: "facts_missing";
    }
  | {
      result: "not_editable";
      productDraftId: string;
      productStatus: ProductStatus;
    };

export interface ProductDraftFactsRepository {
  get(
    productDraftId: string,
    expectedSellerId: string | null,
  ): Promise<ProductDraftFactsReadResult>;

  applyPatch(
    productDraftId: string,
    patch: ProductDraftFactsPatch,
    expectedSellerId: string | null,
    expectedModerationRevision: number,
  ): Promise<ProductDraftFactsPatchResult>;
}
