import { describe, expect, it } from "vitest";

import { buildArtifactCleanupPreview } from "./artifact-cleanup-preview.mjs";

import artifactCatalog from "../../infrastructure/google-cloud/artifact-catalog.json";
import reviewed from "../../infrastructure/google-cloud/inventory/reviewed-environments.json";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const packageRoot =
  "projects/bazoria-uat-lnlabs/locations/europe-west3/repositories/bazoria-uat-containers/packages";
const packageResource = (packageName: string) => `${packageRoot}/${packageName}`;
const versionResource = (packageName: string, value: string) =>
  `${packageResource(packageName)}/versions/${value}`;

function image(packageName: string, value: string, createTime: string, tags: string[] = []) {
  return {
    createTime,
    tags,
    version: versionResource(packageName, value),
  };
}

function validInput() {
  const commit = "1".repeat(40);
  const applicationImages = [
    image("bazoria-web", digest("1"), "2026-08-31T00:00:00Z", [
      `release-${commit}`,
      "deployed-uat",
      `promotion-eligible-${commit}`,
    ]),
    image("bazoria-web", digest("2"), "2026-08-30T00:00:00Z", [`release-${"2".repeat(40)}`]),
    image("bazoria-web", digest("3"), "2026-08-29T00:00:00Z", [`release-${"3".repeat(40)}`]),
    image("bazoria-web", digest("4"), "2026-08-28T00:00:00Z", [`release-${"4".repeat(40)}`]),
    image("bazoria-web", digest("5"), "2026-08-27T00:00:00Z", [`release-${"5".repeat(40)}`]),
    image("bazoria-web", digest("6"), "2026-07-01T00:00:00Z", [`release-${"6".repeat(40)}`]),
  ];
  const smokeImages = [
    image("permission-smoke", digest("a"), "2026-08-31T00:00:00Z", ["latest"]),
    image("permission-smoke", digest("b"), "2026-07-01T00:00:00Z"),
  ];
  return {
    environment: "uat" as const,
    reviewedEnvironment: reviewed.environments.uat,
    artifactCatalog,
    packageEntries: [
      { name: packageResource("bazoria-web") },
      { name: packageResource("permission-smoke") },
    ],
    applicationImages,
    smokeImages,
    logEntries: [
      {
        timestamp: "2026-09-02T00:00:00Z",
        protoPayload: {
          methodName: "google.devtools.artifactregistry.v1.ArtifactRegistry.BatchDeleteVersions",
          serviceName: "artifactregistry.googleapis.com",
          request: {
            names: [
              versionResource("bazoria-web", digest("6")),
              versionResource("permission-smoke", digest("b")),
            ],
            parent: `${packageRoot}/-`,
            validateOnly: true,
          },
        },
      },
    ],
  };
}

describe("Artifact Registry cleanup preview", () => {
  it("summarizes eligible candidates without full digests", () => {
    const summary = buildArtifactCleanupPreview(validInput());
    const serialized = JSON.stringify(summary);

    expect(summary).toMatchObject({
      candidateCount: 2,
      countsByPackage: { "bazoria-web": 1, "permission-smoke": 1 },
      environment: "uat",
      protectedTagChecks: "passed",
      reservedPrefixCollisionChecks: "passed",
      status: "passed",
    });
    expect(serialized).not.toContain(digest("6"));
    expect(serialized).not.toContain(digest("b"));
  });

  it("rejects a protected or five-most-recent candidate", () => {
    const input = validInput();
    input.logEntries[0].protoPayload.request.names = [versionResource("bazoria-web", digest("1"))];

    expect(() => buildArtifactCleanupPreview(input)).toThrow(
      "protected artifact is a cleanup candidate",
    );
  });

  it("rejects a package prefix collision", () => {
    const input = validInput();
    input.packageEntries.push({ name: packageResource("bazoria-web-debug") });

    expect(() => buildArtifactCleanupPreview(input)).toThrow("reserved package prefix collision");
  });

  it("treats an empty dry-run query as inconclusive", () => {
    const input = validInput();
    input.logEntries = [];

    expect(() => buildArtifactCleanupPreview(input)).toThrow("dry-run preview is inconclusive");
  });
});
