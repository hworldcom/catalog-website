import { describe, expect, it } from "vitest";

import { DefaultClassifierImportDestinationService } from "./classifier-import-destination.service";

const sellerId = "00000000-0000-0000-0000-000000000002";

describe("DefaultClassifierImportDestinationService", () => {
  it("returns the configured eligible seller", async () => {
    const service = new DefaultClassifierImportDestinationService(
      {
        getEligibleSeller: async (id) => (id === sellerId ? { id, name: "Kesar Textiles" } : null),
      },
      () => sellerId,
    );

    await expect(service.getDestination()).resolves.toEqual({
      destinationSeller: { id: sellerId, name: "Kesar Textiles" },
      source: "prototype_default",
    });
  });

  it("rejects invalid configuration before reading the seller", async () => {
    let sellerRead = false;
    const service = new DefaultClassifierImportDestinationService(
      {
        getEligibleSeller: async () => {
          sellerRead = true;
          return null;
        },
      },
      () => {
        throw new Error("invalid default");
      },
    );

    await expect(service.resolveDestination()).rejects.toMatchObject({
      status: 500,
      code: "classifier_import_configuration_invalid",
    });
    expect(sellerRead).toBe(false);
  });

  it("returns a stable unavailable error for an ineligible seller", async () => {
    const service = new DefaultClassifierImportDestinationService(
      { getEligibleSeller: async () => null },
      () => sellerId,
    );

    await expect(service.resolveDestination()).rejects.toMatchObject({
      status: 503,
      code: "classifier_import_default_seller_unavailable",
    });
  });
});
