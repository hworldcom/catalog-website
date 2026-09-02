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
  github: {
    providers: {
      terraform: {
        providerId: "terraform-main",
        deploymentRole: "terraform",
        workflowFile: "terraform-environment.yml",
      },
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

  it("accepts Google's normalized state-bucket identifier", () => {
    const plan = createPlan();
    plan.resource_changes = [
      {
        address:
          'module.state_bucket.google_storage_bucket_iam_member.terraform_identity["roles/storage.bucketViewer"]',
        change: {
          actions: ["no-op"],
          after: {
            bucket: "b/bazoria-uat-lnlabs-tfstate",
            role: "roles/storage.bucketViewer",
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

  it("accepts the repository immutable subject", () => {
    const plan = createPlan();
    plan.resource_changes = [
      {
        address:
          'module.identity_foundation.google_iam_workload_identity_pool_provider.github["terraform"]',
        type: "google_iam_workload_identity_pool_provider",
        change: {
          actions: ["create"],
          after: {
            project: "bazoria-uat-lnlabs",
            workload_identity_pool_provider_id: "terraform-main",
            attribute_condition:
              "assertion.repository == 'hworldcom/catalog-website' && assertion.repository_id == '1313750742' && assertion.repository_owner == 'hworldcom' && assertion.repository_owner_id == '144285964' && assertion.environment == 'uat' && assertion.sub == 'repo:hworldcom@144285964/catalog-website@1313750742:environment:uat' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'hworldcom/catalog-website/.github/workflows/terraform-environment.yml@refs/heads/main'",
            attribute_mapping: {
              "attribute.deployment_role": "'terraform'",
            },
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

  it("rejects the legacy name-only subject", () => {
    const plan = createPlan();
    plan.resource_changes = [
      {
        address:
          'module.identity_foundation.google_iam_workload_identity_pool_provider.github["terraform"]',
        type: "google_iam_workload_identity_pool_provider",
        change: {
          actions: ["create"],
          after: {
            project: "bazoria-uat-lnlabs",
            workload_identity_pool_provider_id: "terraform-main",
            attribute_condition:
              "assertion.repository == 'hworldcom/catalog-website' && assertion.repository_id == '1313750742' && assertion.repository_owner == 'hworldcom' && assertion.repository_owner_id == '144285964' && assertion.environment == 'uat' && assertion.sub == 'repo:hworldcom/catalog-website:environment:uat' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'hworldcom/catalog-website/.github/workflows/terraform-environment.yml@refs/heads/main'",
            attribute_mapping: {
              "attribute.deployment_role": "'terraform'",
            },
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
    ).toThrow(
      "condition omits repo:hworldcom@144285964/catalog-website@1313750742:environment:uat",
    );
  });

  it("accepts an in-place migration to the repository immutable subject", () => {
    const plan = createPlan();
    const sharedProvider = {
      project: "bazoria-uat-lnlabs",
      workload_identity_pool_provider_id: "terraform-main",
      attribute_mapping: {
        "attribute.deployment_role": "'terraform'",
      },
    };
    plan.resource_changes = [
      {
        address:
          'module.identity_foundation.google_iam_workload_identity_pool_provider.github["terraform"]',
        type: "google_iam_workload_identity_pool_provider",
        change: {
          actions: ["update"],
          before: {
            ...sharedProvider,
            attribute_condition:
              "assertion.repository == 'hworldcom/catalog-website' && assertion.repository_id == '1313750742' && assertion.repository_owner == 'hworldcom' && assertion.repository_owner_id == '144285964' && assertion.environment == 'uat' && assertion.sub == 'repo:hworldcom/catalog-website:environment:uat' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'hworldcom/catalog-website/.github/workflows/terraform-environment.yml@refs/heads/main'",
          },
          after: {
            ...sharedProvider,
            attribute_condition:
              "assertion.repository == 'hworldcom/catalog-website' && assertion.repository_id == '1313750742' && assertion.repository_owner == 'hworldcom' && assertion.repository_owner_id == '144285964' && assertion.environment == 'uat' && assertion.sub == 'repo:hworldcom@144285964/catalog-website@1313750742:environment:uat' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'hworldcom/catalog-website/.github/workflows/terraform-environment.yml@refs/heads/main'",
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

  it("rejects a provider update that changes more than the subject condition", () => {
    const plan = createPlan();
    plan.resource_changes = [
      {
        address:
          'module.identity_foundation.google_iam_workload_identity_pool_provider.github["terraform"]',
        type: "google_iam_workload_identity_pool_provider",
        change: {
          actions: ["update"],
          before: {
            project: "bazoria-uat-lnlabs",
            display_name: "Terraform",
            workload_identity_pool_provider_id: "terraform-main",
            attribute_condition:
              "assertion.sub == 'repo:hworldcom/catalog-website:environment:uat'",
          },
          after: {
            project: "bazoria-uat-lnlabs",
            display_name: "Changed Terraform provider",
            workload_identity_pool_provider_id: "terraform-main",
            attribute_condition:
              "assertion.sub == 'repo:hworldcom@144285964/catalog-website@1313750742:environment:uat'",
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
    ).toThrow("would perform an unreviewed update");
  });
});
