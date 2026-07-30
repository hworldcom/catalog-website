import { describe, expect, it } from "vitest";

import { readSellerClassifierBatchConfig } from "./seller-classifier-batch.config";

const environment = {
  BAZORIA_CLASSIFIER_API_BASE_URL: "http://localhost:8000/",
  BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID: uuid(1),
};

describe("readSellerClassifierBatchConfig", () => {
  it("uses the bounded create timeout default", () => {
    expect(readSellerClassifierBatchConfig(environment)).toEqual({
      classifierApiBaseUrl: "http://localhost:8000",
      classifierBatchCreateTimeoutMs: 30_000,
      classifierCommandTimeoutMs: 30_000,
      classifierOrganizationId: uuid(1),
    });
  });

  it("accepts a positive timeout override", () => {
    expect(
      readSellerClassifierBatchConfig({
        ...environment,
        BAZORIA_CLASSIFIER_BATCH_CREATE_TIMEOUT_SECONDS: "12.5",
      }).classifierBatchCreateTimeoutMs,
    ).toBe(12_500);
    expect(
      readSellerClassifierBatchConfig({
        ...environment,
        BAZORIA_CLASSIFIER_COMMAND_TIMEOUT_SECONDS: "8",
      }).classifierCommandTimeoutMs,
    ).toBe(8_000);
  });

  it.each([
    [{ ...environment, BAZORIA_CLASSIFIER_API_BASE_URL: "ftp://example.test" }],
    [{ ...environment, BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID: "invalid" }],
    [{ ...environment, BAZORIA_CLASSIFIER_BATCH_CREATE_TIMEOUT_SECONDS: "0" }],
    [{ ...environment, BAZORIA_CLASSIFIER_COMMAND_TIMEOUT_SECONDS: "0" }],
  ])("rejects invalid server configuration", (invalidEnvironment) => {
    expect(() => readSellerClassifierBatchConfig(invalidEnvironment)).toThrow(
      /^seller_classifier_configuration_invalid:/,
    );
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
