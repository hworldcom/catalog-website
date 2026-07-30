import { describe, expect, it } from "vitest";

import type { ClassifierImportConfig } from "./classifier-import.config";
import type { ClassifierImportDestinationResolver } from "./classifier-import-destination.service";
import type { ClassifierImportDispatcher } from "./classifier-import.dispatcher";
import {
  ClassifierImportCoordinator,
  type ClassifierImportPreflightReader,
} from "./classifier-import.coordinator";
import type { ClassifierImportRepository } from "./classifier-import.repository";
import type {
  ApprovedGroupsSnapshot,
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
  GroupImagePreparationService,
} from "./classifier-import.types";
import { ClassifierImportError } from "./classifier-import.types";

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
const alternateSellerId = "00000000-0000-0000-0000-000000000099";
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

function approvedSnapshot(
  organizationId = config.classifierOrganizationId,
): ApprovedGroupsSnapshot {
  return {
    batchId,
    organizationId,
    status: "approved",
    pipelineVersion: "2026-06-01",
    groups: [],
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
    getRunBySource: async () => null,
    createOrGetRun: async () => ({ run: run(), created: true }),
    getRun: async () => run(),
    getSellerName: async () => "Kesar Textiles",
    getEligibleSeller: async () => ({ id: sellerId, name: "Kesar Textiles" }),
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

function preflight(
  getApprovedGroups: ClassifierImportPreflightReader["getApprovedGroups"] = async () =>
    approvedSnapshot(),
): ClassifierImportPreflightReader {
  return { getApprovedGroups };
}

function destination(
  resolveDestination: ClassifierImportDestinationResolver["resolveDestination"] = async () => ({
    id: sellerId,
    name: "Kesar Textiles",
  }),
): ClassifierImportDestinationResolver {
  return { resolveDestination };
}

function dispatcher(
  dispatch: ClassifierImportDispatcher["dispatch"] = async () => "accepted",
): ClassifierImportDispatcher {
  return { dispatch };
}

function coordinator(
  repositoryValue: ClassifierImportRepository = repository(),
  preflightValue: ClassifierImportPreflightReader = preflight(),
  destinationValue: ClassifierImportDestinationResolver = destination(),
  dispatcherValue: ClassifierImportDispatcher = dispatcher(),
  now: () => number = Date.now,
): ClassifierImportCoordinator {
  return new ClassifierImportCoordinator(
    repositoryValue,
    imagePreparation(),
    config,
    preflightValue,
    destinationValue,
    dispatcherValue,
    now,
  );
}

describe("ClassifierImportCoordinator", () => {
  it("authorizes a new import in the required dependency order", async () => {
    const calls: string[] = [];
    const subject = coordinator(
      repository({
        getRunBySource: async () => {
          calls.push("lookup");
          return null;
        },
        createOrGetRun: async (input) => {
          calls.push(`create:${input.sellerId}`);
          return { run: run(), created: true };
        },
      }),
      preflight(async () => {
        calls.push("preflight");
        return approvedSnapshot();
      }),
      destination(async () => {
        calls.push("destination");
        return { id: sellerId, name: "Kesar Textiles" };
      }),
      dispatcher(async (id) => {
        calls.push(`dispatch:${id}`);
        return "accepted";
      }),
    );

    await expect(subject.start(batchId)).resolves.toEqual({
      httpStatus: 202,
      body: {
        importId: runId,
        classifierBatchId: batchId,
        destinationSeller: { id: sellerId, name: "Kesar Textiles" },
        status: "pending",
        dispatchStatus: "accepted",
      },
    });
    expect(calls).toEqual([
      "lookup",
      "destination",
      "preflight",
      `create:${sellerId}`,
      `dispatch:${runId}`,
    ]);
  });

  it("returns an existing import without resolving the default or calling the classifier", async () => {
    const subject = coordinator(
      repository({ getRunBySource: async () => run() }),
      preflight(async () => {
        throw new Error("preflight must not run");
      }),
      destination(async () => {
        throw new Error("destination must not resolve");
      }),
    );

    await expect(subject.start(batchId)).resolves.toMatchObject({
      httpStatus: 202,
      body: {
        importId: runId,
        destinationSeller: { id: sellerId, name: "Kesar Textiles" },
        dispatchStatus: "accepted",
      },
    });
  });

  it("returns completed imports as an idempotent success", async () => {
    const subject = coordinator(
      repository({
        getRunBySource: async () =>
          run({ status: "completed", completed_at: "2026-07-19T00:01:00Z" }),
      }),
    );
    await expect(subject.start(batchId)).resolves.toMatchObject({
      httpStatus: 200,
      body: { status: "completed", dispatchStatus: "not_required" },
    });
  });

  it("requires explicit retry for an existing terminal failure", async () => {
    const subject = coordinator(
      repository({
        getRunBySource: async () => run({ status: "completed_with_errors" }),
      }),
    );
    await expect(subject.start(batchId)).rejects.toMatchObject({
      status: 409,
      code: "classifier_import_retry_required",
      details: { importId: runId },
    });
  });

  it("returns the concurrent winner's stored seller without comparing it to the default", async () => {
    const subject = coordinator(
      repository({
        createOrGetRun: async () => ({
          run: run({ seller_id: alternateSellerId }),
          created: false,
        }),
        getSellerName: async (id) => (id === alternateSellerId ? "Concurrent Store" : null),
      }),
    );

    await expect(subject.start(batchId)).resolves.toMatchObject({
      body: {
        destinationSeller: { id: alternateSellerId, name: "Concurrent Store" },
      },
    });
  });

  it.each([
    ["classifier_batch_not_found", 404, "classifier_batch_not_found"],
    ["classifier_batch_not_approved", 409, "classifier_batch_not_approved"],
    ["approved_groups_export_disabled", 503, "classifier_import_preflight_unavailable"],
    ["approved_groups_request_failed", 503, "classifier_import_preflight_unavailable"],
    ["approved_groups_response_invalid", 502, "classifier_import_preflight_response_invalid"],
    [
      "approved_groups_unexpected_client_error",
      502,
      "classifier_import_preflight_response_invalid",
    ],
  ])("maps preflight failure %s", async (sourceCode, httpStatus, apiCode) => {
    let created = false;
    const subject = coordinator(
      repository({
        createOrGetRun: async () => {
          created = true;
          return { run: run(), created: true };
        },
      }),
      preflight(async () => {
        throw new ClassifierImportError(sourceCode, false);
      }),
    );

    await expect(subject.start(batchId)).rejects.toMatchObject({
      status: httpStatus,
      code: apiCode,
    });
    expect(created).toBe(false);
  });

  it("rejects a preflight response for a different organization", async () => {
    const subject = coordinator(
      repository(),
      preflight(async () => approvedSnapshot("00000000-0000-0000-0000-000000000097")),
    );
    await expect(subject.start(batchId)).rejects.toMatchObject({
      status: 502,
      code: "classifier_import_preflight_response_invalid",
    });
  });

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
      preflight(),
      destination(),
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
    const accepted = coordinator(
      repository({ getRun: async () => run() }),
      preflight(),
      destination(),
      dispatcher(),
    );
    await expect(accepted.dispatch(runId)).resolves.toMatchObject({
      httpStatus: 202,
      body: { status: "pending", actions: { canDispatch: true } },
    });

    const unavailable = coordinator(
      repository({ getRun: async () => run() }),
      preflight(),
      destination(),
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
      preflight(),
      destination(),
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
      preflight(),
      destination(),
      dispatcher(),
      () => Date.parse(currentHeartbeat) + 901_000,
    );
    await expect(stale.dispatch(runId)).resolves.toMatchObject({ httpStatus: 202 });
  });
});
