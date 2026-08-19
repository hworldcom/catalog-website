import { describe, expect, it } from "vitest";

import {
  parseAdministratorModerationIdentifier,
  parseAdministratorModerationRequest,
  sellerSubmissionSnapshotSchema,
} from "./administrator-moderation.types";
import {
  decodeAdministratorModerationCursor,
  encodeAdministratorModerationCursor,
} from "./administrator-moderation.cursor";

describe("administrator moderation request and cursor", () => {
  it("normalizes the default queue and activation-only filters", () => {
    expect(parseAdministratorModerationRequest(undefined)).toEqual({
      submissionType: null,
      reviewStatus: "pending",
      activationStatus: null,
      sellerId: null,
      limit: 25,
      cursor: null,
    });
    expect(parseAdministratorModerationRequest({ activationStatus: "failed" })).toEqual({
      submissionType: null,
      reviewStatus: "approved",
      activationStatus: "failed",
      sellerId: null,
      limit: 25,
      cursor: null,
    });
  });

  it("rejects activation filters for seller or non-approved reviews", () => {
    for (const request of [
      { submissionType: "new_seller", activationStatus: "failed" },
      { submissionType: "seller_update", activationStatus: "running" },
      { reviewStatus: "pending", activationStatus: "failed" },
      { limit: 101 },
      { sellerId: "invalid" },
      { unexpected: true },
    ]) {
      expect(() => parseAdministratorModerationRequest(request)).toThrowError(
        expect.objectContaining({ statusCode: 400, code: "moderation_request_invalid" }),
      );
    }
  });

  it("binds an opaque cursor to all normalized filters and the limit", () => {
    const filters = {
      submissionType: "product_update" as const,
      reviewStatus: "approved" as const,
      activationStatus: "failed" as const,
      sellerId: uuid(1),
      limit: 50,
    };
    const cursor = encodeAdministratorModerationCursor({
      submittedAt: "2026-08-18T10:00:00.000Z",
      submissionType: "product_update",
      submissionId: uuid(2),
      filters,
    });

    expect(decodeAdministratorModerationCursor(cursor, filters)).toMatchObject({
      version: 1,
      submittedAt: "2026-08-18T10:00:00.000Z",
      submissionType: "product_update",
      submissionId: uuid(2),
      filters,
    });
    expect(() =>
      decodeAdministratorModerationCursor(cursor, { ...filters, limit: 25 }),
    ).toThrowError(expect.objectContaining({ code: "moderation_request_invalid" }));
    expect(() => decodeAdministratorModerationCursor(`${cursor}=`, filters)).toThrowError(
      expect.objectContaining({ code: "moderation_request_invalid" }),
    );
  });

  it("strictly validates detail identifiers and seller submission snapshots", () => {
    expect(parseAdministratorModerationIdentifier({ submissionId: uuid(3) })).toEqual({
      submissionId: uuid(3),
    });
    expect(() =>
      sellerSubmissionSnapshotSchema.parse({ ...sellerSnapshot(), unexpected: true }),
    ).toThrow();
    expect(() => parseAdministratorModerationIdentifier({ submissionId: "invalid" })).toThrowError(
      expect.objectContaining({ code: "moderation_request_invalid" }),
    );
  });
});

function sellerSnapshot() {
  return {
    sellerId: uuid(4),
    revision: 1,
    submissionKind: "initial" as const,
    name: "Seller",
    slug: "seller",
    city: null,
    country: null,
    whatsapp: null,
    email: null,
    about: null,
    logoAssetId: null,
    coverAssetId: null,
    establishedYear: null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
