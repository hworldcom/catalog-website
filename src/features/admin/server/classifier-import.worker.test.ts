import { describe, expect, it } from "vitest";

import type { ClassifierImportConfig } from "./classifier-import.config";
import type {
  ClassifierImportRepository,
  CreateImportRunInput,
  CreateImportRunResult,
  PreparedImportGroup,
  ReconcileImportResult,
  RetryImportResult,
} from "./classifier-import.repository";
import type {
  ApprovedGroup,
  ApprovedGroupsSnapshot,
  ClassifierImportActions,
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
  GroupImagePreparationService,
} from "./classifier-import.types";
import { ClassifierImportError } from "./classifier-import.types";
import { ClassifierImportWorker, type ApprovedGroupsReader } from "./classifier-import.worker";

const config: ClassifierImportConfig = {
  classifierApiBaseUrl: "http://classifier.test",
  approvedGroupsTimeoutMs: 30_000,
  importRunLeaseTimeoutSeconds: 900,
  normalizedImageReadTimeoutMs: 30_000,
  storageHeadTimeoutMs: 15_000,
  storageWriteTimeoutMs: 60_000,
  imagePromotionClaimTimeoutSeconds: 300,
  workerPollIntervalMs: 5_000,
  dispatchMode: "local",
  classifierOrganizationId: "00000000-0000-0000-0000-000000000001",
};

const sellerId = "00000000-0000-0000-0000-000000000002";
const runId = "00000000-0000-0000-0000-000000000003";
const batchId = "00000000-0000-0000-0000-000000000004";
const attemptToken = "00000000-0000-0000-0000-000000000005";
const groupOneId = "00000000-0000-0000-0000-000000000011";
const groupTwoId = "00000000-0000-0000-0000-000000000012";

function claimedRun(overrides: Partial<ClassifierImportRun> = {}): ClassifierImportRun {
  return {
    id: runId,
    classifier_organization_id: config.classifierOrganizationId,
    classifier_batch_id: batchId,
    seller_id: sellerId,
    pipeline_version: null,
    status: "running",
    operation_kind: "import",
    requested_by_user_id: null,
    attempt_count: 1,
    attempt_token: attemptToken,
    claim_started_at: "2026-07-19T00:00:00Z",
    last_heartbeat_at: "2026-07-19T00:00:00Z",
    error_code: null,
    retryable: false,
    seller_classifier_workflow_id: null,
    retry_policy: "retryable_only",
    created_at: "2026-07-19T00:00:00Z",
    completed_at: null,
    updated_at: "2026-07-19T00:00:00Z",
    ...overrides,
  };
}

function approvedGroup(groupId: string, imageSuffix: string): ApprovedGroup {
  const imageId = `00000000-0000-0000-0000-0000000000${imageSuffix}`;
  return {
    groupId,
    approvedCategorySlug: "trousers",
    suggestedCategorySlug: null,
    coverImageId: imageId,
    confidence: 0.9,
    images: [
      {
        imageId,
        position: 0,
        isDuplicate: false,
        duplicateOfImageId: null,
      },
    ],
  };
}

function approvedSnapshot(
  groups: ApprovedGroup[],
  organizationId = config.classifierOrganizationId,
): ApprovedGroupsSnapshot {
  return {
    batchId,
    organizationId,
    status: "approved",
    pipelineVersion: "2026-06-01",
    groups,
  };
}

class MemoryRepository implements ClassifierImportRepository {
  readonly groups = new Map<string, ClassifierImportGroupOutcome>();
  claimed: ClassifierImportRun | null;
  sellerEligible = true;
  heartbeatAllowed = true;
  prepareFailures = new Map<string, PreparedImportGroup["result"]>();
  finalResult: ClassifierImportRun["status"] | null = null;
  finalErrorCode: string | null = null;
  finalRetryable = false;
  eligibleSellerId: string | null = null;

  constructor(run: ClassifierImportRun | null) {
    this.claimed = run;
  }

  async getRunBySource(
    _classifierOrganizationId: string,
    _classifierBatchId: string,
  ): Promise<ClassifierImportRun | null> {
    return null;
  }

  async createOrGetRun(_input: CreateImportRunInput): Promise<CreateImportRunResult> {
    throw new Error("not used");
  }

  async getRun(_importId: string): Promise<ClassifierImportRun | null> {
    return this.claimed;
  }

  async getSellerName(_sellerId: string): Promise<string | null> {
    return "Kesar Textiles";
  }

  async getEligibleSeller(_sellerId: string) {
    return { id: sellerId, name: "Kesar Textiles" };
  }

  async listGroupOutcomes(_importId: string): Promise<ClassifierImportGroupOutcome[]> {
    return [...this.groups.values()];
  }

  async getActionState(_importId: string): Promise<ClassifierImportActions | null> {
    return null;
  }

  async retryImport(_importId: string, _includeNonRetryable: boolean): Promise<RetryImportResult> {
    return "not_allowed";
  }

  async reconcileImport(_importId: string): Promise<ReconcileImportResult> {
    return "not_allowed";
  }

  async claimNextRun(_leaseTimeoutSeconds: number): Promise<ClassifierImportRun | null> {
    const run = this.claimed;
    this.claimed = null;
    return run;
  }

  async claimRun(
    importId: string,
    _leaseTimeoutSeconds: number,
  ): Promise<ClassifierImportRun | null> {
    if (importId !== runId) return null;
    const run = this.claimed;
    this.claimed = null;
    return run;
  }

  async heartbeat(importId: string, token: string): Promise<boolean> {
    return this.heartbeatAllowed && importId === runId && token === attemptToken;
  }

  async setPipelineVersion(
    _importId: string,
    _attemptToken: string,
    _pipelineVersion: string,
  ): Promise<boolean> {
    return this.heartbeatAllowed;
  }

  async isRunSellerEligible(candidateRun: ClassifierImportRun): Promise<boolean> {
    this.eligibleSellerId = candidateRun.seller_id;
    return this.sellerEligible;
  }

  async prepareGroup(
    _importId: string,
    _attemptToken: string,
    group: ApprovedGroup,
  ): Promise<PreparedImportGroup> {
    const failure = this.prepareFailures.get(group.groupId);
    if (failure && failure !== "prepared") {
      this.groups.set(
        group.groupId,
        groupOutcome(group, {
          status: "failed",
          error_code: failure,
        }),
      );
      return { result: failure };
    }

    const productDraftId = productId(group.groupId);
    this.groups.set(
      group.groupId,
      groupOutcome(group, {
        status: "pending",
        product_draft_id: productDraftId,
      }),
    );
    return { result: "prepared", productDraftId };
  }

  async setGroupResult(
    _importId: string,
    _attemptToken: string,
    groupId: string,
    result:
      | { status: "pending" | "processing" | "complete"; errorCode?: null }
      | { status: "failed"; errorCode: string; retryable: boolean },
  ): Promise<boolean> {
    const existing = this.groups.get(groupId);
    if (!this.heartbeatAllowed || !existing) return false;
    this.groups.set(groupId, {
      ...existing,
      status: result.status,
      error_code: result.status === "failed" ? result.errorCode : null,
      retryable: result.status === "failed" ? result.retryable : false,
    });
    return true;
  }

  async finalizeRun(
    _importId: string,
    _attemptToken: string,
    result:
      | { status: "completed" | "completed_with_errors"; errorCode?: null }
      | { status: "failed"; errorCode: string; retryable: boolean },
  ): Promise<boolean> {
    if (!this.heartbeatAllowed) return false;
    this.finalResult = result.status;
    this.finalErrorCode = result.status === "failed" ? result.errorCode : null;
    this.finalRetryable = result.status === "failed" ? result.retryable : false;
    return true;
  }
}

function groupOutcome(
  group: ApprovedGroup,
  overrides: Partial<ClassifierImportGroupOutcome>,
): ClassifierImportGroupOutcome {
  return {
    classifier_import_run_id: runId,
    classifier_group_id: group.groupId,
    product_draft_id: null,
    approved_category_slug: group.approvedCategorySlug,
    source_cover_classifier_image_id: group.coverImageId,
    status: "pending",
    error_code: null,
    retryable: false,
    source_group_position: null,
    created_at: "2026-07-19T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    ...overrides,
  };
}

function productId(groupId: string): string {
  return groupId.replace(/.$/, "9");
}

function reader(snapshot: ApprovedGroupsSnapshot): ApprovedGroupsReader {
  return { getApprovedGroups: async () => snapshot };
}

function imagePreparation(
  overrides: Partial<GroupImagePreparationService> = {},
): GroupImagePreparationService {
  return {
    getImageImportActionState: async () => ({
      hasRetryableFailures: false,
      hasAnyFailures: false,
      hasPromotedImages: false,
    }),
    prepareGroupImages: async () => ({ status: "complete" }),
    reconcilePromotedImages: async () => ({
      missingGroupIds: new Set(),
      conflictingGroupIds: new Set(),
    }),
    ...overrides,
  };
}

describe("ClassifierImportWorker", () => {
  it("claims and executes one exact import", async () => {
    const repository = new MemoryRepository(claimedRun());
    const worker = new ClassifierImportWorker(
      repository,
      reader(approvedSnapshot([])),
      imagePreparation(),
      config,
    );

    await expect(worker.run(runId)).resolves.toMatchObject({
      status: "completed",
      importId: runId,
      attemptCount: 1,
    });
    await expect(worker.run("00000000-0000-0000-0000-000000000099")).resolves.toEqual({
      status: "idle",
    });
  });

  it("prepares groups sequentially and completes a successful import", async () => {
    const groups = [approvedGroup(groupOneId, "21"), approvedGroup(groupTwoId, "22")];
    const repository = new MemoryRepository(claimedRun());
    const calls: string[] = [];
    const worker = new ClassifierImportWorker(
      repository,
      reader(approvedSnapshot(groups)),
      imagePreparation({
        prepareGroupImages: async (_run, _token, group) => {
          calls.push(group.groupId);
          return { status: "complete" };
        },
      }),
      config,
    );

    await expect(worker.runNext()).resolves.toEqual({
      status: "completed",
      importId: runId,
      operationKind: "import",
      attemptCount: 1,
    });
    expect(calls).toEqual([groupOneId, groupTwoId]);
    expect([...repository.groups.values()].map((group) => group.status)).toEqual([
      "complete",
      "complete",
    ]);
    expect(repository.finalResult).toBe("completed");
  });

  it("records an organization mismatch as a non-retryable top-level failure", async () => {
    const repository = new MemoryRepository(claimedRun());
    const worker = new ClassifierImportWorker(
      repository,
      reader(
        approvedSnapshot([approvedGroup(groupOneId, "21")], "00000000-0000-0000-0000-000000000099"),
      ),
      imagePreparation(),
      config,
    );

    await expect(worker.runNext()).resolves.toEqual({
      status: "failed",
      importId: runId,
      operationKind: "import",
      attemptCount: 1,
      errorCode: "classifier_organization_mismatch",
    });
    expect(repository.finalRetryable).toBe(false);
    expect(repository.groups.size).toBe(0);
  });

  it("validates the seller stored on the claimed run", async () => {
    const storedSellerId = "00000000-0000-0000-0000-000000000088";
    const repository = new MemoryRepository(claimedRun({ seller_id: storedSellerId }));
    repository.sellerEligible = false;
    const worker = new ClassifierImportWorker(
      repository,
      reader(approvedSnapshot([approvedGroup(groupOneId, "21")])),
      imagePreparation(),
      config,
    );

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "failed",
      errorCode: "classifier_import_destination_seller_not_eligible",
    });
    expect(repository.eligibleSellerId).toBe(storedSellerId);
  });

  it("imports an explicitly categoryless approved group", async () => {
    const group = approvedGroup(groupOneId, "21");
    group.approvedCategorySlug = null;
    const repository = new MemoryRepository(claimedRun());
    const worker = new ClassifierImportWorker(
      repository,
      reader(approvedSnapshot([group])),
      imagePreparation(),
      config,
    );

    await expect(worker.runNext()).resolves.toEqual({
      status: "completed",
      importId: runId,
      operationKind: "import",
      attemptCount: 1,
    });
    expect(repository.groups.get(group.groupId)).toMatchObject({
      status: "complete",
      approved_category_slug: null,
      error_code: null,
    });
  });

  it("discards work immediately after losing its claim", async () => {
    const repository = new MemoryRepository(claimedRun());
    repository.heartbeatAllowed = false;
    const worker = new ClassifierImportWorker(
      repository,
      reader(approvedSnapshot([approvedGroup(groupOneId, "21")])),
      imagePreparation(),
      config,
    );

    await expect(worker.runNext()).resolves.toEqual({
      status: "claim_lost",
      importId: runId,
      operationKind: "import",
      attemptCount: 1,
    });
    expect(repository.finalResult).toBeNull();
    expect(repository.groups.size).toBe(0);
  });

  it("preserves mixed reconciliation results and gives conflicts precedence", async () => {
    const first = approvedGroup(groupOneId, "21");
    const second = approvedGroup(groupTwoId, "22");
    const repository = new MemoryRepository(claimedRun({ operation_kind: "reconcile" }));
    repository.groups.set(first.groupId, groupOutcome(first, { status: "complete" }));
    repository.groups.set(second.groupId, groupOutcome(second, { status: "complete" }));
    const worker = new ClassifierImportWorker(
      repository,
      reader(approvedSnapshot([first, second])),
      imagePreparation({
        reconcilePromotedImages: async () => ({
          missingGroupIds: new Set([first.groupId]),
          conflictingGroupIds: new Set([first.groupId, second.groupId]),
        }),
      }),
      config,
    );

    await expect(worker.runNext()).resolves.toEqual({
      status: "completed_with_errors",
      importId: runId,
      operationKind: "reconcile",
      attemptCount: 1,
    });
    expect(repository.groups.get(first.groupId)?.status).toBe("failed");
    expect(repository.groups.get(second.groupId)?.status).toBe("failed");
    expect([...repository.groups.values()].every((group) => group.status === "failed")).toBe(true);
  });

  it("persists approved-groups request failures as retryable", async () => {
    const repository = new MemoryRepository(claimedRun());
    const failingReader: ApprovedGroupsReader = {
      getApprovedGroups: async () => {
        throw new ClassifierImportError("approved_groups_request_failed", true);
      },
    };
    const worker = new ClassifierImportWorker(
      repository,
      failingReader,
      imagePreparation(),
      config,
    );

    await expect(worker.runNext()).resolves.toEqual({
      status: "failed",
      importId: runId,
      operationKind: "import",
      attemptCount: 1,
      errorCode: "approved_groups_request_failed",
    });
    expect(repository.finalRetryable).toBe(true);
  });
});
