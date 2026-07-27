import { describe, expect, it } from "vitest";

import {
  classifierImportApiErrorResponse,
  handleDispatchClassifierImport,
  handleGetClassifierImportDestination,
  handleStartClassifierImport,
} from "./classifier-import.http";
import { ClassifierImportApiError } from "./classifier-import.types";
import type { PrototypeAdministratorRequestContext } from "./prototype-administrator-auth";

const importId = "00000000-0000-0000-0000-000000000003";
const batchId = "00000000-0000-0000-0000-000000000004";
const sellerId = "00000000-0000-0000-0000-000000000005";
const authorized = async (): Promise<PrototypeAdministratorRequestContext> =>
  ({ prototypeAdministrator: true }) as PrototypeAdministratorRequestContext;

function request(path = "/v1/admin/classifier-imports", init?: RequestInit): Request {
  return new Request(`http://example.test${path}`, init);
}

describe("handleStartClassifierImport", () => {
  it("rejects unknown fields before invoking the coordinator", async () => {
    let invoked = false;
    const response = await handleStartClassifierImport(
      new Request("http://example.test/v1/admin/classifier-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classifierBatchId: batchId, sellerId }),
      }),
      {
        start: async () => {
          invoked = true;
          throw new Error("must not run");
        },
      },
      authorized,
    );

    expect(response.status).toBe(400);
    expect(invoked).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "classifier_import_request_invalid" },
    });
  });

  it("returns the snapshotted destination from the coordinator", async () => {
    const response = await handleStartClassifierImport(
      new Request("http://example.test/v1/admin/classifier-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classifierBatchId: batchId }),
      }),
      {
        start: async () => ({
          httpStatus: 202,
          body: {
            importId,
            classifierBatchId: batchId,
            destinationSeller: { id: sellerId, name: "Kesar Textiles" },
            status: "pending",
            dispatchStatus: "accepted",
          },
        }),
      },
      authorized,
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      destinationSeller: { id: sellerId, name: "Kesar Textiles" },
    });
  });
});

describe("handleDispatchClassifierImport", () => {
  it("dispatches one existing import without a request body", async () => {
    const response = await handleDispatchClassifierImport(
      request(`/v1/admin/classifier-imports/${importId}/dispatch`, { method: "POST" }),
      importId,
      {
        dispatch: async () => ({
          httpStatus: 202,
          body: {
            importId,
            classifierBatchId: batchId,
            destinationSeller: { id: sellerId, name: "Kesar Textiles" },
            status: "pending",
            operationKind: "import",
            errorCode: null,
            pendingGroupCount: 0,
            processingGroupCount: 0,
            completeGroupCount: 0,
            failedGroupCount: 0,
            actions: {
              canDispatch: true,
              canRetryTemporary: false,
              canRetryAll: false,
              canReconcile: false,
            },
            groups: [],
          },
        }),
      },
      authorized,
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      importId,
      actions: { canDispatch: true },
    });
  });

  it("rejects an invalid import identifier", async () => {
    const response = await handleDispatchClassifierImport(
      request("/v1/admin/classifier-imports/not-a-uuid/dispatch", { method: "POST" }),
      "not-a-uuid",
      {
        dispatch: async () => {
          throw new Error("must not run");
        },
      },
      authorized,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "classifier_import_request_invalid" },
    });
  });
});

describe("handleGetClassifierImportDestination", () => {
  it("returns the prototype destination without caching", async () => {
    const response = await handleGetClassifierImportDestination(
      request("/v1/admin/classifier-import-destination"),
      {
        getDestination: async () => ({
          destinationSeller: { id: sellerId, name: "Kesar Textiles" },
          source: "prototype_default",
        }),
      },
      authorized,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      destinationSeller: { id: sellerId, name: "Kesar Textiles" },
      source: "prototype_default",
    });
  });

  it("preserves stable destination errors", async () => {
    const response = await handleGetClassifierImportDestination(
      request("/v1/admin/classifier-import-destination"),
      {
        getDestination: async () => {
          throw new ClassifierImportApiError(
            503,
            "classifier_import_default_seller_unavailable",
            "The default classifier import store is unavailable.",
          );
        },
      },
      authorized,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "classifier_import_default_seller_unavailable" },
    });
  });
});

describe("classifierImportApiErrorResponse", () => {
  it("includes the existing import identifier for retry-required errors", async () => {
    const response = classifierImportApiErrorResponse(
      new ClassifierImportApiError(
        409,
        "classifier_import_retry_required",
        "The import requires an explicit retry.",
        { importId },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      detail: {
        code: "classifier_import_retry_required",
        message: "The import requires an explicit retry.",
        importId,
      },
    });
  });

  it("does not add an import identifier to unrelated errors", async () => {
    const response = classifierImportApiErrorResponse(
      new ClassifierImportApiError(
        409,
        "classifier_import_action_not_allowed",
        "Retry is not allowed for the current classifier import state.",
      ),
    );

    await expect(response.json()).resolves.toEqual({
      detail: {
        code: "classifier_import_action_not_allowed",
        message: "Retry is not allowed for the current classifier import state.",
      },
    });
  });
});
