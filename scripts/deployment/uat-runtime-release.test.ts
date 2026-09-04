import { describe, expect, it } from "vitest";

import {
  fingerprint,
  migrationTarget,
  normalizedPlan,
  validatePlan,
} from "./uat-runtime-release.mjs";

const inputs = {
  commit: "a".repeat(40),
  digest: `sha256:${"b".repeat(64)}`,
};

describe("UAT runtime release plan fingerprint", () => {
  it("normalizes resource changes by address", () => {
    const first = {
      format_version: "1.2",
      resource_changes: [
        {
          address: 'module.runtime_activation_platform["enabled"].z_resource',
          change: { actions: ["create"] },
        },
        {
          address: 'module.runtime_activation_platform["enabled"].a_resource',
          change: { actions: ["update"] },
        },
      ],
    };
    const second = {
      ...first,
      resource_changes: [...first.resource_changes].reverse(),
    };

    expect(normalizedPlan(first, inputs)).toBe(normalizedPlan(second, inputs));
  });

  it("changes when the selected immutable release changes", () => {
    const plan = { format_version: "1.2", resource_changes: [] };

    expect(fingerprint(plan, inputs)).not.toBe(
      fingerprint(plan, { ...inputs, digest: `sha256:${"c".repeat(64)}` }),
    );
  });

  it("records the complete migration target from the selected commit", () => {
    const git = (command: string, args: string[]) => {
      if (command !== "git") throw new Error("unexpected command");
      if (args[0] === "ls-tree") {
        return "supabase/migrations/20260101000000_first.sql\nsupabase/migrations/20260102000000_second.sql\n";
      }
      return Buffer.from(args[1].includes("first") ? "first" : "second");
    };

    expect(migrationTarget(inputs.commit, git)).toMatchObject({
      head: "20260102000000",
      migrations: [
        { version: "20260101000000", checksum: expect.any(String) },
        { version: "20260102000000", checksum: expect.any(String) },
      ],
    });
  });

  it("rejects destructive or unrelated Terraform changes", () => {
    expect(() =>
      validatePlan({
        resource_changes: [
          {
            address:
              'module.runtime_activation_platform["enabled"].google_cloud_run_v2_service.website',
            change: { actions: ["delete", "create"] },
          },
        ],
      }),
    ).toThrow("uat_runtime_release_destructive_change");
    expect(() =>
      validatePlan({
        resource_changes: [
          { address: "module.budget.google_billing_budget.uat", change: { actions: ["create"] } },
        ],
      }),
    ).toThrow("uat_runtime_release_unreviewed_resource");
  });

  it("accepts the reviewed Artifact Registry repository change", () => {
    expect(() =>
      validatePlan({
        resource_changes: [
          {
            address:
              "module.artifact_registry_foundation.google_artifact_registry_repository.containers",
            change: { actions: ["update"] },
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts reviewed UAT Artifact Registry access changes", () => {
    expect(() =>
      validatePlan({
        resource_changes: [
          {
            address:
              'module.artifact_registry_foundation.google_artifact_registry_repository_iam_member.readers["serviceAccount:baz-uat-terraform@bazoria-uat-lnlabs.iam.gserviceaccount.com"]',
            change: { actions: ["create"] },
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts reviewed platform service activation", () => {
    expect(() =>
      validatePlan({
        resource_changes: [
          {
            address:
              'module.platform_services.google_project_service.enabled["artifactregistry.googleapis.com"]',
            change: { actions: ["create"] },
          },
        ],
      }),
    ).not.toThrow();
  });
});
