import { describe, expect, it } from "vitest";

import { ApprovedGroupsClient } from "./classifier-approved-groups.service";
import { ClassifierImportError } from "./classifier-import.types";

const batchId = "00000000-0000-0000-0000-000000000010";
const organizationId = "00000000-0000-0000-0000-000000000001";
const groupId = "00000000-0000-0000-0000-000000000020";
const imageId = "00000000-0000-0000-0000-000000000030";

function approvedPayload() {
  return {
    batchId,
    organizationId,
    status: "approved",
    pipelineVersion: "2026-06-01",
    groups: [
      {
        groupId,
        approvedCategorySlug: "trousers",
        suggestedCategorySlug: null,
        coverImageId: imageId,
        confidence: 0.94,
        images: [
          {
            imageId,
            position: 0,
            isDuplicate: false,
            duplicateOfImageId: null,
          },
        ],
      },
    ],
  };
}

function clientReturning(response: Response): ApprovedGroupsClient {
  const fetchImplementation: typeof fetch = async () => response;
  return new ApprovedGroupsClient({
    baseUrl: "http://classifier.test",
    timeoutMs: 100,
    fetchImplementation,
  });
}

async function expectImportError(promise: Promise<unknown>, code: string, retryable: boolean) {
  try {
    await promise;
    throw new Error("Expected classifier import error.");
  } catch (error) {
    expect(error).toBeInstanceOf(ClassifierImportError);
    expect(error).toMatchObject({ code, retryable });
  }
}

describe("ApprovedGroupsClient", () => {
  it("accepts a valid approved snapshot", async () => {
    const snapshot = await clientReturning(Response.json(approvedPayload())).getApprovedGroups(
      batchId,
    );
    expect(snapshot.groups[0]?.approvedCategorySlug).toBe("trousers");
  });

  it("accepts an explicit null approved category", async () => {
    const payload = approvedPayload();
    (payload.groups[0] as Record<string, unknown>).approvedCategorySlug = null;

    const snapshot = await clientReturning(Response.json(payload)).getApprovedGroups(batchId);

    expect(snapshot.groups[0]?.approvedCategorySlug).toBeNull();
  });

  it.each<{
    label: string;
    mutate: (payload: ReturnType<typeof approvedPayload>) => void;
  }>([
    {
      label: "missing",
      mutate: (payload) => {
        const group = payload.groups[0] as Record<string, unknown>;
        delete group.approvedCategorySlug;
      },
    },
    {
      label: "blank",
      mutate: (payload) => {
        payload.groups[0]!.approvedCategorySlug = "   ";
      },
    },
    {
      label: "invalid type",
      mutate: (payload) => {
        const group = payload.groups[0] as Record<string, unknown>;
        group.approvedCategorySlug = 42;
      },
    },
  ])("rejects a $label approved category", async ({ mutate }) => {
    const payload = approvedPayload();
    mutate(payload);

    await expectImportError(
      clientReturning(Response.json(payload)).getApprovedGroups(batchId),
      "approved_groups_response_invalid",
      false,
    );
  });

  it("maps known classifier client errors exactly", async () => {
    const client = clientReturning(
      Response.json(
        { detail: { code: "batch_not_approved", message: "not approved" } },
        { status: 409 },
      ),
    );
    await expectImportError(
      client.getApprovedGroups(batchId),
      "classifier_batch_not_approved",
      false,
    );
  });

  it("sanitizes unknown classifier client errors", async () => {
    const client = clientReturning(
      Response.json({ detail: { code: "new_error" } }, { status: 418 }),
    );
    await expectImportError(
      client.getApprovedGroups(batchId),
      "approved_groups_unexpected_client_error",
      false,
    );
  });

  it("treats classifier server failures as retryable", async () => {
    const client = clientReturning(Response.json({}, { status: 503 }));
    await expectImportError(
      client.getApprovedGroups(batchId),
      "approved_groups_request_failed",
      true,
    );
  });

  it("keeps the timeout active while reading the response body", async () => {
    const fetchImplementation: typeof fetch = async (_input, init) => {
      const signal = init?.signal;
      return new Response(
        new ReadableStream({
          start(controller) {
            signal?.addEventListener("abort", () => {
              controller.error(new DOMException("Request timed out.", "AbortError"));
            });
          },
        }),
        { status: 200 },
      );
    };
    const client = new ApprovedGroupsClient({
      baseUrl: "http://classifier.test",
      timeoutMs: 5,
      fetchImplementation,
    });

    await expectImportError(
      client.getApprovedGroups(batchId),
      "approved_groups_request_failed",
      true,
    );
  });

  it("rejects an invalid successful response", async () => {
    const payload = approvedPayload();
    payload.groups[0]!.coverImageId = "00000000-0000-0000-0000-000000000099";
    await expectImportError(
      clientReturning(Response.json(payload)).getApprovedGroups(batchId),
      "approved_groups_response_invalid",
      false,
    );
  });

  it("rejects a successful response for a different batch", async () => {
    const payload = approvedPayload();
    payload.batchId = "00000000-0000-0000-0000-000000000099";
    await expectImportError(
      clientReturning(Response.json(payload)).getApprovedGroups(batchId),
      "approved_groups_response_invalid",
      false,
    );
  });
});
