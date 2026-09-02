import { describe, expect, it } from "vitest";

import {
  buildIdentityAccessMatrix,
  validateIdentityCatalog,
  validateIdentityContract,
} from "./identity-contract.mjs";

import catalog from "../../infrastructure/google-cloud/identity-catalog.json";
import administratorAccess from "../../infrastructure/google-cloud/inventory/reviewed-administrator-access.json";
import reviewed from "../../infrastructure/google-cloud/inventory/reviewed-environments.json";
import secretCatalog from "../../infrastructure/google-cloud/secret-catalog.json";

describe("Terraform identity contract", () => {
  it("validates the checked-in identity foundation", () => {
    expect(validateIdentityContract()).toEqual({
      bindings: 24,
      environments: ["uat", "production"],
    });
  });

  it("keeps all service accounts and providers environment-isolated", () => {
    const matrix = buildIdentityAccessMatrix({
      reviewed,
      catalog,
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
