import { describe, expect, it } from "vitest";

import {
  parseLegacyProductDraftImageCutoverArguments,
  readLegacyProductDraftImageCutoverConfig,
} from "./legacy-product-draft-image-cutover.config";

describe("legacy ProductDraft image cutover configuration", () => {
  it("uses the bounded default batch size", () => {
    expect(parseLegacyProductDraftImageCutoverArguments([])).toEqual({ batchSize: 50 });
  });

  it.each([["0"], ["101"], ["1.5"], ["x"], ["50", "--other"]])(
    "rejects invalid command arguments %j",
    (...arguments_) => {
      expect(() =>
        parseLegacyProductDraftImageCutoverArguments(
          arguments_.flat().filter((value): value is string => typeof value === "string"),
        ),
      ).toThrow();
    },
  );

  it("accepts batch sizes from 1 through 100", () => {
    expect(parseLegacyProductDraftImageCutoverArguments(["--batch-size", "1"])).toEqual({
      batchSize: 1,
    });
    expect(parseLegacyProductDraftImageCutoverArguments(["--batch-size", "100"])).toEqual({
      batchSize: 100,
    });
  });

  it("requires only server-side Supabase storage configuration", () => {
    expect(
      readLegacyProductDraftImageCutoverConfig({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "secret",
      }),
    ).toEqual({
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "secret",
      storageHeadTimeoutMs: 15_000,
      storageWriteTimeoutMs: 60_000,
    });
  });
});
