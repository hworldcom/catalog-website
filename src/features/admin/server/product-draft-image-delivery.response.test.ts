import { describe, expect, it, vi } from "vitest";

import {
  applyPrivateProductDraftImageResponseHeaders,
  PRODUCT_DRAFT_IMAGE_DELIVERY_CACHE_CONTROL,
} from "./product-draft-image-delivery.response";
import { readProductDraftImageDeliveryStorageConfiguration } from "./product-draft-image-delivery.runtime";

describe("ProductDraft image delivery response", () => {
  it("applies private non-cacheable transport headers", () => {
    const setHeader = vi.fn();

    applyPrivateProductDraftImageResponseHeaders(setHeader);

    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      PRODUCT_DRAFT_IMAGE_DELIVERY_CACHE_CONTROL,
    );
    expect(PRODUCT_DRAFT_IMAGE_DELIVERY_CACHE_CONTROL).toBe("private, no-store");
  });

  it("reads only valid server-side Supabase storage configuration", () => {
    expect(
      readProductDraftImageDeliveryStorageConfiguration({
        SUPABASE_URL: "https://project.supabase.co/",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_server-only",
      }),
    ).toEqual({
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "sb_secret_server-only",
    });

    for (const environment of [
      {},
      {
        SUPABASE_URL: "file:///tmp/supabase",
        SUPABASE_SERVICE_ROLE_KEY: "secret",
      },
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: " ",
      },
    ]) {
      expect(() => readProductDraftImageDeliveryStorageConfiguration(environment)).toThrowError(
        expect.objectContaining({
          statusCode: 500,
          code: "product_draft_image_delivery_unavailable",
        }),
      );
    }
  });
});
