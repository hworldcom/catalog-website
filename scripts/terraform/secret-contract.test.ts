import { describe, expect, it } from "vitest";

import { validateSecretCatalog, validateSecretContract } from "./secret-contract.mjs";

import identityCatalog from "../../infrastructure/google-cloud/identity-catalog.json";
import secretCatalog from "../../infrastructure/google-cloud/secret-catalog.json";

describe("Terraform secret contract", () => {
  it("validates regional containers and exact runtime access", () => {
    expect(validateSecretContract()).toEqual({
      accessBindingsPerEnvironment: 4,
      replicationRegion: "europe-west3",
      secretsPerEnvironment: 2,
    });
  });

  it("rejects access for the artifact-release identity", () => {
    const invalidCatalog = structuredClone(secretCatalog);
    invalidCatalog.secrets.openaiApiKey.accessorServiceAccountKeys.push("artifactRelease");

    expect(() => validateSecretCatalog(invalidCatalog, identityCatalog)).toThrow(
      "OpenAI secret contract differs",
    );
  });

  it("rejects cross-purpose access for the activation worker", () => {
    const invalidCatalog = structuredClone(secretCatalog);
    invalidCatalog.secrets.openaiApiKey.accessorServiceAccountKeys.push("activationWorker");

    expect(() => validateSecretCatalog(invalidCatalog, identityCatalog)).toThrow(
      "OpenAI secret contract differs",
    );
  });
});
