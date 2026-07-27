import type { Database } from "@/lib/supabase/types";

import type { ApprovedGroup, ImageImportActionState } from "./classifier-import.types";
import type { ProductImageStorageBucket } from "./destination-image-storage";

export type ProductDraftImagePromotion =
  Database["public"]["Tables"]["product_draft_image_promotions"]["Row"];

export type PromotionWorkItem = ProductDraftImagePromotion & {
  destinationKey: string;
  sourcePosition: number;
  storageBucket: ProductImageStorageBucket;
};

export type PreparePromotionGroupResult =
  | { result: "prepared"; productDraftId: string }
  | {
      result: "claim_lost" | "group_not_prepared" | "source_membership_conflict";
    };

export interface ClassifierImagePromotionRepository {
  prepareGroup(
    importId: string,
    runAttemptToken: string,
    group: ApprovedGroup,
  ): Promise<PreparePromotionGroupResult>;
  listGroupPromotions(productDraftId: string): Promise<PromotionWorkItem[]>;
  listPromotedRunImages(input: {
    classifierOrganizationId: string;
    classifierBatchId: string;
  }): Promise<PromotionWorkItem[]>;
  claimPromotion(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    claimTimeoutSeconds: number;
  }): Promise<PromotionWorkItem | null>;
  verifyClaim(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    promotionAttemptToken: string;
  }): Promise<boolean>;
  heartbeatRun(importId: string, runAttemptToken: string): Promise<boolean>;
  setSourceContentLength(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    promotionAttemptToken: string;
    sourceContentLength: number;
  }): Promise<boolean>;
  finalizeSuccess(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    promotionAttemptToken: string;
    destinationSizeBytes: number;
  }): Promise<boolean>;
  finalizeFailure(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    promotionAttemptToken: string;
    errorCode: string;
    retryable: boolean;
  }): Promise<boolean>;
  getActionState(importId: string): Promise<ImageImportActionState>;
  resetMissing(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
  }): Promise<boolean>;
  markConflict(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
  }): Promise<boolean>;
}
