import { describe, expect, it, vi } from "vitest";

import {
  ClassifierImportRequestError,
  createClassifierImportClient,
  type ClassifierImportSnapshot,
} from "./classifier-import.api";

const importId = "00000000-0000-0000-0000-000000000010";
const batchId = "00000000-0000-0000-0000-000000000020";
const destinationSeller = {
  id: "00000000-0000-0000-0000-000000000030",
  name: "Kesar Textiles",
};
const accessToken = "header.payload.signature";
const getAccessToken = vi.fn(async () => accessToken);

function snapshot(status: ClassifierImportSnapshot["status"] = "completed") {
  return {
    importId,
    classifierBatchId: batchId,
    destinationSeller: {
      id: "00000000-0000-0000-0000-000000000030",
      name: "Kesar Textiles",
    },
    status,
    operationKind: "import" as const,
    errorCode: null,
    pendingGroupCount: 0,
    processingGroupCount: 0,
    completeGroupCount: 1,
    failedGroupCount: 0,
    actions: {
      canDispatch: false,
      canRetryTemporary: false,
      canRetryAll: false,
      canReconcile: false,
    },
    groups: [],
  } satisfies ClassifierImportSnapshot;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createClient(fetcher: ReturnType<typeof vi.fn>) {
  return createClassifierImportClient(fetcher, getAccessToken);
}

function expectAuthenticatedRequest(
  fetcher: ReturnType<typeof vi.fn>,
  path: string,
  expectedInit: RequestInit,
): void {
  const [actualPath, actualInit] = fetcher.mock.lastCall as [string, RequestInit];
  const actualHeaders = new Headers(actualInit.headers);
  const expectedHeaders = new Headers(expectedInit.headers);

  expect(actualPath).toBe(path);
  expect(actualHeaders.get("Authorization")).toBe(`Bearer ${accessToken}`);
  actualHeaders.delete("Authorization");
  expect(Object.fromEntries(actualHeaders)).toEqual(Object.fromEntries(expectedHeaders));

  const { headers: _actualHeaders, ...actualRest } = actualInit;
  const { headers: _expectedHeaders, ...expectedRest } = expectedInit;
  expect(actualRest).toEqual(expectedRest);
}

describe("createClassifierImportClient", () => {
  it("lists one cursor page of approved classifier batches", async () => {
    const page = { items: [], nextCursor: "next-page" };
    const fetcher = vi.fn(async () => jsonResponse(page));
    const client = createClient(fetcher);

    await expect(client.listBatches({ limit: 20, cursor: "created-at|batch-id" })).resolves.toEqual(
      page,
    );
    expectAuthenticatedRequest(
      fetcher,
      "/v1/admin/classifier-batches?limit=20&cursor=created-at%7Cbatch-id",
      { signal: undefined },
    );
  });

  it("loads the read-only prototype destination", async () => {
    const destination = { destinationSeller, source: "prototype_default" } as const;
    const fetcher = vi.fn(async () => jsonResponse(destination));
    const client = createClient(fetcher);

    await expect(client.getDestination()).resolves.toEqual(destination);
    expectAuthenticatedRequest(fetcher, "/v1/admin/classifier-import-destination", {
      signal: undefined,
    });
  });

  it("starts an import with the exact browser contract", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          importId,
          classifierBatchId: batchId,
          destinationSeller,
          status: "pending",
          dispatchStatus: "accepted",
        },
        202,
      ),
    );
    const client = createClient(fetcher);

    await expect(client.start(batchId)).resolves.toEqual({
      importId,
      classifierBatchId: batchId,
      destinationSeller,
      status: "pending",
      dispatchStatus: "accepted",
    });
    expectAuthenticatedRequest(fetcher, "/v1/admin/classifier-imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classifierBatchId: batchId }),
    });
  });

  it("preserves retry-required navigation metadata", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          detail: {
            code: "classifier_import_retry_required",
            message: "The import requires an explicit retry.",
            importId,
          },
        },
        409,
      ),
    );
    const client = createClient(fetcher);

    const error = await client.start(batchId).catch((caught) => caught);
    expect(error).toBeInstanceOf(ClassifierImportRequestError);
    expect(error).toMatchObject({
      status: 409,
      code: "classifier_import_retry_required",
      importId,
    });
  });

  it("sends temporary retry without a request body", async () => {
    const fetcher = vi.fn(async () => jsonResponse(snapshot(), 200));
    const client = createClient(fetcher);

    await client.retry(importId, false);

    expectAuthenticatedRequest(fetcher, `/v1/admin/classifier-imports/${importId}/retry`, {
      method: "POST",
    });
  });

  it("sends all-failure retry with the explicit override", async () => {
    const fetcher = vi.fn(async () => jsonResponse(snapshot("pending"), 202));
    const client = createClient(fetcher);

    await client.retry(importId, true);

    expectAuthenticatedRequest(fetcher, `/v1/admin/classifier-imports/${importId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeNonRetryable: true }),
    });
  });

  it.each([200, 202])("accepts a %s reconciliation snapshot", async (status) => {
    const nextSnapshot = { ...snapshot("pending"), operationKind: "reconcile" as const };
    const fetcher = vi.fn(async () => jsonResponse(nextSnapshot, status));
    const client = createClient(fetcher);

    await expect(client.reconcile(importId)).resolves.toEqual(nextSnapshot);
    expectAuthenticatedRequest(fetcher, `/v1/admin/classifier-imports/${importId}/reconcile`, {
      method: "POST",
    });
  });

  it("dispatches one existing import", async () => {
    const nextSnapshot = {
      ...snapshot("pending"),
      actions: { ...snapshot().actions, canDispatch: true },
    };
    const fetcher = vi.fn(async () => jsonResponse(nextSnapshot, 202));
    const client = createClient(fetcher);

    await expect(client.dispatch(importId)).resolves.toEqual(nextSnapshot);
    expectAuthenticatedRequest(fetcher, `/v1/admin/classifier-imports/${importId}/dispatch`, {
      method: "POST",
    });
  });

  it("reads the current access token for every request", async () => {
    const tokens = ["first.header.signature", "second.header.signature"];
    const tokenProvider = vi.fn(async () => tokens.shift() ?? null);
    const fetcher = vi.fn(async () => jsonResponse(snapshot()));
    const client = createClassifierImportClient(fetcher, tokenProvider);

    await client.getStatus(importId);
    await client.getStatus(importId);

    expect(tokenProvider).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Authorization")).toBe(
      "Bearer first.header.signature",
    );
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get("Authorization")).toBe(
      "Bearer second.header.signature",
    );
  });

  it("does not send an authorization header without a session", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          detail: {
            code: "authentication_required",
            message: "Authentication is required.",
          },
        },
        401,
      ),
    );
    const client = createClassifierImportClient(fetcher, async () => null);

    await expect(client.getStatus(importId)).rejects.toMatchObject({
      status: 401,
      code: "authentication_required",
    });
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
  });
});
