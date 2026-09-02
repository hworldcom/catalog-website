import { describe, expect, it } from "vitest";

import {
  buildIdentityAccessMatrix,
  validateIdentityCatalog,
  validateIdentityContract,
} from "./identity-contract.mjs";

import artifactCatalog from "../../infrastructure/google-cloud/artifact-catalog.json";
import catalog from "../../infrastructure/google-cloud/identity-catalog.json";
import administratorAccess from "../../infrastructure/google-cloud/inventory/reviewed-administrator-access.json";
import reviewed from "../../infrastructure/google-cloud/inventory/reviewed-environments.json";
import secretCatalog from "../../infrastructure/google-cloud/secret-catalog.json";

describe("Terraform identity contract", () => {
  it("validates the checked-in identity foundation", () => {
    expect(validateIdentityContract()).toEqual({
      bindings: 30,
      environments: ["uat", "production"],
    });
  });

  it("keeps all service accounts and providers environment-isolated", () => {
    const matrix = buildIdentityAccessMatrix({
      reviewed,
      catalog,
      artifactCatalog,
      secretCatalog,
      administratorAccess,
    });

    expect(matrix.environments.uat.serviceAccounts.terraform.email).not.toBe(
      matrix.environments.production.serviceAccounts.terraform.email,
    );
    expect(matrix.environments.uat.federation.pool).not.toBe(
      matrix.environments.production.federation.pool,
    );
    expect(matrix.environments.uat.secretContainers).not.toEqual(
      matrix.environments.production.secretContainers,
    );
    expect(matrix.environments.uat.artifactRepository.repositoryPath).not.toBe(
      matrix.environments.production.artifactRepository.repositoryPath,
    );
    expect(matrix.environments.uat.artifactRepository.inheritedCloudRunServiceAgent).toEqual({
      principal:
        "serviceAccount:service-145571383840@serverless-robot-prod.iam.gserviceaccount.com",
      role: "roles/run.serviceAgent",
      scope: "projects/bazoria-uat-lnlabs",
    });
  });

  it("rejects a secret-version permission", () => {
    const invalidCatalog = structuredClone(catalog);
    invalidCatalog.customRoles.secretContainerAdmin.permissions.push(
      "secretmanager.versions.access",
    );

    expect(() => validateIdentityCatalog(invalidCatalog)).toThrow(
      "custom role secretContainerAdmin permissions differ",
    );
  });
});
