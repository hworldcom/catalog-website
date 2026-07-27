import { describe, expect, it } from "vitest";

import {
  readClassifierImportConfig,
  readDefaultClassifierSellerId,
} from "./classifier-import.config";

const requiredEnvironment = {
  BAZORIA_CLASSIFIER_API_BASE_URL: "http://localhost:8000/",
  BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID: "00000000-0000-0000-0000-000000000001",
  BAZORIA_DEFAULT_SELLER_ID: "00000000-0000-0000-0000-000000000002",
  BAZORIA_CLASSIFIER_IMPORT_DISPATCH_MODE: "local",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

describe("readClassifierImportConfig", () => {
  it("validates and normalizes server-only settings", () => {
    expect(readClassifierImportConfig(requiredEnvironment)).toEqual({
      classifierApiBaseUrl: "http://localhost:8000",
      approvedGroupsTimeoutMs: 30_000,
      importRunLeaseTimeoutSeconds: 900,
      normalizedImageReadTimeoutMs: 30_000,
      storageHeadTimeoutMs: 15_000,
      storageWriteTimeoutMs: 60_000,
      imagePromotionClaimTimeoutSeconds: 300,
      workerPollIntervalMs: 5_000,
      dispatchMode: "local",
      classifierOrganizationId: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("does not require the prototype default seller for shared runtime configuration", () => {
    const { BAZORIA_DEFAULT_SELLER_ID: _sellerId, ...environment } = requiredEnvironment;
    expect(readClassifierImportConfig(environment).classifierOrganizationId).toBe(
      "00000000-0000-0000-0000-000000000001",
    );
  });

  it.each([
    [{ ...requiredEnvironment, BAZORIA_CLASSIFIER_API_BASE_URL: "ftp://example.test" }],
    [
      {
        ...requiredEnvironment,
        BAZORIA_CLASSIFIER_APPROVED_GROUPS_TIMEOUT_SECONDS: "0",
      },
    ],
    [
      {
        ...requiredEnvironment,
        BAZORIA_CLASSIFIER_IMPORT_RUN_LEASE_TIMEOUT_SECONDS: "-1",
      },
    ],
    [
      {
        ...requiredEnvironment,
        BAZORIA_CLASSIFIER_IMPORT_RUN_LEASE_TIMEOUT_SECONDS: "1.5",
      },
    ],
    [
      {
        ...requiredEnvironment,
        BAZORIA_IMAGE_PROMOTION_CLAIM_TIMEOUT_SECONDS: "224",
      },
    ],
    [
      {
        ...requiredEnvironment,
        BAZORIA_CLASSIFIER_IMPORT_WORKER_POLL_INTERVAL_SECONDS: "0",
      },
    ],
    [
      {
        ...requiredEnvironment,
        BAZORIA_CLASSIFIER_IMPORT_WORKER_POLL_INTERVAL_SECONDS: "-1",
      },
    ],
    [
      {
        ...requiredEnvironment,
        BAZORIA_CLASSIFIER_IMPORT_WORKER_POLL_INTERVAL_SECONDS: "not-a-number",
      },
    ],
    [
      {
        ...requiredEnvironment,
        BAZORIA_CLASSIFIER_IMPORT_WORKER_POLL_INTERVAL_SECONDS: "Infinity",
      },
    ],
    [
      {
        ...requiredEnvironment,
        BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID: "not-a-uuid",
      },
    ],
    [{ ...requiredEnvironment, SUPABASE_SERVICE_ROLE_KEY: "" }],
    [{ ...requiredEnvironment, BAZORIA_CLASSIFIER_IMPORT_DISPATCH_MODE: "unsupported" }],
  ])("rejects invalid settings", (environment) => {
    expect(() => readClassifierImportConfig(environment)).toThrow(
      "Invalid classifier import configuration",
    );
  });

  it("parses an explicit worker polling interval", () => {
    expect(
      readClassifierImportConfig({
        ...requiredEnvironment,
        BAZORIA_CLASSIFIER_IMPORT_WORKER_POLL_INTERVAL_SECONDS: "1.25",
      }).workerPollIntervalMs,
    ).toBe(1_250);
  });
});

describe("readDefaultClassifierSellerId", () => {
  it("reads the prototype default seller independently", () => {
    expect(readDefaultClassifierSellerId(requiredEnvironment)).toBe(
      "00000000-0000-0000-0000-000000000002",
    );
  });

  it.each([undefined, "", "not-a-uuid"])("rejects an invalid default seller: %s", (value) => {
    expect(() => readDefaultClassifierSellerId({ BAZORIA_DEFAULT_SELLER_ID: value })).toThrow(
      "Invalid classifier import configuration: BAZORIA_DEFAULT_SELLER_ID",
    );
  });
});
