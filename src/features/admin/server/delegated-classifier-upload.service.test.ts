import { describe, expect, it, vi } from "vitest";

import type { SellerClassifierBatchRecord } from "@/features/seller-classifier/server/seller-classifier-batch.repository";

import type { DelegatedClassifierUploadRepository } from "./delegated-classifier-upload.repository";
import { DelegatedClassifierUploadRepositoryError } from "./delegated-classifier-upload.repository";
import { DelegatedClassifierUploadService } from "./delegated-classifier-upload.service";

describe("DelegatedClassifierUploadService", () => {
  it("searches sellers through a bounded safe result", async () => {
    const { repository, service } = setup();
    repository.searchSellers.mockResolvedValueOnce([seller()]);

    await expect(service.searchSellers({ query: "shop", limit: 20 })).resolves.toEqual({
      sellers: [seller()],
    });
    expect(repository.searchSellers).toHaveBeenCalledWith({ query: "shop", limit: 20 });
  });

  it("creates administrator-owned audit metadata for the selected seller", async () => {
    const { provisioning, service } = setup();

    const result = await service.create(
      {
        sellerId: uuid(10),
        requestId: uuid(20),
      },
      uuid(30),
    );

    expect(provisioning.createForAdministrator).toHaveBeenCalledWith({
      sellerId: uuid(10),
      userId: uuid(30),
      requestId: uuid(20),
    });
    expect(result.seller).toEqual(seller());
    expect(result.workflow.workflowId).toBe(uuid(1));
  });

  it("uses the immutable stored seller for delegated workflow operations", async () => {
    const { service, workflow } = setup();

    await service.startProcessing(uuid(1));

    expect(workflow.startProcessing).toHaveBeenCalledWith(uuid(1), uuid(10));
  });

  it("hides seller-created and unknown workflows behind the same outcome", async () => {
    const sellerCreated = setup({ workflow: record({ initiatorKind: "seller" }) });
    await expect(sellerCreated.service.get(uuid(1))).rejects.toMatchObject({
      statusCode: 404,
      code: "delegated_upload_workflow_not_found",
    });

    const unknown = setup({ workflow: null });
    await expect(unknown.service.get(uuid(1))).rejects.toMatchObject({
      statusCode: 404,
      code: "delegated_upload_workflow_not_found",
    });
  });

  it("maps repository failures to a stable unavailable outcome", async () => {
    const { repository, service } = setup();
    repository.findWorkflow.mockRejectedValueOnce(
      new DelegatedClassifierUploadRepositoryError("database unavailable"),
    );

    await expect(service.get(uuid(1))).rejects.toMatchObject({
      statusCode: 503,
      code: "delegated_upload_unavailable",
    });
  });
});

function setup(options: { workflow?: SellerClassifierBatchRecord | null } = {}) {
  const repository = {
    searchSellers: vi.fn(async () => [seller()]),
    findSeller: vi.fn(async () => seller()),
    findWorkflow: vi.fn(async () => (options.workflow === undefined ? record() : options.workflow)),
  } satisfies DelegatedClassifierUploadRepository;
  const provisioning = {
    createForAdministrator: vi.fn(async () => snapshot()),
    retry: vi.fn(async () => snapshot()),
  };
  const workflow = {
    register: vi.fn(),
    retryUploads: vi.fn(),
    getUploads: vi.fn(),
    finalize: vi.fn(),
    startProcessing: vi.fn(),
    getProcessing: vi.fn(),
  };
  return {
    repository,
    provisioning,
    workflow,
    service: new DelegatedClassifierUploadService(repository, provisioning, workflow),
  };
}

function seller() {
  return {
    sellerId: uuid(10),
    name: "Kesar Textiles",
    slug: "kesar-textiles",
    published: true,
  };
}

function snapshot() {
  return {
    workflowId: uuid(1),
    provisioningStatus: "ready" as const,
    stage: "upload" as const,
    errorCode: null,
    retryAllowed: false,
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    createdAt: "2026-07-30T10:00:00.000Z",
    updatedAt: "2026-07-30T10:01:00.000Z",
  };
}

function record(overrides: Partial<SellerClassifierBatchRecord> = {}): SellerClassifierBatchRecord {
  return {
    id: uuid(1),
    sellerId: uuid(10),
    clientRequestId: uuid(20),
    classifierOrganizationId: uuid(40),
    classifierBatchId: uuid(50),
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    provisioningStatus: "ready",
    lastKnownStage: "upload",
    originalFileCount: 0,
    processedFileCount: 0,
    groupCount: 0,
    productDraftCount: 0,
    errorCode: null,
    retryable: false,
    initiatedByUserId: uuid(30),
    initiatorKind: "administrator",
    createdAt: "2026-07-30T10:00:00.000Z",
    updatedAt: "2026-07-30T10:01:00.000Z",
    ...overrides,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
