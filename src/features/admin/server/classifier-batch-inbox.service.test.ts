import { describe, expect, it } from "vitest";

import type {
  ApprovedBatchPage,
  ApprovedBatchPageRequest,
  ApprovedBatchReader,
} from "./classifier-approved-batches.service";
import {
  ClassifierBatchInboxService,
  type ClassifierBatchInboxRepository,
} from "./classifier-batch-inbox.service";
import type { ClassifierImportRun } from "./classifier-import.types";

const organizationId = "00000000-0000-0000-0000-000000000001";
const importedBatchId = "00000000-0000-0000-0000-000000000010";
const unimportedBatchId = "00000000-0000-0000-0000-000000000011";
const sellerId = "00000000-0000-0000-0000-000000000020";

function page(): ApprovedBatchPage {
  const batch = (batchId: string) => ({
    batchId,
    status: "approved" as const,
    pipelineVersion: "2026-06-01",
    createdAt: "2026-07-22T10:00:00Z",
    finalizedAt: "2026-07-22T10:05:00Z",
    originalFileCount: 2,
    processedFileCount: 2,
    groupCount: 1,
  });
  return {
    organizationId,
    items: [batch(importedBatchId), batch(unimportedBatchId)],
    nextCursor: "next-page",
  };
}

function run(overrides: Partial<ClassifierImportRun> = {}): ClassifierImportRun {
  return {
    id: "00000000-0000-0000-0000-000000000030",
    classifier_organization_id: organizationId,
    classifier_batch_id: importedBatchId,
    seller_id: sellerId,
    pipeline_version: "2026-06-01",
    status: "completed",
    operation_kind: "import",
    requested_by_user_id: null,
    attempt_count: 1,
    attempt_token: null,
    claim_started_at: null,
    last_heartbeat_at: null,
    error_code: null,
    retryable: false,
    seller_classifier_workflow_id: null,
    retry_policy: "retryable_only",
    created_at: "2026-07-22T10:10:00Z",
    completed_at: "2026-07-22T10:12:00Z",
    updated_at: "2026-07-22T10:12:00Z",
    ...overrides,
  };
}

class BatchReader implements ApprovedBatchReader {
  request: ApprovedBatchPageRequest | null = null;

  async listApprovedBatches(request: ApprovedBatchPageRequest): Promise<ApprovedBatchPage> {
    this.request = request;
    return page();
  }
}

class InboxRepository implements ClassifierBatchInboxRepository {
  organizationId: string | null = null;
  batchIds: string[] = [];

  async listRunsForBatches(
    classifierOrganizationId: string,
    classifierBatchIds: string[],
  ): Promise<ClassifierImportRun[]> {
    this.organizationId = classifierOrganizationId;
    this.batchIds = classifierBatchIds;
    return [run()];
  }

  async getSellerNames(): Promise<Map<string, string>> {
    return new Map([[sellerId, "Kesar Textiles"]]);
  }
}

describe("ClassifierBatchInboxService", () => {
  it("joins imported batches and leaves unimported batches visible", async () => {
    const approvedBatches = new BatchReader();
    const repository = new InboxRepository();
    const service = new ClassifierBatchInboxService(approvedBatches, repository, organizationId);

    const result = await service.list({ limit: 25, cursor: "current" });

    expect(approvedBatches.request).toEqual({ limit: 25, cursor: "current" });
    expect(repository.organizationId).toBe(organizationId);
    expect(repository.batchIds).toEqual([importedBatchId, unimportedBatchId]);
    expect(result.nextCursor).toBe("next-page");
    expect(result.items[0]?.imports).toEqual([
      {
        importId: run().id,
        destinationSeller: { id: sellerId, name: "Kesar Textiles" },
        status: "completed",
        operationKind: "import",
        errorCode: null,
        createdAt: "2026-07-22T10:10:00Z",
        updatedAt: "2026-07-22T10:12:00Z",
      },
    ]);
    expect(result.items[1]?.imports).toEqual([]);
  });

  it("preserves a missing seller identifier with a null name", async () => {
    const repository = new InboxRepository();
    repository.getSellerNames = async () => new Map();
    const service = new ClassifierBatchInboxService(new BatchReader(), repository, organizationId);

    const result = await service.list({ limit: 50 });
    expect(result.items[0]?.imports[0]?.destinationSeller).toEqual({
      id: sellerId,
      name: null,
    });
  });
});
