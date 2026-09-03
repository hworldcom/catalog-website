import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import catalog from "../../deployment/configuration-catalog.json";
import {
  discoverConfigurationOccurrences,
  discoverConfigurationOccurrencesFromSources,
  listTrackedConfigurationSources,
  validateConfigurationCatalog,
} from "./configuration-contract.mjs";

const repositoryRoot = process.cwd();
const newTrackedPaths = [
  "scripts/deployment/configuration-contract.mjs",
  "scripts/deployment/configuration-contract.test.ts",
  "scripts/deployment/browser-output-contract.mjs",
  "scripts/deployment/browser-output-contract.test.ts",
].filter((path) => existsSync(path));
const trackedFiles = [...new Set([...listTrackedConfigurationSources(), ...newTrackedPaths])];
const trackedSet = new Set([
  ...trackedFiles,
  "deployment/configuration-catalog.json",
  ...catalog.environmentVariables.flatMap((entry) => entry.validationSources),
  ...catalog.sourceConstants.flatMap((entry) => [entry.sourcePath, entry.validationSource]),
]);

function actualOccurrences() {
  return discoverConfigurationOccurrences(repositoryRoot, trackedFiles);
}

function validate(candidate: typeof catalog, occurrences = actualOccurrences()) {
  return validateConfigurationCatalog(candidate, {
    repositoryRoot,
    trackedFiles,
    trackedSet,
    occurrences,
  });
}

describe("deployment configuration contract", () => {
  it("validates the checked-in catalog and tracked configuration sources", () => {
    expect(validate(structuredClone(catalog))).toMatchObject({
      environmentVariables: catalog.environmentVariables.length,
      sourceConstants: catalog.sourceConstants.length,
    });
  });

  it("discovers direct, bracketed, and interpolated environment access", () => {
    const direct = ["BAZORIA", "DIRECT", "VALUE"].join("_");
    const bracketed = ["SUPABASE", "BRACKETED", "VALUE"].join("_");
    const interpolated = ["OPENAI", "INTERPOLATED", "VALUE"].join("_");
    const occurrences = discoverConfigurationOccurrencesFromSources([
      {
        path: "synthetic.ts",
        contents: `const first = process.env.${direct};\nconst second = process.env["${bracketed}"];\nconst third = \`\${process.env.${interpolated}}\`;`,
      },
    ]);

    expect([...occurrences.keys()].sort()).toEqual([bracketed, direct, interpolated].sort());
  });

  it("ignores names that appear only in source comments", () => {
    const commented = ["BAZORIA", "COMMENT", "ONLY"].join("_");
    const occurrences = discoverConfigurationOccurrencesFromSources([
      { path: "synthetic.ts", contents: `// process.env.${commented}\nexport const value = true;` },
      { path: "synthetic.tf", contents: `# ${commented} = "ignored"\nlocals { value = true }` },
    ]);

    expect(occurrences.has(commented)).toBe(false);
  });

  it("rejects unconstrained dynamic process environment access", () => {
    expect(() =>
      discoverConfigurationOccurrencesFromSources([
        {
          path: "synthetic.ts",
          contents: "export const read = (name: string) => process.env[name];",
        },
      ]),
    ).toThrow("dynamic process.env access");
  });

  it("accepts dynamic access with a complete literal permitted-name set", () => {
    const first = ["BAZORIA", "DYNAMIC", "FIRST"].join("_");
    const second = ["SUPABASE", "DYNAMIC", "SECOND"].join("_");
    const occurrences = discoverConfigurationOccurrencesFromSources([
      {
        path: "synthetic.ts",
        contents: `export const CONFIGURATION_AUDIT_ALLOWED_DYNAMIC_ENVIRONMENT_NAMES = ["${first}", "${second}"] as const;\nexport const read = (name: string) => process.env[name];`,
      },
    ]);

    expect([...occurrences.keys()].sort()).toEqual([first, second].sort());
  });

  it("rejects a newly introduced unclassified variable", () => {
    const unknown = ["BAZORIA", "UNCLASSIFIED", "VALUE"].join("_");
    const occurrences = actualOccurrences();
    occurrences.set(unknown, new Set(["src/lib/runtime-public-config.ts"]));

    expect(() => validate(structuredClone(catalog), occurrences)).toThrow(
      `unclassified environment variable ${unknown}`,
    );
  });

  it("rejects a variable occurrence outside its owned paths", () => {
    const serverSecret = catalog.environmentVariables.find(
      (entry) => entry.valueClass === "server_secret" && entry.status === "active",
    );
    expect(serverSecret).toBeDefined();
    const occurrences = actualOccurrences();
    occurrences.get(serverSecret!.name)?.add("src/components/browser-leak.tsx");

    expect(() => validate(structuredClone(catalog), occurrences)).toThrow(
      `${serverSecret!.name} is not permitted in src/components/browser-leak.tsx`,
    );
  });

  it("rejects duplicate catalog names", () => {
    const candidate = structuredClone(catalog);
    candidate.environmentVariables.push(structuredClone(candidate.environmentVariables[0]));

    expect(() => validate(candidate)).toThrow("duplicate environment variable");
  });

  it("rejects browser exposure for a server secret", () => {
    const candidate = structuredClone(catalog);
    const serverSecret = candidate.environmentVariables.find(
      (entry) => entry.valueClass === "server_secret" && entry.status === "active",
    );
    expect(serverSecret).toBeDefined();
    serverSecret!.exposure.browserAssets = "allowed";

    expect(() => validate(candidate)).toThrow("secret is allowed in browser assets");
  });

  it("requires positive decimal Secret Manager version variables", () => {
    const candidate = structuredClone(catalog);
    const version = candidate.environmentVariables.find(
      (entry) => entry.name === "BAZORIA_SUPABASE_SERVICE_ROLE_SECRET_VERSION",
    );
    expect(version).toBeDefined();
    delete version!.valueFormat;

    expect(() => validate(candidate)).toThrow("must use the positive_decimal valueFormat");
  });
});
