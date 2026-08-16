import { describe, expect, it, vi } from "vitest";

import type { SellerProductArchiveRepository } from "./seller-product-archive.repository";
import { SellerProductArchiveRepositoryError } from "./seller-product-archive.repository";
import { SellerProductArchiveService } from "./seller-product-archive.service";

const productId = uuid(1);
const sellerId = uuid(2);
const actorUserId = uuid(3);
const requestId = uuid(4);

describe("SellerProductArchiveService", () => {
  it("returns the moderation-aware archived snapshot", async () => {
    const repository = memoryRepository();

    await expect(new SellerProductArchiveService(repository).archive(input())).resolves.toEqual({
      productId,
      productStatus: "archived",
      moderationRevision: 4,
    });
    expect(repository.archive).toHaveBeenCalledWith(input());
  });

  it("returns the restoration route and private revision", async () => {
    const repository = memoryRepository();

    await expect(new SellerProductArchiveService(repository).restore(input())).resolves.toEqual({
      productId,
      productStatus: "archived",
      moderationRevision: 5,
      restorationDraft: true,
      editRoute: `/seller/products/${productId}`,
    });
    expect(repository.restore).toHaveBeenCalledWith(input());
  });

  it.each([
    ["malformed product", { productId: "not-a-uuid" }],
    ["missing seller", { sellerId: null }],
    ["malformed actor", { actorUserId: "not-a-uuid" }],
    ["malformed request", { requestId: "not-a-uuid" }],
    ["invalid revision", { expectedModerationRevision: 0 }],
  ])("masks %s before invoking the repository", async (_label, override) => {
    const repository = memoryRepository();

    await expect(
      new SellerProductArchiveService(repository).archive(input(override)),
    ).rejects.toMatchObject({ statusCode: 404, code: "product_not_found" });
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it.each([
    ["product_not_found", 404],
    ["product_archive_moderation_active", 409],
    ["product_restore_moderation_active", 409],
    ["product_moderation_revision_conflict", 409],
    ["product_archive_not_allowed", 409],
    ["product_restore_not_allowed", 409],
    ["product_archive_request_conflict", 409],
    ["product_restore_request_conflict", 409],
  ] as const)("maps %s to its stable operation error", async (code, statusCode) => {
    const repository = memoryRepository();
    repository.archive.mockResolvedValue({ result: code });

    await expect(
      new SellerProductArchiveService(repository).archive(input()),
    ).rejects.toMatchObject({ statusCode, code });
  });

  it("does not expose unexpected database errors", async () => {
    const repository = memoryRepository();
    repository.restore.mockRejectedValue(new SellerProductArchiveRepositoryError("raw error"));

    await expect(
      new SellerProductArchiveService(repository).restore(input()),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "product_moderation_activation_unavailable",
    });
  });
});

function input(overrides: Partial<Parameters<SellerProductArchiveService["archive"]>[0]> = {}) {
  return {
    productId,
    sellerId,
    actorUserId,
    expectedModerationRevision: 3,
    requestId,
    ...overrides,
  };
}

function memoryRepository() {
  return {
    archive: vi.fn(async () => ({
      result: "archived" as const,
      productId,
      productStatus: "archived" as const,
      moderationRevision: 4,
      restorationDraft: false as const,
    })),
    restore: vi.fn(async () => ({
      result: "restoration_draft" as const,
      productId,
      productStatus: "archived" as const,
      moderationRevision: 5,
      restorationDraft: true as const,
    })),
  } satisfies SellerProductArchiveRepository;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
