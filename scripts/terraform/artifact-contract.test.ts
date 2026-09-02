import { describe, expect, it } from "vitest";

import {
  buildArtifactRepositoryInventory,
  runtimeImagePathIsAllowed,
  validateArtifactCatalog,
  validateArtifactContract,
} from "./artifact-contract.mjs";

import artifactCatalog from "../../infrastructure/google-cloud/artifact-catalog.json";
import identityCatalog from "../../infrastructure/google-cloud/identity-catalog.json";
import reviewed from "../../infrastructure/google-cloud/inventory/reviewed-environments.json";

describe("Terraform artifact contract", () => {
  it("validates isolated private repositories and exact direct access", () => {
    expect(validateArtifactContract()).toEqual({
      directBindingsPerEnvironment: 2,
      region: "europe-west3",
      repositoriesPerEnvironment: 1,
    });
  });

  it("keeps UAT and production repository paths isolated", () => {
    const uat = buildArtifactRepositoryInventory({
      environment: "uat",
      reviewedEnvironment: reviewed.environments.uat,
      identityCatalog,
      artifactCatalog,
    });
    const production = buildArtifactRepositoryInventory({
      environment: "production",
      reviewedEnvironment: reviewed.environments.production,
      identityCatalog,
      artifactCatalog,
    });

    expect(uat.repositoryPath).not.toBe(production.repositoryPath);
    expect(uat.writerMembers).toEqual([
      "serviceAccount:baz-uat-artifact-release@bazoria-uat-lnlabs.iam.gserviceaccount.com",
    ]);
    expect(production.readerMembers).toEqual([
      "serviceAccount:baz-prod-terraform@bazoria-prod-lnlabs.iam.gserviceaccount.com",
    ]);
  });

  it("reserves permission-smoke from runtime image paths", () => {
    expect(runtimeImagePathIsAllowed("bazoria-web", artifactCatalog)).toBe(true);
    expect(runtimeImagePathIsAllowed("permission-smoke", artifactCatalog)).toBe(false);
    expect(runtimeImagePathIsAllowed("permission-smoke/nested", artifactCatalog)).toBe(false);
  });

  it("rejects another writer identity", () => {
    const invalidCatalog = structuredClone(artifactCatalog);
    invalidCatalog.repository.writerServiceAccountKeys.push("web");

    expect(() => validateArtifactCatalog(invalidCatalog, identityCatalog)).toThrow(
      "repository contract differs",
    );
  });
});
