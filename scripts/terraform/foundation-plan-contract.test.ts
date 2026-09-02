import { describe, expect, it } from "vitest";

import { validateFoundationPlan } from "./foundation-plan-contract.mjs";

const inventory = {
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
  },
};

const identityCatalog = {
  serviceAccounts: {
    terraform: { suffix: "terraform" },
    web: { suffix: "web" },
  },
  terraformProjectRoles: ["roles/browser"],
  customRoles: {
    secretContainerAdmin: { roleId: "BazoriaSecretContainerAdmin", permissions: [] },
  },
  github: { providers: {} },
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
        identityCatalog,
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
        identityCatalog,
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
        identityCatalog,
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
        identityCatalog,
      }),
    ).toThrow("secret-shaped value");
  });

  it("accepts a reviewed Terraform identity role", () => {
    const plan = createPlan();
    plan.resource_changes = [
      {
        address:
          'module.identity_foundation.google_project_iam_member.terraform_predefined["roles/browser"]',
        type: "google_project_iam_member",
        change: {
          actions: ["create"],
          after: {
            project: "bazoria-uat-lnlabs",
            role: "roles/browser",
            member: "serviceAccount:baz-uat-terraform@bazoria-uat-lnlabs.iam.gserviceaccount.com",
          },
        },
      },
    ];

    expect(
      validateFoundationPlan({
        plan,
        environment: "uat",
        root: "bootstrap",
        inventory,
        serviceCatalog,
        identityCatalog,
      }),
    ).toEqual({ changes: 1, environment: "uat", root: "bootstrap" });
  });

  it("rejects an unreviewed Terraform identity role", () => {
    const plan = createPlan();
    plan.resource_changes = [
      {
        address:
          'module.identity_foundation.google_project_iam_member.terraform_predefined["roles/owner"]',
        type: "google_project_iam_member",
        change: {
          actions: ["create"],
          after: {
            project: "bazoria-uat-lnlabs",
            role: "roles/owner",
            member: "serviceAccount:baz-uat-terraform@bazoria-uat-lnlabs.iam.gserviceaccount.com",
          },
        },
      },
    ];

    expect(() =>
      validateFoundationPlan({
        plan,
        environment: "uat",
        root: "bootstrap",
        inventory,
        serviceCatalog,
        identityCatalog,
      }),
    ).toThrow("unreviewed Terraform role");
  });

  it("accepts a reviewed custom role computed in the same plan", () => {
    const plan = createPlan();
    plan.resource_changes = [
      {
        address:
          'module.identity_foundation.google_project_iam_member.terraform_custom["secretContainerAdmin"]',
        index: "secretContainerAdmin",
        type: "google_project_iam_member",
        change: {
          actions: ["create"],
          after: {
            project: "bazoria-uat-lnlabs",
            member: "serviceAccount:baz-uat-terraform@bazoria-uat-lnlabs.iam.gserviceaccount.com",
          },
          after_unknown: { role: true },
        },
      },
    ];

    expect(
      validateFoundationPlan({
        plan,
        environment: "uat",
        root: "bootstrap",
        inventory,
        serviceCatalog,
        identityCatalog,
      }),
    ).toEqual({ changes: 1, environment: "uat", root: "bootstrap" });
  });

  it("rejects an unknown computed custom role key", () => {
    const plan = createPlan();
    plan.resource_changes = [
      {
        address:
          'module.identity_foundation.google_project_iam_member.terraform_custom["unreviewedRole"]',
        index: "unreviewedRole",
        type: "google_project_iam_member",
        change: {
          actions: ["create"],
          after: {
            project: "bazoria-uat-lnlabs",
            member: "serviceAccount:baz-uat-terraform@bazoria-uat-lnlabs.iam.gserviceaccount.com",
          },
          after_unknown: { role: true },
        },
      },
    ];

    expect(() =>
      validateFoundationPlan({
        plan,
        environment: "uat",
        root: "bootstrap",
        inventory,
        serviceCatalog,
        identityCatalog,
      }),
    ).toThrow("unknown custom role key");
  });
});
