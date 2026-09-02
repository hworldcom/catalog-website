import { describe, expect, it } from "vitest";

import {
  anonymousAccessIsAllowed,
  validateEnvironmentIsolation,
  validateFoundationContract,
} from "./foundation-contract.mjs";

const validInventory = {
  schemaVersion: 1,
  terraformVersion: "1.15.9",
  googleProviderConstraint: "~> 7.46.0",
  environments: {
    uat: {
      projectId: "bazoria-uat-lnlabs",
      projectNumber: "145571383840",
      organizationId: "33779488200",
      billingAccountId: "014CA9-692646-D9E4CE",
      githubOwner: "hworldcom",
      githubOwnerId: "144285964",
      githubRepository: "hworldcom/catalog-website",
      githubRepositoryId: "1313750742",
      region: "europe-west3",
      stateBucket: "bazoria-uat-lnlabs-tfstate",
      bootstrapOperatorPrincipal: "user:hoang@lnlabs.xyz",
    },
    production: {
      projectId: "bazoria-prod-lnlabs",
      projectNumber: "787649115343",
      organizationId: "33779488200",
      billingAccountId: "014CA9-692646-D9E4CE",
      githubOwner: "hworldcom",
      githubOwnerId: "144285964",
      githubRepository: "hworldcom/catalog-website",
      githubRepositoryId: "1313750742",
      region: "europe-west3",
      stateBucket: "bazoria-prod-lnlabs-tfstate",
      bootstrapOperatorPrincipal: "user:hoang@lnlabs.xyz",
    },
  },
};

describe("Terraform foundation contract", () => {
  it("validates the checked-in foundation", () => {
    expect(validateFoundationContract()).toEqual({
      environments: ["uat", "production"],
      googleProviderConstraint: "~> 7.46.0",
      terraformVersion: "1.15.9",
    });
  });

  it("rejects a shared project", () => {
    const inventory = structuredClone(validInventory);
    inventory.environments.production.projectId = inventory.environments.uat.projectId;
    inventory.environments.production.stateBucket = inventory.environments.uat.stateBucket;

    expect(() => validateEnvironmentIsolation(inventory)).toThrow(
      "project identifiers must differ",
    );
  });

  it("rejects the legacy classifier project", () => {
    const inventory = structuredClone(validInventory);
    inventory.environments.uat.projectId = "catalog-classifier";
    inventory.environments.uat.stateBucket = "catalog-classifier-tfstate";

    expect(() => validateEnvironmentIsolation(inventory)).toThrow("uat uses the legacy project");
  });

  it("rejects a region outside Frankfurt", () => {
    const inventory = structuredClone(validInventory);
    inventory.environments.production.region = "europe-west1";

    expect(() => validateEnvironmentIsolation(inventory)).toThrow(
      "production must use europe-west3",
    );
  });

  it("allows one anonymous invoker only in the public website runtime module", () => {
    const runtimeModule = "infrastructure/google-cloud/modules/runtime-activation-platform/main.tf";

    expect(anonymousAccessIsAllowed(runtimeModule, 'member = "allUsers"')).toBe(true);
    expect(
      anonymousAccessIsAllowed(runtimeModule, 'member = "allUsers"\nmember = "allUsers"'),
    ).toBe(false);
    expect(
      anonymousAccessIsAllowed(
        "infrastructure/google-cloud/modules/other/main.tf",
        'member = "allUsers"',
      ),
    ).toBe(false);
  });
});
