import { describe, expect, it, vi } from "vitest";

import {
  prepareSellerClassifierDirectUploads,
  uploadSellerClassifierFiles,
  validateSellerClassifierFiles,
} from "./seller-classifier-direct-upload";

describe("seller classifier direct uploads", () => {
  it("uses workflow-provided count and size limits", () => {
    expect(
      validateSellerClassifierFiles([jpeg("front.jpg", 101)], {
        maxFiles: 20,
        maxFileSizeBytes: 100,
      }),
    ).toContain("exceeds");
    expect(
      validateSellerClassifierFiles([new File(["x"], "front.png", { type: "image/png" })], {
        maxFiles: 20,
        maxFileSizeBytes: 100,
      }),
    ).toContain("JPEG");
    expect(
      validateSellerClassifierFiles([jpeg("front.jpg", 100)], {
        maxFiles: 20,
        maxFileSizeBytes: 100,
      }),
    ).toBeNull();
  });

  it("matches signed URLs to files by upload order and filename", () => {
    const files = [jpeg("front.jpg", 10), jpeg("back.jpg", 10)];
    const prepared = prepareSellerClassifierDirectUploads(files, [
      registration(1, "back.jpg"),
      registration(0, "front.jpg"),
    ]);

    expect(prepared.map((item) => [item.originalFilename, item.file.name])).toEqual([
      ["front.jpg", "front.jpg"],
      ["back.jpg", "back.jpg"],
    ]);
  });

  it("uploads at most four files concurrently and keeps per-file failures", async () => {
    let active = 0;
    let maximumActive = 0;
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response(null, { status: String(input).endsWith("/5") ? 500 : 200 });
    });
    const files = Array.from({ length: 8 }, (_, index) => jpeg(`${index}.jpg`, 10));
    const uploads = prepareSellerClassifierDirectUploads(
      files,
      files.map((file, index) => registration(index, file.name)),
    );

    const completed = await uploadSellerClassifierFiles(
      uploads,
      () => undefined,
      fetchImplementation,
    );

    expect(maximumActive).toBe(4);
    expect(completed[5]).toMatchObject({
      status: "failed",
      errorMessage: "The file could not be uploaded.",
    });
    expect(completed.filter((item) => item.status === "uploaded")).toHaveLength(7);
  });
});

function registration(uploadOrder: number, originalFilename: string) {
  return {
    imageId: uuid(uploadOrder + 1),
    uploadOrder,
    originalFilename,
    uploadUrl: `https://storage.example.test/${uploadOrder}`,
  };
}

function jpeg(name: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type: "image/jpeg" });
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
