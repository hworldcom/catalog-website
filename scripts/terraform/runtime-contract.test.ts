import { describe, expect, it } from "vitest";

import {
  runtimeImageReferenceIsValid,
  validateRuntimeCatalog,
  validateRuntimeContract,
  validateTimeBudgets,
} from "./runtime-contract.mjs";

import artifactCatalog from "../../infrastructure/google-cloud/artifact-catalog.json";
import runtimeCatalog from "../../infrastructure/google-cloud/runtime-catalog.json";
import reviewed from "../../infrastructure/google-cloud/inventory/reviewed-environments.json";

describe("Terraform runtime contract", () => {
  it("validates isolated plan-only runtime infrastructure", () => {
    expect(validateRuntimeContract()).toEqual({
      environments: ["uat", "production"],
      runtimeResourcesPerEnvironment: 5,
      queueBindingsPerEnvironment: 4,
    });
  });

  it("accepts only the matching immutable runtime image", () => {
    const digest = "a".repeat(64);
    const input = {
      environment: "uat",
      reviewedEnvironment: reviewed.environments.uat,
      artifactCatalog,
      runtimeCatalog,
    };

    expect(
      runtimeImageReferenceIsValid({
        ...input,
        reference: `europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/bazoria-uat-containers/bazoria-web@sha256:${digest}`,
      }),
    ).toBe(true);
    expect(
      runtimeImageReferenceIsValid({
        ...input,
        reference:
          "europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/bazoria-uat-containers/bazoria-web:latest",
      }),
    ).toBe(false);
    expect(
      runtimeImageReferenceIsValid({
        ...input,
        reference: `europe-west3-docker.pkg.dev/bazoria-prod-lnlabs/bazoria-prod-containers/bazoria-web@sha256:${digest}`,
      }),
    ).toBe(false);
  });

  it("rejects an unsafe timeout ordering", () => {
    const invalid = structuredClone(runtimeCatalog);
    invalid.queue.dispatchDeadlineSeconds = 269;

    expect(() => validateTimeBudgets(invalid)).toThrow(
      "queue dispatch deadline lacks the worker safety margin",
    );
  });

  it("rejects broader worker concurrency", () => {
    const invalid = structuredClone(runtimeCatalog);
    invalid.worker.concurrency = 2;

    expect(() => validateRuntimeCatalog(invalid)).toThrow("worker runtime contract differs");
  });
});
