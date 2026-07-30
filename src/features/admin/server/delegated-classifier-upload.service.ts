import {
  delegatedUploadSellerNotFound,
  delegatedUploadUnavailable,
  delegatedUploadWorkflowNotFound,
  type CreateDelegatedClassifierBatchInput,
  type DelegatedClassifierWorkflowContext,
  type DelegatedUploadSeller,
  type DelegatedUploadSellerSearchRequest,
  type DelegatedUploadSellerSearchResult,
} from "../delegated-classifier-upload.types";
import type {
  RegisterSellerClassifierUploadsInput,
  RetrySellerClassifierUploadsInput,
  SellerClassifierFinalizeResult,
  SellerClassifierProcessingSnapshot,
  SellerClassifierUploadRegistration,
  SellerClassifierUploadSnapshot,
} from "@/features/seller-classifier/seller-classifier-workflow.types";
import type { SellerClassifierBatchService } from "@/features/seller-classifier/server/seller-classifier-batch.service";
import type { SellerClassifierWorkflowService } from "@/features/seller-classifier/server/seller-classifier-workflow.service";

import {
  DelegatedClassifierUploadRepositoryError,
  type DelegatedClassifierUploadRepository,
} from "./delegated-classifier-upload.repository";

type ProvisioningService = Pick<SellerClassifierBatchService, "createForAdministrator" | "retry">;
type WorkflowService = Pick<
  SellerClassifierWorkflowService,
  "register" | "retryUploads" | "getUploads" | "finalize" | "startProcessing" | "getProcessing"
>;

export class DelegatedClassifierUploadService {
  constructor(
    private readonly repository: DelegatedClassifierUploadRepository,
    private readonly provisioning: ProvisioningService,
    private readonly workflow: WorkflowService,
  ) {}

  async searchSellers(
    request: DelegatedUploadSellerSearchRequest,
  ): Promise<DelegatedUploadSellerSearchResult> {
    return this.mapRepositoryErrors(async () => ({
      sellers: await this.repository.searchSellers(request),
    }));
  }

  async create(
    input: CreateDelegatedClassifierBatchInput,
    administratorUserId: string,
  ): Promise<DelegatedClassifierWorkflowContext> {
    return this.mapRepositoryErrors(async () => {
      const seller = await this.repository.findSeller(input.sellerId);
      if (!seller) throw delegatedUploadSellerNotFound();
      const workflow = await this.provisioning.createForAdministrator({
        sellerId: seller.sellerId,
        userId: administratorUserId,
        requestId: input.requestId,
      });
      return { seller, workflow };
    });
  }

  async get(workflowId: string): Promise<DelegatedClassifierWorkflowContext> {
    return this.withDelegatedWorkflow(workflowId, async (seller, workflow) => ({
      seller,
      workflow: snapshot(workflow),
    }));
  }

  async retryProvisioning(workflowId: string): Promise<DelegatedClassifierWorkflowContext> {
    return this.withDelegatedWorkflow(workflowId, async (seller, record) => ({
      seller,
      workflow: await this.provisioning.retry(record.id, record.sellerId),
    }));
  }

  async register(
    input: RegisterSellerClassifierUploadsInput,
  ): Promise<SellerClassifierUploadRegistration> {
    return this.withDelegatedWorkflow(input.workflowId, (_seller, record) =>
      this.workflow.register(record.sellerId, input),
    );
  }

  async retryUploads(
    input: RetrySellerClassifierUploadsInput,
  ): Promise<SellerClassifierUploadRegistration> {
    return this.withDelegatedWorkflow(input.workflowId, (_seller, record) =>
      this.workflow.retryUploads(record.id, record.sellerId, input.imageIds),
    );
  }

  async getUploads(workflowId: string): Promise<SellerClassifierUploadSnapshot> {
    return this.withDelegatedWorkflow(workflowId, (_seller, record) =>
      this.workflow.getUploads(record.id, record.sellerId),
    );
  }

  async finalize(workflowId: string): Promise<SellerClassifierFinalizeResult> {
    return this.withDelegatedWorkflow(workflowId, (_seller, record) =>
      this.workflow.finalize(record.id, record.sellerId),
    );
  }

  async startProcessing(workflowId: string): Promise<SellerClassifierProcessingSnapshot> {
    return this.withDelegatedWorkflow(workflowId, (_seller, record) =>
      this.workflow.startProcessing(record.id, record.sellerId),
    );
  }

  async getProcessing(workflowId: string): Promise<SellerClassifierProcessingSnapshot> {
    return this.withDelegatedWorkflow(workflowId, (_seller, record) =>
      this.workflow.getProcessing(record.id, record.sellerId),
    );
  }

  private async withDelegatedWorkflow<T>(
    workflowId: string,
    operation: (
      seller: DelegatedUploadSeller,
      workflow: NonNullable<
        Awaited<ReturnType<DelegatedClassifierUploadRepository["findWorkflow"]>>
      >,
    ) => Promise<T> | T,
  ): Promise<T> {
    return this.mapRepositoryErrors(async () => {
      const workflow = await this.repository.findWorkflow(workflowId);
      if (!workflow || workflow.initiatorKind !== "administrator") {
        throw delegatedUploadWorkflowNotFound();
      }
      const seller = await this.repository.findSeller(workflow.sellerId);
      if (!seller) throw delegatedUploadUnavailable();
      return operation(seller, workflow);
    });
  }

  private async mapRepositoryErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DelegatedClassifierUploadRepositoryError) {
        throw delegatedUploadUnavailable();
      }
      throw error;
    }
  }
}

function snapshot(
  record: NonNullable<Awaited<ReturnType<DelegatedClassifierUploadRepository["findWorkflow"]>>>,
) {
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
