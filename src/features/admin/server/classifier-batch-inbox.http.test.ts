import { describe, expect, it } from "vitest";

import { handleListClassifierBatches } from "./classifier-batch-inbox.http";
import type {
  ClassifierBatchInboxPage,
  ClassifierBatchInboxReader,
} from "./classifier-batch-inbox.service";
import { ClassifierImportApiError } from "./classifier-import.types";
import type { PrototypeAdministratorRequestContext } from "./prototype-administrator-auth";

const emptyPage: ClassifierBatchInboxPage = { items: [], nextCursor: null };
const authorized = async (): Promise<PrototypeAdministratorRequestContext> =>
  ({ prototypeAdministrator: true }) as PrototypeAdministratorRequestContext;

describe("handleListClassifierBatches", () => {
  it("uses default pagination and returns a no-store response", async () => {
    let request: { limit: number; cursor?: string } | null = null;
    const reader: ClassifierBatchInboxReader = {
      list: async (input) => {
        request = input;
        return emptyPage;
      },
    };

    const response = await handleListClassifierBatches(
      new Request("http://bazoria.test/v1/admin/classifier-batches"),
      reader,
      authorized,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(request).toEqual({ limit: 50 });
    await expect(response.json()).resolves.toEqual(emptyPage);
  });

  it.each([
    "?limit=0",
    "?limit=101",
    "?limit=1.5",
    "?limit=1e2",
    "?limit=%2050",
    "?limit=",
    "?cursor=",
    "?limit=20&limit=30",
    "?cursor=one&cursor=two",
  ])("rejects invalid pagination: %s", async (query) => {
    const response = await handleListClassifierBatches(
      new Request(`http://bazoria.test/v1/admin/classifier-batches${query}`),
      { list: async () => emptyPage },
      authorized,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "classifier_batch_inbox_request_invalid" },
    });
  });

  it("preserves sanitized upstream failures", async () => {
    const response = await handleListClassifierBatches(
      new Request("http://bazoria.test/v1/admin/classifier-batches"),
      {
        list: async () => {
          throw new ClassifierImportApiError(
            503,
            "classifier_batch_inbox_unavailable",
            "Approved classifier batches are temporarily unavailable.",
          );
        },
      },
      authorized,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "classifier_batch_inbox_unavailable" },
    });
  });
});
