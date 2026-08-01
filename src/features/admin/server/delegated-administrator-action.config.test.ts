import { describe, expect, it } from "vitest";

import { readDelegatedAdministratorActionConfig } from "./delegated-administrator-action.config";

describe("readDelegatedAdministratorActionConfig", () => {
  it("uses bounded prototype defaults", () => {
    expect(readDelegatedAdministratorActionConfig({})).toEqual({
      actionTimeoutMs: 30_000,
      leaseTimeoutSeconds: 120,
    });
  });

  it.each([
    { action: "0", lease: "120" },
    { action: "301", lease: "400" },
    { action: "30.5", lease: "120" },
    { action: "30", lease: "30" },
    { action: "300", lease: "329" },
    { action: "30", lease: "901" },
  ])("rejects invalid action and lease settings: $action/$lease", ({ action, lease }) => {
    expect(() =>
      readDelegatedAdministratorActionConfig({
        BAZORIA_DELEGATED_ADMIN_ACTION_TIMEOUT_SECONDS: action,
        BAZORIA_DELEGATED_ADMIN_ACTION_LEASE_TIMEOUT_SECONDS: lease,
      }),
    ).toThrow(
      expect.objectContaining({
        statusCode: 500,
        code: "delegated_action_configuration_invalid",
      }),
    );
  });
});
