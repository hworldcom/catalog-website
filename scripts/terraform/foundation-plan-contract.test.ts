import { describe, expect, it } from "vitest";

import { validateFoundationPlan } from "./foundation-plan-contract.mjs";

const inventory = {
  environments: {
    uat: {
      projectId: "bazoria-uat-lnlabs",
      projectNumber: "145571383840",
      organizationId: "33779488200",
      billingAccountId: "014CA9-692646-D9E4CE",
      region: "europe-west3",
      stateBucket: "bazoria-uat-lnlabs-tfstate",
      bootstrapOperatorPrincipal: "user:hoang@lnlabs.xyz",
    },
  },
};

const serviceCatalog = {
  bootstrap: ["storage.googleapis.com"],
  platform: ["run.googleapis.com"],
};

function createPlan() {
  return {
    terraform_version: "1.15.9",
    resource_changes: [
      {
        address:
          'module.bootstrap_services.google_project_service.enabled["storage.googleapis.com"]',
        change: {
          actions: ["create"],
          after: { project: "bazoria-uat-lnlabs", service: "storage.googleapis.com" },
        },
      },
    ],
  };
}

describe("Terraform foundation plan contract", () => {
  it("accepts an isolated non-destructive plan", () => {
    expect(
      validateFoundationPlan({
        plan: createPlan(),
        environment: "uat",
        root: "bootstrap",
        inventory,
        serviceCatalog,
      }),
    ).toEqual({ changes: 1, environment: "uat", root: "bootstrap" });
  });

  it("rejects a cross-environment project", () => {
    const plan = createPlan();
    plan.resource_changes[0].change.after.project = "bazoria-prod-lnlabs";

    expect(() =>
      validateFoundationPlan({
        plan,
        environment: "uat",
        root: "bootstrap",
        inventory,
        serviceCatalog,
      }),
    ).toThrow("targets another project");
  });

  it("rejects a destructive action", () => {
    const plan = createPlan();
    plan.resource_changes[0].change.actions = ["delete"];

    expect(() =>
      validateFoundationPlan({
        plan,
        environment: "uat",
        root: "bootstrap",
        inventory,
        serviceCatalog,
      }),
    ).toThrow("would delete a resource");
  });

  it("rejects a secret-shaped value", () => {
    const plan = createPlan();
    plan.resource_changes[0].change.after.value = "sk-example-secret-value";

    expect(() =>
      validateFoundationPlan({
        plan,
        environment: "uat",
        root: "bootstrap",
        inventory,
        serviceCatalog,
      }),
    ).toThrow("secret-shaped value");
  });
});
