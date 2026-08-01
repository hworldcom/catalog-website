import { describe, expect, it, vi } from "vitest";

import { decodeSellerClassifierHistoryCursor } from "../seller-classifier-history.cursor";
import type {
  SellerClassifierHistoryRecord,
  SellerClassifierHistoryRepository,
} from "./seller-classifier-history.repository";
import { SellerClassifierHistoryRepositoryError } from "./seller-classifier-history.repository";
import { SellerClassifierHistoryService } from "./seller-classifier-history.service";

describe("SellerClassifierHistoryService", () => {
  it("uses limit plus one, maps every nonfailed action, and returns a strict cursor", async () => {
    const records = [
      record(1, "provisioning"),
      record(2, "upload"),
      record(3, "processing"),
      record(4, "review"),
      record(5, "approved"),
      record(6, "importing", { withImport: true }),
      record(7, "drafts_ready", { withImport: true }),
      record(8, "upload"),
    ];
    const repository = repositoryMock(records);

    const page = await new SellerClassifierHistoryService(repository).list(uuid(900), {
      cursor: null,
      limit: 7,
    });

    expect(repository.listOwned).toHaveBeenCalledWith({
      sellerId: uuid(900),
      limit: 8,
      before: null,
    });
    expect(page.workflows.map((item) => item.primaryAction)).toEqual([
      "none",
      "open_upload",
      "open_processing",
      "open_review",
      "open_import",
      "open_import",
      "open_import",
    ]);
    expect(page.workflows.map((item) => item.productAccessAction)).toEqual([
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
    ]);
    expect(decodeSellerClassifierHistoryCursor(page.nextCursor!)).toEqual({
      version: 1,
      createdAt: records[6]!.createdAt,
      workflowId: records[6]!.id,
    });
  });

  it("keeps unknown counts null and preserves known zero counts", async () => {
    const repository = repositoryMock([
      record(1, "provisioning"),
      record(2, "processing"),
      record(3, "review"),
      record(4, "drafts_ready", { withImport: true }),
    ]);

    const page = await new SellerClassifierHistoryService(repository).list(uuid(900), {
      cursor: null,
      limit: 10,
    });

    expect(page.workflows.map((item) => item.counts)).toEqual([
      { originalFiles: null, processedFiles: null, groups: null, productDrafts: null },
      { originalFiles: 4, processedFiles: 0, groups: null, productDrafts: null },
      { originalFiles: 4, processedFiles: 0, groups: 0, productDrafts: null },
      { originalFiles: 4, processedFiles: 0, groups: 0, productDrafts: 0 },
    ]);
  });

  it("exposes product access independently from a failed import action", async () => {
    const repository = repositoryMock([
      record(1, "failed", {
        withImport: true,
        productDraftCount: 2,
        errorCode: "seller_classifier_import_incomplete",
        importErrorCode: "seller_classifier_import_incomplete",
      }),
    ]);

    const page = await new SellerClassifierHistoryService(repository).list(uuid(900), {
      cursor: null,
      limit: 10,
    });

    expect(page.workflows[0]).toMatchObject({
      primaryAction: "open_import",
      productAccessAction: "open_products",
      counts: { productDrafts: 2 },
    });
  });

  it.each([
    {
      name: "retryable provisioning",
      input: record(1, "failed", {
        provisioningStatus: "failed",
        retryable: true,
      }),
      action: "retry_provisioning",
      summary: "provisioning_failed",
      support: null,
    },
    {
      name: "non-retryable provisioning",
      input: record(2, "failed", {
        provisioningStatus: "failed",
        retryable: false,
      }),
      action: "none",
      summary: "provisioning_failed",
      support: uuid(2),
    },
    {
      name: "processing",
      input: record(3, "failed", {
        errorCode: "seller_classifier_processing_failed",
        retryable: true,
      }),
      action: "open_processing",
      summary: "processing_failed",
      support: null,
    },
    {
      name: "partial import",
      input: record(4, "failed", {
        withImport: true,
        errorCode: "seller_classifier_import_incomplete",
        importErrorCode: "seller_classifier_import_incomplete",
        retryable: true,
      }),
      action: "open_import",
      summary: "import_incomplete",
      support: null,
    },
    {
      name: "terminal import",
      input: record(5, "failed", {
        withImport: true,
        errorCode: "seller_classifier_import_failed",
        importErrorCode: "seller_classifier_import_failed",
        retryable: false,
      }),
      action: "open_import",
      summary: "import_failed",
      support: uuid(5),
    },
    {
      name: "unexpected",
      input: record(6, "failed", {
        errorCode: "internal_detail_that_must_not_be_returned",
        retryable: false,
      }),
      action: "none",
      summary: "unexpected_failure",
      support: uuid(6),
    },
  ])("derives safe recovery for $name failure", async ({ input, action, summary, support }) => {
    const page = await new SellerClassifierHistoryService(repositoryMock([input])).list(uuid(900), {
      cursor: null,
      limit: 25,
    });

    expect(page.workflows[0]).toMatchObject({
      primaryAction: action,
      errorSummaryCode: summary,
      supportReference: support,
    });
    expect(page.workflows[0]).not.toHaveProperty("errorCode");
    expect(page.workflows[0]).not.toHaveProperty("import");
  });

  it("applies a decoded cursor without letting it change seller ownership", async () => {
    const repository = repositoryMock([]);
    const first = new SellerClassifierHistoryService(
      repositoryMock([record(1, "upload"), record(2, "upload")]),
    );
    const firstPage = await first.list(uuid(1), { cursor: null, limit: 1 });

    await new SellerClassifierHistoryService(repository).list(uuid(2), {
      cursor: firstPage.nextCursor,
      limit: 1,
    });

    expect(repository.listOwned).toHaveBeenCalledWith({
      sellerId: uuid(2),
      limit: 2,
      before: {
        version: 1,
        createdAt: record(1, "upload").createdAt,
        workflowId: uuid(1),
      },
    });
  });

  it("maps repository failures to the stable history error", async () => {
    const repository = repositoryMock([]);
    vi.mocked(repository.listOwned).mockRejectedValueOnce(
      new SellerClassifierHistoryRepositoryError("database detail"),
    );

    await expect(
      new SellerClassifierHistoryService(repository).list(uuid(1), {
        cursor: null,
        limit: 25,
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "seller_classifier_history_unavailable",
    });
  });
});

function repositoryMock(
  records: SellerClassifierHistoryRecord[],
): SellerClassifierHistoryRepository & {
  listOwned: ReturnType<typeof vi.fn>;
} {
  return {
    listOwned: vi.fn(async () => records),
  };
}

function record(
  value: number,
  stage: SellerClassifierHistoryRecord["stage"],
  options: {
    provisioningStatus?: SellerClassifierHistoryRecord["provisioningStatus"];
    withImport?: boolean;
    errorCode?: string | null;
    importErrorCode?: string | null;
    retryable?: boolean;
    productDraftCount?: number;
  } = {},
): SellerClassifierHistoryRecord {
  return {
    id: uuid(value),
    initiatorKind: "seller",
    provisioningStatus: options.provisioningStatus ?? "ready",
    stage,
    originalFileCount: 4,
    processedFileCount: 0,
    groupCount: 0,
    productDraftCount: options.productDraftCount ?? 0,
    errorCode: options.errorCode ?? null,
    retryable: options.retryable ?? false,
    createdAt: `2026-07-${String(30 - value).padStart(2, "0")}T10:00:00.000Z`,
    updatedAt: `2026-07-${String(30 - value).padStart(2, "0")}T10:01:00.000Z`,
    import: options.withImport
      ? {
          id: uuid(value + 100),
          status:
            options.importErrorCode === "seller_classifier_import_incomplete"
              ? "completed_with_errors"
              : stage === "failed"
                ? "failed"
                : "running",
          errorCode: options.importErrorCode ?? null,
          retryable: options.retryable ?? false,
        }
      : null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
