import { describe, expect, it } from "vitest";

import { ClassifierNormalizedImageClient } from "./classifier-normalized-image.service";
import { ClassifierImportError } from "./classifier-import.types";

const ids = {
  batchId: "00000000-0000-0000-0000-000000000010",
  groupId: "00000000-0000-0000-0000-000000000020",
  imageId: "00000000-0000-0000-0000-000000000030",
};

function clientReturning(response: Response): ClassifierNormalizedImageClient {
  return new ClassifierNormalizedImageClient({
    baseUrl: "http://classifier.test",
    timeoutMs: 100,
    fetchImplementation: async () => response,
  });
}

async function expectImportError(promise: Promise<unknown>, code: string, retryable: boolean) {
  await expect(promise).rejects.toMatchObject({
    name: "ClassifierImportError",
    code,
    retryable,
  } satisfies Partial<ClassifierImportError>);
}

describe("ClassifierNormalizedImageClient", () => {
  it("accepts an exact JPEG response", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const response = new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.byteLength),
      },
    });

    await expect(clientReturning(response).readNormalizedImage(ids)).resolves.toEqual({
      bytes,
      contentType: "image/jpeg",
      contentLength: bytes.byteLength,
    });
  });

  it.each([
    ["approved_image_export_disabled", "approved_image_export_disabled", false],
    ["approved_image_not_found", "classifier_image_not_found", false],
    ["approved_image_not_approved", "classifier_image_not_approved", false],
    ["approved_image_unavailable", "classifier_image_unavailable", true],
  ])("maps classifier code %s", async (sourceCode, expectedCode, retryable) => {
    const response = Response.json({ detail: { code: sourceCode } }, { status: 409 });
    await expectImportError(
      clientReturning(response).readNormalizedImage(ids),
      expectedCode,
      retryable,
    );
  });

  it("rejects a body whose length differs from Content-Length", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": "4",
      },
    });
    await expectImportError(
      clientReturning(response).readNormalizedImage(ids),
      "classifier_image_response_invalid",
      false,
    );
  });

  it("maps network failures as retryable", async () => {
    const client = new ClassifierNormalizedImageClient({
      baseUrl: "http://classifier.test",
      timeoutMs: 100,
      fetchImplementation: async () => {
        throw new TypeError("connection failed");
      },
    });
    await expectImportError(
      client.readNormalizedImage(ids),
      "classifier_image_request_failed",
      true,
    );
  });
});
