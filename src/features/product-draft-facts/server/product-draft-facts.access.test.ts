import { describe, expect, it } from "vitest";

import {
  isPrototypeAdministrator,
  readPrototypeAdministratorUserIds,
} from "./product-draft-facts.access";

const firstUserId = "00000000-0000-0000-0000-000000000001";
const secondUserId = "00000000-0000-0000-0000-000000000002";

describe("prototype ProductDraft facts administrator access", () => {
  it("reads a trimmed comma-separated allowlist", () => {
    const userIds = readPrototypeAdministratorUserIds(` ${firstUserId}, ${secondUserId} `);

    expect([...userIds]).toEqual([firstUserId, secondUserId]);
    expect(isPrototypeAdministrator(secondUserId, userIds)).toBe(true);
  });

  it("uses an empty allowlist when the variable is absent", () => {
    expect([...readPrototypeAdministratorUserIds(undefined)]).toEqual([]);
  });

  it("rejects malformed administrator identifiers", () => {
    expect(() => readPrototypeAdministratorUserIds("not-a-uuid")).toThrow(
      "Prototype administrator access is not configured correctly.",
    );
  });
});
