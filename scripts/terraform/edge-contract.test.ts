import { describe, expect, it } from "vitest";

import { validateEdgeCatalog, validateEdgeContract } from "./edge-contract.mjs";

import edgeCatalog from "../../infrastructure/google-cloud/edge-catalog.json";

describe("Terraform custom-domain edge contract", () => {
  it("validates isolated, inert UAT and production edge plans", () => {
    expect(validateEdgeContract()).toEqual({
      edgeResourcesPerEnvironment: 14,
      environments: ["uat", "production"],
      protectedResourcesPerEnvironment: 5,
    });
  });

  it("rejects an edge network tier outside the reviewed contract", () => {
    const invalid = structuredClone(edgeCatalog);
    invalid.networkTier = "STANDARD";

    expect(() => validateEdgeCatalog(invalid)).toThrow("edge network tier differs");
  });

  it("rejects an enabled content delivery network", () => {
    const invalid = structuredClone(edgeCatalog);
    invalid.backend.enableCdn = true;

    expect(() => validateEdgeCatalog(invalid)).toThrow("edge backend differs");
  });

  it("rejects TLS below version 1.2", () => {
    const invalid = structuredClone(edgeCatalog);
    invalid.tls.minimumVersion = "TLS_1_0";

    expect(() => validateEdgeCatalog(invalid)).toThrow("edge TLS contract differs");
  });
});
