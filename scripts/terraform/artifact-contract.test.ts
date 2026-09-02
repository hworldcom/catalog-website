import { describe, expect, it } from "vitest";

import {
  artifactPackageNameIsReviewed,
  artifactTagIsReviewed,
  buildArtifactCleanupContract,
  buildArtifactRepositoryInventory,
  normalizeArtifactCleanupPlan,
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

  it("defines exactly five dry-run cleanup policies for each environment", () => {
    const uat = buildArtifactCleanupContract({ environment: "uat", artifactCatalog });
    const production = buildArtifactCleanupContract({
      environment: "production",
      artifactCatalog,
    });

    expect(uat.dryRun).toBe(true);
    expect(uat.policies).toHaveLength(5);
    expect(production.dryRun).toBe(true);
    expect(production.policies).toHaveLength(5);
    expect(
      uat.policies.find((policy) => policy.id === "delete-bazoria-web-by-age")?.condition
        ?.olderThan,
    ).toBe("1209600s");
    expect(
      production.policies.find((policy) => policy.id === "delete-bazoria-web-by-age")?.condition
        ?.olderThan,
    ).toBe("2592000s");
    expect(
      uat.policies.find((policy) => policy.id === "keep-recent-bazoria-web")?.mostRecentVersions
        ?.keepCount,
    ).toBe(5);
  });

  it("normalizes provider cleanup blocks without weakening exact matching", () => {
    const expected = buildArtifactCleanupContract({ environment: "uat", artifactCatalog });
    const providerShape = {
      cleanup_policy_dry_run: expected.dryRun,
      cleanup_policies: expected.policies.map((policy) => ({
        action: policy.action,
        condition:
          policy.condition === null
            ? []
            : [
                {
                  newer_than: policy.condition.newerThan,
                  older_than: policy.condition.olderThan,
                  package_name_prefixes: policy.condition.packageNamePrefixes,
                  tag_prefixes: policy.condition.tagPrefixes,
                  tag_state: policy.condition.tagState,
                  version_name_prefixes: policy.condition.versionNamePrefixes,
                },
              ],
        id: policy.id,
        most_recent_versions:
          policy.mostRecentVersions === null
            ? []
            : [
                {
                  keep_count: policy.mostRecentVersions.keepCount,
                  package_name_prefixes: policy.mostRecentVersions.packageNamePrefixes,
                },
              ],
      })),
    };

    expect(normalizeArtifactCleanupPlan(providerShape)).toEqual(expected);
  });

  it("rejects reserved package and tag-prefix collisions", () => {
    const commit = "a".repeat(40);
    expect(artifactPackageNameIsReviewed("bazoria-web", artifactCatalog)).toBe(true);
    expect(artifactPackageNameIsReviewed("bazoria-web-debug", artifactCatalog)).toBe(false);
    expect(artifactPackageNameIsReviewed("permission-smoke-old", artifactCatalog)).toBe(false);
    expect(
      artifactTagIsReviewed({
        environment: "uat",
        packageName: "bazoria-web",
        tag: `release-${commit}`,
        artifactCatalog,
      }),
    ).toBe(true);
    expect(
      artifactTagIsReviewed({
        environment: "uat",
        packageName: "bazoria-web",
        tag: "deployed-production",
        artifactCatalog,
      }),
    ).toBe(false);
    expect(
      artifactTagIsReviewed({
        environment: "production",
        packageName: "bazoria-web",
        tag: `promotion-eligible-${commit}`,
        artifactCatalog,
      }),
    ).toBe(false);
    expect(
      artifactTagIsReviewed({
        environment: "uat",
        packageName: "permission-smoke",
        tag: "latest-old",
        artifactCatalog,
      }),
    ).toBe(false);
  });

  it("rejects another writer identity", () => {
    const invalidCatalog = structuredClone(artifactCatalog);
    invalidCatalog.repository.writerServiceAccountKeys.push("web");

    expect(() => validateArtifactCatalog(invalidCatalog, identityCatalog)).toThrow(
      "repository contract differs",
    );
  });
});
