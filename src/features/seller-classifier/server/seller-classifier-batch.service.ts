import {
  SellerClassifierBatchError,
  type SellerClassifierBatchSnapshot,
} from "../seller-classifier-batch.types";
import {
  ClassifierBatchProvisioningClientError,
  type ClassifierBatchProvisioner,
} from "./classifier-batch-provisioning-api";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";

const unavailableCode = "seller_classifier_unavailable";

export class SellerClassifierBatchOwnershipService {
  constructor(protected readonly repository: SellerClassifierBatchRepository) {}

  async get(workflowId: string, sellerId: string): Promise<SellerClassifierBatchSnapshot> {
    const record = await this.repository.findOwned(workflowId, sellerId);
    if (!record) throw workflowNotFound();
    return snapshot(record);
  }
}

export class SellerClassifierBatchService extends SellerClassifierBatchOwnershipService {
  constructor(
    repository: SellerClassifierBatchRepository,
    private readonly provisioner: ClassifierBatchProvisioner,
    private readonly classifierOrganizationId: string,
  ) {
    super(repository);
  }

  async create(input: {
    sellerId: string;
    userId: string;
    requestId: string;
  }): Promise<SellerClassifierBatchSnapshot> {
    return this.createForInitiator({ ...input, initiatorKind: "seller" });
  }

  async createForAdministrator(input: {
    sellerId: string;
    userId: string;
    requestId: string;
  }): Promise<SellerClassifierBatchSnapshot> {
    return this.createForInitiator({ ...input, initiatorKind: "administrator" });
  }

  private async createForInitiator(input: {
    sellerId: string;
    userId: string;
    requestId: string;
    initiatorKind: "seller" | "administrator";
  }): Promise<SellerClassifierBatchSnapshot> {
    const result = await this.repository.createOrGet({
      sellerId: input.sellerId,
      clientRequestId: input.requestId,
      classifierOrganizationId: this.classifierOrganizationId,
      initiatedByUserId: input.userId,
      initiatorKind: input.initiatorKind,
    });

    if (result.operation === "created") return this.provision(result.record);
    if (result.record.provisioningStatus === "ready") return snapshot(result.record);
    if (result.record.provisioningStatus === "failed") return snapshot(result.record);
    throw provisioningInProgress();
  }

  async retry(workflowId: string, sellerId: string): Promise<SellerClassifierBatchSnapshot> {
    const claim = await this.repository.claimRetry(workflowId, sellerId);

    if (claim.operation === "not_found" || !claim.record) throw workflowNotFound();
    if (claim.operation === "ready") return snapshot(claim.record);
    if (claim.operation === "in_progress") throw provisioningInProgress();
    if (claim.operation === "not_retryable") {
      throw new SellerClassifierBatchError(
        409,
        "seller_classifier_batch_provisioning_not_retryable",
        "This classifier workflow cannot be retried.",
      );
    }
    return this.provision(claim.record);
  }

  private async provision(
    record: SellerClassifierBatchRecord,
  ): Promise<SellerClassifierBatchSnapshot> {
    let provisioned;
    try {
      provisioned = await this.provisioner.createBatch(record.id);
    } catch (error) {
      const retryable = error instanceof ClassifierBatchProvisioningClientError && error.retryable;
      const failure = await this.repository.failProvisioning({
        workflowId: record.id,
        errorCode: unavailableCode,
        retryable,
      });
      if (failure.operation === "ready" && failure.record) return snapshot(failure.record);
      throw classifierUnavailable();
    }

    const completion = await this.repository.completeProvisioning({
      workflowId: record.id,
      classifierBatchId: provisioned.batchId,
      maxFiles: provisioned.maxFiles,
      maxFileSizeBytes: provisioned.maxFileSizeBytes,
    });
    if (
      (completion.operation === "completed" || completion.operation === "ready") &&
      completion.record
    ) {
      return snapshot(completion.record);
    }
    throw classifierUnavailable();
  }
}

function snapshot(record: SellerClassifierBatchRecord): SellerClassifierBatchSnapshot {
  return {
    workflowId: record.id,
    provisioningStatus: record.provisioningStatus,
    stage: record.lastKnownStage,
    errorCode: record.errorCode,
    retryAllowed: record.lastKnownStage === "failed" && record.retryable,
    maxFiles: record.maxFiles,
    maxFileSizeBytes: record.maxFileSizeBytes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function workflowNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_batch_not_found",
    "The classifier workflow was not found.",
  );
}

function provisioningInProgress(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_batch_provisioning_in_progress",
    "Classifier workflow provisioning is already in progress.",
  );
}

function classifierUnavailable(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    503,
    "seller_classifier_unavailable",
    "The classifier is temporarily unavailable.",
  );
}
