import { describe, expect, it } from "vitest";

import {
  assertPrototypeAdministrator,
  PrototypeAdministratorError,
  readPrototypeAdministratorUserIds,
} from "./prototype-administrator-access";

const administratorId = "00000000-0000-0000-0000-000000000001";
const otherUserId = "00000000-0000-0000-0000-000000000002";

describe("prototype administrator access", () => {
  it("trims and deduplicates valid identifiers", () => {
    expect([
      ...readPrototypeAdministratorUserIds(
        ` ${administratorId}, ${otherUserId},${administratorId} `,
      ),
    ]).toEqual([administratorId, otherUserId]);
  });

  it.each([undefined, "", "   "])("treats %j as an empty allowlist", (value) => {
    expect([...readPrototypeAdministratorUserIds(value)]).toEqual([]);
  });

  it.each([
    `,${administratorId}`,
    `${administratorId},`,
    `${administratorId},,${otherUserId}`,
    "not-a-uuid",
  ])("rejects malformed allowlist value %j", (value) => {
    expect(() => readPrototypeAdministratorUserIds(value)).toThrowError(
      expect.objectContaining({
        statusCode: 500,
        code: "prototype_administrator_configuration_invalid",
      }),
    );
  });

  it("accepts an allowlisted user", () => {
    expect(() =>
      assertPrototypeAdministrator(
        administratorId,
        readPrototypeAdministratorUserIds(administratorId),
      ),
    ).not.toThrow();
  });

  it("rejects a user outside the allowlist", () => {
    expect(() =>
      assertPrototypeAdministrator(otherUserId, readPrototypeAdministratorUserIds(administratorId)),
    ).toThrowError(
      expect.objectContaining({
        statusCode: 403,
        code: "prototype_administrator_required",
      }),
    );
  });

  it("uses a typed access error", () => {
    try {
      assertPrototypeAdministrator(otherUserId, new Set());
      throw new Error("expected access failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PrototypeAdministratorError);
    }
  });
});
