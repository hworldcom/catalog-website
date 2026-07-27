import type {
  ApprovedBatchPageRequest,
  ApprovedBatchReader,
} from "./classifier-approved-batches.service";
import type { ClassifierImportRun } from "./classifier-import.types";

export interface ClassifierBatchInboxRepository {
  listRunsForBatches(
    classifierOrganizationId: string,
    classifierBatchIds: string[],
  ): Promise<ClassifierImportRun[]>;
  getSellerNames(sellerIds: string[]): Promise<Map<string, string>>;
}

export type ClassifierBatchInboxPage = {
  items: {
    batchId: string;
    organizationId: string;
    pipelineVersion: string;
    createdAt: string;
    finalizedAt: string | null;
    originalFileCount: number;
    processedFileCount: number;
    groupCount: number;
    imports: {
      importId: string;
      destinationSeller: { id: string; name: string | null };
      status: ClassifierImportRun["status"];
      operationKind: ClassifierImportRun["operation_kind"];
      errorCode: string | null;
      createdAt: string;
      updatedAt: string;
    }[];
  }[];
  nextCursor: string | null;
};

export interface ClassifierBatchInboxReader {
  list(request: ApprovedBatchPageRequest): Promise<ClassifierBatchInboxPage>;
}

export class ClassifierBatchInboxService implements ClassifierBatchInboxReader {
  constructor(
    private readonly approvedBatches: ApprovedBatchReader,
    private readonly repository: ClassifierBatchInboxRepository,
    private readonly classifierOrganizationId: string,
  ) {}

  async list(request: ApprovedBatchPageRequest): Promise<ClassifierBatchInboxPage> {
    const page = await this.approvedBatches.listApprovedBatches(request);
    const batchIds = page.items.map((batch) => batch.batchId);
    const runs = await this.repository.listRunsForBatches(this.classifierOrganizationId, batchIds);
    const sellerNames = await this.repository.getSellerNames([
      ...new Set(runs.map((run) => run.seller_id)),
    ]);
    const runsByBatchId = new Map<string, ClassifierImportRun[]>();
    for (const run of runs) {
      const batchRuns = runsByBatchId.get(run.classifier_batch_id) ?? [];
      batchRuns.push(run);
      runsByBatchId.set(run.classifier_batch_id, batchRuns);
    }

    return {
      items: page.items.map((batch) => ({
        ...batch,
        organizationId: page.organizationId,
        imports: (runsByBatchId.get(batch.batchId) ?? []).map((run) => ({
          importId: run.id,
          destinationSeller: {
            id: run.seller_id,
            name: sellerNames.get(run.seller_id) ?? null,
          },
          status: run.status,
          operationKind: run.operation_kind,
          errorCode: run.error_code,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
        })),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
