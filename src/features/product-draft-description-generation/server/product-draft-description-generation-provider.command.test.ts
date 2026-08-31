import { describe, expect, it } from "vitest";

import { readProviderQaImage } from "./product-draft-description-generation-provider.command";

describe("product description provider QA input", () => {
  it("uses a maintained tracked synthetic WebP image", async () => {
    const bytes = await readProviderQaImage();
    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});
