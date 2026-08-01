import { z } from "zod";

import { SellerClassifierBatchError } from "./seller-classifier-batch.types";

export type SellerClassifierComparisonStatus =
  "not_started" | "pending" | "running" | "completed" | "failed";

export type SellerClassifierComparisonFailureCode =
  | "comparison_dispatch_unavailable"
  | "comparison_provider_unavailable"
  | "comparison_storage_unavailable"
  | "comparison_persistence_unavailable"
  | "comparison_not_allowed"
  | "comparison_claim_expired"
  | "comparison_unknown_failure";

export type SellerClassifierComparisonSnapshot = {
  workflowId: string;
  status: SellerClassifierComparisonStatus;
  attemptCount: number;
  retryable: boolean;
  failureCode: SellerClassifierComparisonFailureCode | null;
};

export type SellerClassifierComparisonClient = {
  dispatchComparison(workflowId: string): Promise<SellerClassifierComparisonSnapshot>;
  getComparisonStatus(workflowId: string): Promise<SellerClassifierComparisonSnapshot>;
};

const workflowSchema = z.object({ workflowId: z.string().uuid() }).strict();

export function parseSellerClassifierComparisonInput(input: unknown): { workflowId: string } {
  const result = workflowSchema.safeParse(input);
  if (!result.success) throw comparisonWorkflowNotFound();
  return result.data;
}

function comparisonWorkflowNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_batch_not_found",
    "The classifier workflow was not found.",
  );
}
