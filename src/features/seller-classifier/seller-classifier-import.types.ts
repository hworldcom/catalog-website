import { z } from "zod";

import { SellerClassifierBatchError } from "./seller-classifier-batch.types";

export type SellerClassifierDraftImportStage = "approved" | "importing" | "drafts_ready" | "failed";

export type SellerClassifierDraftImportStatus =
  "pending" | "running" | "completed" | "completed_with_errors" | "failed";

export type SellerClassifierProductDraftImageStatus =
  "pending" | "available" | "partially_available" | "failed";

export type SellerClassifierProductDraftSummary = {
  productDraftId: string;
  title: string | null;
  category: {
    slug: string;
    name: string;
  } | null;
  productCode: string | null;
  status: "draft" | "published" | "archived";
  imageStatus: SellerClassifierProductDraftImageStatus;
};

export type SellerClassifierDraftImportSnapshot = {
  workflowId: string;
  stage: SellerClassifierDraftImportStage;
  importStatus: SellerClassifierDraftImportStatus | null;
  continuationAllowed: boolean;
  retryAllowed: boolean;
  errorCode: string | null;
  pendingGroupCount: number;
  processingGroupCount: number;
  completeGroupCount: number;
  failedGroupCount: number;
  productDrafts: SellerClassifierProductDraftSummary[];
};

const inputSchema = z
  .object({
    workflowId: z.string().uuid(),
  })
  .strict();

export function parseSellerClassifierImportInput(input: unknown): { workflowId: string } {
  const result = inputSchema.safeParse(input);
  if (!result.success) {
    throw new SellerClassifierBatchError(
      400,
      "seller_classifier_approval_invalid",
      "The seller classifier approval request is invalid.",
    );
  }
  return result.data;
}
