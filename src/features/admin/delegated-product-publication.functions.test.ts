import { describe, expect, it } from "vitest";

import { delegatedActionRequestConflict } from "./delegated-classifier-review-import.types";
import { handleDelegatedProductPublicationOperation } from "./delegated-product-publication.functions";

describe("handleDelegatedProductPublicationOperation", () => {
  it("preserves stable delegated action errors", async () => {
    const conflict = delegatedActionRequestConflict();

    await expect(
      handleDelegatedProductPublicationOperation(async () => {
        throw conflict;
      }),
    ).rejects.toBe(conflict);
  });

  it("maps unexpected failures to the stable unavailable error", async () => {
    await expect(
      handleDelegatedProductPublicationOperation(async () => {
        throw new Error("database credentials");
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "delegated_product_draft_unavailable",
    });
  });
});
