import { describe, expect, it } from "vitest";

import {
  notificationChannelsAreValid,
  validateMonitoringCatalog,
  validateMonitoringContract,
} from "./monitoring-contract.mjs";

import monitoringCatalog from "../../infrastructure/google-cloud/monitoring-catalog.json";

describe("Terraform operational monitoring contract", () => {
  it("validates isolated metrics, alerts, and public checks", () => {
    expect(validateMonitoringContract()).toEqual({
      alertPoliciesPerEnvironment: 10,
      environments: ["uat", "production"],
      loggingMetricsPerEnvironment: 5,
      uptimeChecksPerEnvironment: 2,
    });
  });

  it("rejects a changed durable pending warning threshold", () => {
    const invalid = structuredClone(monitoringCatalog);
    invalid.pendingAge.warningThresholdMs = 240_000;

    expect(() => validateMonitoringCatalog(invalid)).toThrow("durable pending-age signals differ");
  });

  it("rejects empty, duplicate, or cross-project channels", () => {
    const valid = "projects/bazoria-uat-lnlabs/notificationChannels/channel-1";

    expect(
      notificationChannelsAreValid({ channels: [valid], projectId: "bazoria-uat-lnlabs" }),
    ).toBe(true);
    expect(notificationChannelsAreValid({ channels: [], projectId: "bazoria-uat-lnlabs" })).toBe(
      false,
    );
    expect(
      notificationChannelsAreValid({
        channels: [valid, valid],
        projectId: "bazoria-uat-lnlabs",
      }),
    ).toBe(false);
    expect(
      notificationChannelsAreValid({
        channels: ["projects/bazoria-prod-lnlabs/notificationChannels/channel-1"],
        projectId: "bazoria-uat-lnlabs",
      }),
    ).toBe(false);
  });
});
