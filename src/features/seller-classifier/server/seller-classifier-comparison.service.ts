import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import type {
  SellerClassifierComparisonFailureCode,
  SellerClassifierComparisonSnapshot,
} from "../seller-classifier-comparison.types";
import {
  ClassifierMultimodalComparisonClientError,
  type ClassifierMultimodalComparisonClient,
  type ClassifierMultimodalComparisonOperation,
  type ClassifierMultimodalComparisonRun,
} from "./classifier-multimodal-comparison-api";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";

const failureCodeMap: Readonly<Record<string, SellerClassifierComparisonFailureCode>> = {
  multimodal_comparison_dispatch_failed: "comparison_dispatch_unavailable",
  multimodal_comparison_provider_failed: "comparison_provider_unavailable",
  multimodal_comparison_storage_failed: "comparison_storage_unavailable",
  multimodal_comparison_database_failed: "comparison_persistence_unavailable",
  multimodal_comparison_not_allowed: "comparison_not_allowed",
  multimodal_comparison_claim_expired: "comparison_claim_expired",
};

export class SellerClassifierComparisonService {
  constructor(
    private readonly repository: SellerClassifierBatchRepository,
    private readonly classifier: ClassifierMultimodalComparisonClient,
    private readonly classifierOrganizationId: string,
  ) {}

  async dispatch(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierComparisonSnapshot> {
    const workflow = await this.requireReadyWorkflow(workflowId, sellerId);
    return this.request(workflow, workflowId, "dispatch_comparison", () =>
      this.classifier.dispatch(requireBatchId(workflow)),
    );
  }

  async getStatus(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierComparisonSnapshot> {
    const workflow = await this.requireReadyWorkflow(workflowId, sellerId);
    return this.request(workflow, workflowId, "read_comparison", () =>
      this.classifier.getStatus(requireBatchId(workflow)),
    );
  }

  private async request(
    workflow: SellerClassifierBatchRecord,
    workflowId: string,
    operation: ClassifierMultimodalComparisonOperation,
    request: () => Promise<ClassifierMultimodalComparisonRun>,
  ): Promise<SellerClassifierComparisonSnapshot> {
    let run: ClassifierMultimodalComparisonRun;
    try {
      run = await request();
    } catch (error) {
      throw mapClassifierError(error, operation);
    }
    return safeComparisonSnapshot(workflow, workflowId, run);
  }

  private async requireReadyWorkflow(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierBatchRecord> {
    const workflow = await this.repository.findOwned(workflowId, sellerId);
    if (!workflow) throw workflowNotFound();
    if (workflow.provisioningStatus !== "ready" || !workflow.classifierBatchId) {
      throw comparisonNotAllowed();
    }
    if (workflow.classifierOrganizationId !== this.classifierOrganizationId) {
      throw comparisonUnavailable();
    }
    return workflow;
  }
}

function safeComparisonSnapshot(
  workflow: SellerClassifierBatchRecord,
  workflowId: string,
  run: ClassifierMultimodalComparisonRun,
): SellerClassifierComparisonSnapshot {
  if (run.batchId !== workflow.classifierBatchId) throw integrationUnavailable();

  const status = run.status === "started" ? "running" : run.status;
  if (status === "failed") {
    if (!run.errorCode) throw integrationUnavailable();
    const failureCode = failureCodeMap[run.errorCode] ?? "comparison_unknown_failure";
    if (
      run.retryable &&
      (failureCode === "comparison_not_allowed" || failureCode === "comparison_unknown_failure")
    ) {
      throw integrationUnavailable();
    }
    if (failureCode === "comparison_unknown_failure") {
      console.error("[Seller classifier comparison] Unknown classifier failure code.", {
        workflowId,
        classifierErrorCode: run.errorCode,
      });
    }
    return {
      workflowId,
      status,
      attemptCount: run.attemptCount,
      retryable: run.retryable,
      failureCode,
    };
  }

  if (run.errorCode !== null || run.retryable) throw integrationUnavailable();
  return {
    workflowId,
    status,
    attemptCount: run.attemptCount,
    retryable: false,
    failureCode: null,
  };
}

function mapClassifierError(
  error: unknown,
  operation: ClassifierMultimodalComparisonOperation,
): SellerClassifierBatchError {
  if (!(error instanceof ClassifierMultimodalComparisonClientError)) {
    return comparisonUnavailable();
  }
  if (error.failureKind === "invalid_response") return integrationUnavailable();
  if (error.failureKind === "transport") return comparisonUnavailable();
  if (error.statusCode === 404) return integrationUnavailable();
  if (
    operation === "dispatch_comparison" &&
    error.statusCode === 409 &&
    error.classifierCode === "multimodal_comparison_not_allowed"
  ) {
    return comparisonNotAllowed();
  }
  return comparisonUnavailable();
}

function requireBatchId(workflow: SellerClassifierBatchRecord): string {
  if (!workflow.classifierBatchId) throw comparisonNotAllowed();
  return workflow.classifierBatchId;
}

function workflowNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_batch_not_found",
    "The classifier workflow was not found.",
  );
}

function comparisonNotAllowed(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_multimodal_comparison_not_allowed",
    "Multimodal comparison is not allowed for the current review.",
  );
}

function comparisonUnavailable(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    503,
    "seller_classifier_multimodal_comparison_unavailable",
    "Multimodal comparison is temporarily unavailable.",
  );
}

function integrationUnavailable(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    503,
    "seller_classifier_integration_unavailable",
    "The classifier returned an invalid comparison response.",
  );
}
