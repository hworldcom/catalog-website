import { describe, expect, it, vi } from "vitest";

import type { SellerProductArchiveRepository } from "./seller-product-archive.repository";
import { SellerProductArchiveRepositoryError } from "./seller-product-archive.repository";
import { SellerProductArchiveService } from "./seller-product-archive.service";

const productId = uuid(1);
const sellerId = uuid(2);

describe("SellerProductArchiveService", () => {
  it("returns the archived snapshot and preserves idempotent success", async () => {
    const repository = memoryRepository();
    const service = new SellerProductArchiveService(repository);

    await expect(service.archive(productId, sellerId)).resolves.toEqual({
      productId,
      productStatus: "archived",
    });
    await expect(service.archive(productId, sellerId)).resolves.toEqual({
      productId,
      productStatus: "archived",
    });
    expect(repository.archive).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["malformed product", "not-a-uuid", sellerId],
    ["missing seller", productId, null],
  ])("masks a %s as product not found", async (_label, selectedProductId, selectedSellerId) => {
    const repository = memoryRepository();

    await expect(
      new SellerProductArchiveService(repository).archive(selectedProductId, selectedSellerId),
    ).rejects.toMatchObject({ statusCode: 404, code: "product_not_found" });
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it("maps missing and other-seller products to the same not-found error", async () => {
    const repository = memoryRepository();
    repository.archive.mockResolvedValue({ result: "product_not_found" });

    await expect(
      new SellerProductArchiveService(repository).archive(productId, sellerId),
    ).rejects.toMatchObject({ statusCode: 404, code: "product_not_found" });
  });

  it("maps active publication to the stable conflict", async () => {
    const repository = memoryRepository();
    repository.archive.mockResolvedValue({ result: "product_archive_not_allowed" });

    await expect(
      new SellerProductArchiveService(repository).archive(productId, sellerId),
    ).rejects.toMatchObject({ statusCode: 409, code: "product_archive_not_allowed" });
  });

  it("does not expose unexpected database errors", async () => {
    const repository = memoryRepository();
    repository.archive.mockRejectedValue(new SellerProductArchiveRepositoryError("raw error"));

    await expect(
      new SellerProductArchiveService(repository).archive(productId, sellerId),
    ).rejects.toMatchObject({ statusCode: 503, code: "product_archive_unavailable" });
  });
});

function memoryRepository() {
  return {
    archive: vi.fn(async () => ({
      result: "archived" as const,
      productId,
      productStatus: "archived" as const,
    })),
  } satisfies SellerProductArchiveRepository;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
