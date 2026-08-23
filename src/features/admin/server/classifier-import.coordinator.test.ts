import { describe, expect, it } from "vitest";

import type { ClassifierImportConfig } from "./classifier-import.config";
import type { ClassifierImportDispatcher } from "./classifier-import.dispatcher";
import { ClassifierImportCoordinator } from "./classifier-import.coordinator";
import type { ClassifierImportRepository } from "./classifier-import.repository";
import type {
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
  GroupImagePreparationService,
} from "./classifier-import.types";

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

function run(overrides: Partial<ClassifierImportRun> = {}): ClassifierImportRun {
  return {
    id: runId,
    classifier_organization_id: config.classifierOrganizationId,
    classifier_batch_id: batchId,
    seller_id: sellerId,
    pipeline_version: null,
    status: "pending",
    operation_kind: "import",
    requested_by_user_id: null,
    attempt_count: 0,
    attempt_token: null,
    claim_started_at: null,
    last_heartbeat_at: null,
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

function group(
  groupId: string,
  status: ClassifierImportGroupOutcome["status"],
  retryable = false,
): ClassifierImportGroupOutcome {
  return {
    classifier_import_run_id: runId,
    classifier_group_id: groupId,
    product_draft_id: null,
    approved_category_slug: "trousers",
    source_cover_classifier_image_id: "00000000-0000-0000-0000-000000000098",
    status,
    error_code: status === "failed" ? "failure" : null,
    retryable,
    source_group_position: null,
    created_at: "2026-07-19T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
  };
}

function repository(
  overrides: Partial<ClassifierImportRepository> = {},
): ClassifierImportRepository {
  return {
    getRun: async () => run(),
    getSellerName: async () => "Kesar Textiles",
    listGroupOutcomes: async () => [],
    retryImport: async () => "noop",
    reconcileImport: async () => "not_allowed",
    claimRun: async () => null,
    claimNextRun: async () => null,
    heartbeat: async () => true,
    setPipelineVersion: async () => true,
    isRunSellerEligible: async () => true,
    prepareGroup: async () => ({ result: "claim_lost" }),
    setGroupResult: async () => true,
    finalizeRun: async () => true,
    ...overrides,
  };
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

function dispatcher(
  dispatch: ClassifierImportDispatcher["dispatch"] = async () => "accepted",
): ClassifierImportDispatcher {
  return { dispatch };
}

function coordinator(
  repositoryValue: ClassifierImportRepository = repository(),
  dispatcherValue: ClassifierImportDispatcher = dispatcher(),
  now: () => number = Date.now,
): ClassifierImportCoordinator {
  return new ClassifierImportCoordinator(
    repositoryValue,
    imagePreparation(),
    config,
    dispatcherValue,
    now,
  );
}

describe("ClassifierImportCoordinator", () => {
  it("returns separate group counts and server-derived actions", async () => {
    const groups = [
      group("00000000-0000-0000-0000-000000000011", "pending"),
      group("00000000-0000-0000-0000-000000000012", "processing"),
      group("00000000-0000-0000-0000-000000000013", "complete"),
      group("00000000-0000-0000-0000-000000000014", "failed", true),
    ];
    const subject = coordinator(
      repository({
        getRun: async () => run({ status: "completed_with_errors" }),
        listGroupOutcomes: async () => groups,
      }),
    );

    await expect(subject.getStatus(runId)).resolves.toMatchObject({
      destinationSeller: { id: sellerId, name: "Kesar Textiles" },
      pendingGroupCount: 1,
      processingGroupCount: 1,
      completeGroupCount: 1,
      failedGroupCount: 1,
      actions: {
        canDispatch: false,
        canRetryTemporary: true,
        canRetryAll: true,
        canReconcile: false,
      },
    });
  });

  it("keeps failed import status readable when its stored seller is unavailable", async () => {
    const subject = coordinator(
      repository({
        getRun: async () =>
          run({
            status: "failed",
            error_code: "classifier_import_destination_seller_not_eligible",
          }),
        getSellerName: async () => null,
      }),
    );

    await expect(subject.getStatus(runId)).resolves.toMatchObject({
      status: "failed",
      errorCode: "classifier_import_destination_seller_not_eligible",
      destinationSeller: { id: sellerId, name: null },
    });
  });

  it("returns 202 for a requeued retry and 200 for a no-op", async () => {
    const dispatched: string[] = [];
    const requeued = coordinator(
      repository({
        retryImport: async () => "requeued",
        getRun: async () => run({ status: "pending" }),
      }),
      dispatcher(async (id) => {
        dispatched.push(id);
        return "accepted";
      }),
    );
    await expect(requeued.retry(runId, false)).resolves.toMatchObject({
      httpStatus: 202,
      body: { status: "pending" },
    });
    expect(dispatched).toEqual([runId]);

    const noOp = coordinator(
      repository({
        retryImport: async () => "noop",
        getRun: async () => run({ status: "completed_with_errors" }),
      }),
    );
    await expect(noOp.retry(runId, false)).resolves.toMatchObject({ httpStatus: 200 });
  });

  it("dispatches pending recovery work and rejects synchronous scheduling failures", async () => {
    const accepted = coordinator(repository({ getRun: async () => run() }), dispatcher());
    await expect(accepted.dispatch(runId)).resolves.toMatchObject({
      httpStatus: 202,
      body: { status: "pending", actions: { canDispatch: true } },
    });

    const unavailable = coordinator(
      repository({ getRun: async () => run() }),
      dispatcher(async () => {
        throw new Error("scheduler unavailable");
      }),
    );
    await expect(unavailable.dispatch(runId)).rejects.toMatchObject({
      status: 503,
      code: "classifier_import_dispatch_unavailable",
      details: { importId: runId },
    });
  });

  it("allows recovery dispatch only after a running lease expires", async () => {
    const currentHeartbeat = "2026-07-23T12:00:00.000Z";
    const active = coordinator(
      repository({
        getRun: async () =>
          run({
            status: "running",
            attempt_token: "00000000-0000-0000-0000-000000000090",
            claim_started_at: currentHeartbeat,
            last_heartbeat_at: currentHeartbeat,
          }),
      }),
      dispatcher(),
      () => Date.parse(currentHeartbeat) + 899_000,
    );
    await expect(active.dispatch(runId)).resolves.toMatchObject({ httpStatus: 200 });

    const stale = coordinator(
      repository({
        getRun: async () =>
          run({
            status: "running",
            attempt_token: "00000000-0000-0000-0000-000000000090",
            claim_started_at: currentHeartbeat,
            last_heartbeat_at: currentHeartbeat,
          }),
      }),
      dispatcher(),
      () => Date.parse(currentHeartbeat) + 901_000,
    );
    await expect(stale.dispatch(runId)).resolves.toMatchObject({ httpStatus: 202 });
  });
});
