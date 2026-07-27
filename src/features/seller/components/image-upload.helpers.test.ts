import { describe, expect, it } from "vitest";

import {
  buildImageUploadPath,
  IMAGE_UPLOAD_MAX_BYTES,
  validateImageUpload,
} from "./image-upload.helpers";

describe("validateImageUpload", () => {
  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ] as const)("accepts %s and returns its trusted extension", (type, extension) => {
    expect(validateImageUpload({ type, size: IMAGE_UPLOAD_MAX_BYTES })).toEqual({
      ok: true,
      extension,
    });
  });

  it("rejects unsupported MIME types", () => {
    expect(validateImageUpload({ type: "image/gif", size: 100 })).toEqual({
      ok: false,
      message: "Only JPG, PNG, or WebP images are allowed.",
    });
  });

  it("rejects images larger than 20 MB", () => {
    expect(
      validateImageUpload({
        type: "image/jpeg",
        size: IMAGE_UPLOAD_MAX_BYTES + 1,
      }),
    ).toEqual({
      ok: false,
      message: "Image must be 20 MB or smaller.",
    });
  });
});

describe("buildImageUploadPath", () => {
  it("keeps product uploads under the current user's prefix", () => {
    expect(
      buildImageUploadPath({
        userId: "user-123",
        folder: "products",
        extension: "webp",
        objectId: "object-456",
      }),
    ).toBe("user-123/products/object-456.webp");
  });

  it("keeps storefront uploads under the storefront folder", () => {
    expect(
      buildImageUploadPath({
        userId: "user-123",
        folder: "storefront",
        extension: "png",
        objectId: "object-789",
      }),
    ).toBe("user-123/storefront/object-789.png");
  });
});
