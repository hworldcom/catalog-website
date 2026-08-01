import { describe, expect, it, vi } from "vitest";

import { delegatedReviewResourceNotFound } from "../delegated-classifier-review-import.types";
import { handleGetDelegatedClassifierThumbnail } from "./delegated-classifier-thumbnail.http";
import { PrototypeAdministratorError } from "./prototype-administrator-access";

describe("handleGetDelegatedClassifierThumbnail", () => {
  it("validates identifiers before authentication", async () => {
    const authenticate = vi.fn();
    const service = { getThumbnail: vi.fn() };

    const response = await handleGetDelegatedClassifierThumbnail(
      request,
      "invalid",
      imageId,
      service,
      authenticate,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "delegated_review_invalid" },
    });
    expect(authenticate).not.toHaveBeenCalled();
    expect(service.getThumbnail).not.toHaveBeenCalled();
  });

  it("rejects a user outside the administrator allowlist before reading", async () => {
    const service = { getThumbnail: vi.fn() };
    const response = await handleGetDelegatedClassifierThumbnail(
      request,
      workflowId,
      imageId,
      service,
      vi.fn(async () => {
        throw new PrototypeAdministratorError(
          403,
          "prototype_administrator_required",
          "Prototype administrator access is required.",
        );
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "prototype_administrator_required" },
    });
    expect(service.getThumbnail).not.toHaveBeenCalled();
  });

  it("authenticates before reading and returns private no-store image bytes", async () => {
    const calls: string[] = [];
    const authenticate = vi.fn(async () => {
      calls.push("authenticate");
      return { userId: administratorId, prototypeAdministrator: true };
    });
    const service = {
      getThumbnail: vi.fn(async () => {
        calls.push("read");
        return new Uint8Array([255, 216, 255, 217]);
      }),
    };

    const response = await handleGetDelegatedClassifierThumbnail(
      request,
      workflowId,
      imageId,
      service,
      authenticate,
    );

    expect(calls).toEqual(["authenticate", "read"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([255, 216, 255, 217]);
  });

  it("returns the stable non-disclosing not-found response", async () => {
    const service = {
      getThumbnail: vi.fn(async () => {
        throw delegatedReviewResourceNotFound();
      }),
    };

    const response = await handleGetDelegatedClassifierThumbnail(
      request,
      workflowId,
      imageId,
      service,
      vi.fn(async () => ({
        userId: administratorId,
        prototypeAdministrator: true as const,
      })),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "delegated_review_resource_not_found" },
    });
  });
});

const request = new Request("http://example.test/v1/admin/classifier-uploads");
const workflowId = uuid(1);
const imageId = uuid(2);
const administratorId = uuid(3);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
