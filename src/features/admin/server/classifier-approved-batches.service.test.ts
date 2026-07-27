import { describe, expect, it } from "vitest";

import { ApprovedBatchClient } from "./classifier-approved-batches.service";
import { ClassifierImportApiError } from "./classifier-import.types";

const organizationId = "00000000-0000-0000-0000-000000000001";
const batchId = "00000000-0000-0000-0000-000000000010";

function page(overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    items: [
      {
        batchId,
        status: "approved",
        pipelineVersion: "2026-06-01",
        createdAt: "2026-07-22T10:00:00Z",
        finalizedAt: "2026-07-22T10:05:00Z",
        originalFileCount: 4,
        processedFileCount: 4,
        groupCount: 2,
      },
    ],
    nextCursor: "next-page",
    ...overrides,
  };
}

function clientReturning(response: Response): ApprovedBatchClient {
  return new ApprovedBatchClient({
    baseUrl: "http://classifier.test",
    organizationId,
    timeoutMs: 100,
    fetchImplementation: async () => response,
  });
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error("Expected an API error.");
  } catch (error) {
    expect(error).toBeInstanceOf(ClassifierImportApiError);
    expect(error).toMatchObject({ status, code });
  }
}

describe("ApprovedBatchClient", () => {
  it("requests and validates one approved-batch page", async () => {
    let requestedUrl = "";
    const client = new ApprovedBatchClient({
      baseUrl: "http://classifier.test",
      organizationId,
      timeoutMs: 100,
      fetchImplementation: async (input) => {
        requestedUrl = String(input);
        return Response.json(page());
      },
    });

    await expect(client.listApprovedBatches({ limit: 25, cursor: "current" })).resolves.toEqual(
      page(),
    );
    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/v1/upload-batches");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "approved",
      limit: "25",
      cursor: "current",
    });
  });

  it("maps a disabled classifier export to inbox unavailable", async () => {
    const response = Response.json(
      { detail: { code: "approved_groups_export_disabled" } },
      { status: 404 },
    );
    await expectApiError(
      clientReturning(response).listApprovedBatches({ limit: 50 }),
      503,
      "classifier_batch_inbox_unavailable",
    );
  });

  it("maps an invalid opaque cursor to an invalid inbox request", async () => {
    const response = Response.json(
      { detail: { code: "approved_batch_cursor_invalid" } },
      { status: 400 },
    );
    await expectApiError(
      clientReturning(response).listApprovedBatches({ limit: 50, cursor: "invalid" }),
      400,
      "classifier_batch_inbox_request_invalid",
    );
  });

  it("maps server and network failures to inbox unavailable", async () => {
    await expectApiError(
      clientReturning(Response.json({}, { status: 503 })).listApprovedBatches({ limit: 50 }),
      503,
      "classifier_batch_inbox_unavailable",
    );

    const client = new ApprovedBatchClient({
      baseUrl: "http://classifier.test",
      organizationId,
      timeoutMs: 100,
      fetchImplementation: async () => {
        throw new Error("connection failed");
      },
    });
    await expectApiError(
      client.listApprovedBatches({ limit: 50 }),
      503,
      "classifier_batch_inbox_unavailable",
    );
  });

  it("rejects malformed data and a different organization", async () => {
    await expectApiError(
      clientReturning(Response.json({ items: [] })).listApprovedBatches({ limit: 50 }),
      502,
      "classifier_batch_inbox_response_invalid",
    );
    await expectApiError(
      clientReturning(
        Response.json(page({ organizationId: "00000000-0000-0000-0000-000000000099" })),
      ).listApprovedBatches({ limit: 50 }),
      502,
      "classifier_batch_inbox_response_invalid",
    );
  });
});
