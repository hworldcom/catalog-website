import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const releaseContractPath = join(repositoryRoot, "deployment/release-artifact.json");
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const checksumPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export function failReleaseArtifact(message) {
  throw new Error(`release_artifact_contract_invalid: ${message}`);
}

export function readReleaseArtifactContract() {
  return JSON.parse(readFileSync(releaseContractPath, "utf8"));
}

export function validateReleaseArtifactContract(contract = readReleaseArtifactContract()) {
  if (contract.schemaVersion !== 1) failReleaseArtifact("schema version differs");
  if (contract.workflowPath !== ".github/workflows/artifact-release.yml") {
    failReleaseArtifact("workflow path differs");
  }
  if (contract.environment !== "uat") failReleaseArtifact("release environment differs");
  if (contract.image.platform !== "linux/amd64") failReleaseArtifact("image platform differs");
  if (
    contract.image.repository !==
    "europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/bazoria-uat-containers/bazoria-web"
  ) {
    failReleaseArtifact("UAT image repository differs");
  }
  if (
    contract.image.productionRepository !==
    "europe-west3-docker.pkg.dev/bazoria-prod-lnlabs/bazoria-prod-containers/bazoria-web"
  ) {
    failReleaseArtifact("production image repository differs");
  }
  if (contract.image.tagPrefix !== "release-") failReleaseArtifact("release tag prefix differs");
  if (
    contract.buildx.setupAction !==
      "docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f" ||
    contract.buildx.version !== "v0.34.1"
  ) {
    failReleaseArtifact("Buildx contract differs");
  }
  validateTool(contract.tools.syft, {
    archive: "syft_1.50.0_linux_amd64.tar.gz",
    checksum: "bf7b29ff57f06da30918266a0e1c2885a8f99784798d1bdb1628886aa015d788",
    repository: "anchore/syft",
    version: "1.50.0",
  });
  validateTool(contract.tools.grype, {
    archive: "grype_0.116.1_linux_amd64.tar.gz",
    checksum: "0122df7b655981abe547ad3d2190d65551dac6a2bfc80b4dc2a989b5d0587458",
    repository: "anchore/grype",
    version: "0.116.1",
  });
  if (
    contract.vulnerabilities.exceptionCatalog !== "deployment/vulnerability-exceptions.json" ||
    contract.vulnerabilities.maximumReportBytes !== 20 * 1024 * 1024 ||
    contract.vulnerabilities.blockingSeverity !== "Critical"
  ) {
    failReleaseArtifact("vulnerability policy differs");
  }
  if (
    contract.handoff.artifactPrefix !== "uat-release-" ||
    contract.handoff.retentionDays !== 7 ||
    contract.handoff.maximumSoftwareBillOfMaterialsBytes !== 20 * 1024 * 1024 ||
    contract.handoff.maximumArtifactBytes !== 50 * 1024 * 1024
  ) {
    failReleaseArtifact("handoff policy differs");
  }
  return contract;
}

function validateTool(actual, expected) {
  if (
    !actual ||
    Object.entries(expected).some(([name, value]) => actual[name] !== value) ||
    Object.keys(actual).length !== Object.keys(expected).length
  ) {
    failReleaseArtifact(`${expected.repository} tool contract differs`);
  }
}

export function validateDispatchInput({ operation, environment, gitCommit }) {
  if (!new Set(["verify-identity", "publish"]).has(operation)) {
    failReleaseArtifact("operation must be verify-identity or publish");
  }
  if (!new Set(["uat", "production"]).has(environment)) {
    failReleaseArtifact("environment must be uat or production");
  }
  if (operation === "verify-identity") {
    if (gitCommit) failReleaseArtifact("identity verification must not receive git_commit");
    return { environment, gitCommit: null, operation };
  }
  if (environment !== "uat") failReleaseArtifact("publication is limited to UAT");
  if (!commitPattern.test(gitCommit ?? "")) {
    failReleaseArtifact("git_commit must be an exact lowercase commit");
  }
  return { environment, gitCommit, operation };
}

export function buildReleaseCoordinates(
  gitCommit,
  buildId,
  contract = readReleaseArtifactContract(),
) {
  if (!commitPattern.test(gitCommit ?? "")) failReleaseArtifact("release commit is invalid");
  if (buildId !== `${contract.image.tagPrefix}${gitCommit}`) {
    failReleaseArtifact("build identifier is invalid");
  }
  const tag = `${contract.image.tagPrefix}${gitCommit}`;
  return {
    artifactName: `${contract.handoff.artifactPrefix}${gitCommit}`,
    buildId,
    imageReference: `${contract.image.repository}:${tag}`,
    tag,
  };
}

export function validateDigest(value, label = "image digest") {
  if (!digestPattern.test(value ?? "")) failReleaseArtifact(`${label} is invalid`);
  return value;
}

export function verifyBufferChecksum(contents, expected) {
  if (!checksumPattern.test(expected ?? "")) failReleaseArtifact("expected checksum is invalid");
  const actual = createHash("sha256").update(contents).digest("hex");
  if (actual !== expected) failReleaseArtifact("downloaded tool checksum does not match");
  return actual;
}

export function extractCriticalFindings(report) {
  if (!report || !Array.isArray(report.matches)) {
    failReleaseArtifact("Grype report does not contain matches");
  }
  const findings = new Map();
  for (const match of report.matches) {
    if (match?.vulnerability?.severity !== "Critical") continue;
    const finding = {
      id: match.vulnerability.id,
      package: match?.artifact?.name,
      installedVersion: match?.artifact?.version,
      packageType: match?.artifact?.type ?? "unknown",
    };
    if (
      !finding.id ||
      !finding.package ||
      !finding.installedVersion ||
      ![finding.id, finding.package, finding.installedVersion, finding.packageType].every(
        (value) => typeof value === "string",
      )
    ) {
      failReleaseArtifact("critical vulnerability finding is malformed");
    }
    const key = exceptionKey(finding);
    findings.set(key, finding);
  }
  return [...findings.values()].sort((left, right) =>
    exceptionKey(left).localeCompare(exceptionKey(right)),
  );
}

export function evaluateVulnerabilityReport({ report, exceptionCatalog, asOf }) {
  const findings = extractCriticalFindings(report);
  const exceptions = validateExceptionCatalog(exceptionCatalog, asOf);
  const findingKeys = new Set(findings.map(exceptionKey));
  const unused = exceptions.filter((entry) => !findingKeys.has(exceptionKey(entry)));
  if (unused.length > 0) failReleaseArtifact("vulnerability exception is unused");
  const exceptionKeys = new Set(exceptions.map(exceptionKey));
  const unexcepted = findings.filter((finding) => !exceptionKeys.has(exceptionKey(finding)));
  if (unexcepted.length > 0) {
    throw new Error(
      `release_artifact_critical_vulnerability: ${unexcepted.map(exceptionKey).join(",")}`,
    );
  }
  return {
    status: "passed",
    criticalFindingCount: findings.length,
    exceptedCriticalFindingCount: findings.length,
    findings,
  };
}

export function validateExceptionCatalog(catalog, asOf) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.exceptions)) {
    failReleaseArtifact("vulnerability exception catalog is malformed");
  }
  if (!validDate(asOf)) {
    failReleaseArtifact("vulnerability evaluation date is invalid");
  }
  const keys = new Set();
  for (const entry of catalog.exceptions) {
    if (
      !entry ||
      !nonEmpty(entry.id) ||
      !nonEmpty(entry.package) ||
      !nonEmpty(entry.installedVersion) ||
      !nonEmpty(entry.justification) ||
      !nonEmpty(entry.owner) ||
      !validDate(entry.removalDate)
    ) {
      failReleaseArtifact("vulnerability exception entry is malformed");
    }
    if (entry.removalDate < asOf) failReleaseArtifact("vulnerability exception is expired");
    const key = exceptionKey(entry);
    if (keys.has(key)) failReleaseArtifact("vulnerability exception is duplicated");
    keys.add(key);
  }
  return catalog.exceptions;
}

function validDate(value) {
  if (!datePattern.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function exceptionKey(value) {
  return `${value.id}|${value.package}|${value.installedVersion}`;
}

export function createReleaseHandoff(values, contract = readReleaseArtifactContract()) {
  if (!commitPattern.test(values.commit ?? "")) failReleaseArtifact("handoff commit is invalid");
  validateDigest(values.digest, "handoff digest");
  const coordinates = buildReleaseCoordinates(values.commit, values.buildId, contract);
  if (values.imageReference !== coordinates.imageReference) {
    failReleaseArtifact("handoff image reference differs");
  }
  for (const [label, checksum] of Object.entries(values.checksums ?? {})) {
    if (!checksumPattern.test(checksum)) failReleaseArtifact(`${label} checksum is invalid`);
  }
  if (!nonEmpty(values.workflowRunId)) failReleaseArtifact("workflow run identifier is invalid");
  for (const [label, result] of Object.entries(values.results ?? {})) {
    if (result?.status !== "passed") failReleaseArtifact(`${label} result did not pass`);
  }
  return {
    schemaVersion: 1,
    commit: values.commit,
    digest: values.digest,
    immutableImageReference: `${contract.image.repository}@${values.digest}`,
    taggedImageReference: values.imageReference,
    buildId: values.buildId,
    workflowRunId: values.workflowRunId,
    checksums: values.checksums,
    results: values.results,
  };
}

export function validateWorkflowSource(source, contract = readReleaseArtifactContract()) {
  const document = parseDocument(source);
  if (document.errors.length > 0) failReleaseArtifact("artifact workflow YAML is invalid");
  const workflow = document.toJS();
  const inputs = workflow?.on?.workflow_dispatch?.inputs;
  if (
    JSON.stringify(inputs?.operation?.options) !== JSON.stringify(["verify-identity", "publish"]) ||
    JSON.stringify(inputs?.environment?.options) !== JSON.stringify(["uat", "production"]) ||
    inputs?.git_commit?.required !== false
  ) {
    failReleaseArtifact("artifact workflow dispatch interface differs");
  }
  const requiredSource = [
    "environment: ${{ inputs.environment }}",
    contract.buildx.setupAction,
    `version: ${contract.buildx.version}`,
    "npm run deployment:release-artifact:preflight",
    "npm run deployment:release-artifact:install-tools",
    "npm run deployment:release-artifact:vulnerabilities",
    "npm run deployment:release-artifact:handoff",
    "npm run deployment:gitleaks:scan-directory",
    "--expected-release-commit",
    "--skip-build",
    'build_config_digest="$(jq -er \'."containerimage.config.digest"\'',
    "docker buildx imagetools inspect --raw",
    'existing_config_digest}" != "${BUILD_CONFIG_DIGEST}',
    'remote_config_digest}" != "${BUILD_CONFIG_DIGEST}',
    'build_id="release-${release_commit}"',
    "SOURCE_DATE_EPOCH",
    `maximum_artifact_bytes=${contract.handoff.maximumArtifactBytes}`,
    "docker push",
    ":testIamPermissions",
    "retention-days: 7",
  ];
  if (source.includes('remote_digest}" != "${LOCAL_DIGEST}')) {
    failReleaseArtifact("artifact workflow compares incompatible manifest digests");
  }
  for (const required of requiredSource) {
    if (!source.includes(required)) failReleaseArtifact(`artifact workflow is missing ${required}`);
  }
  if (source.includes("secrets.")) failReleaseArtifact("artifact workflow reads a GitHub secret");
  return {
    operations: inputs.operation.options.length,
    retentionDays: contract.handoff.retentionDays,
  };
}

export function validateCheckedInReleaseArtifactContract() {
  const contract = validateReleaseArtifactContract();
  const exceptions = JSON.parse(
    readFileSync(join(repositoryRoot, contract.vulnerabilities.exceptionCatalog), "utf8"),
  );
  validateExceptionCatalog(exceptions, new Date().toISOString().slice(0, 10));
  const workflowSource = readFileSync(join(repositoryRoot, contract.workflowPath), "utf8");
  const workflow = validateWorkflowSource(workflowSource, contract);
  return { environment: contract.environment, tools: 2, ...workflow };
}

function assertTrustedCommit(gitCommit) {
  let resolved;
  try {
    resolved = execFileSync("git", ["rev-parse", "--verify", `${gitCommit}^{commit}`], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    failReleaseArtifact("git_commit is unavailable");
  }
  if (resolved !== gitCommit) failReleaseArtifact("git_commit resolution differs");
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", gitCommit, "origin/main"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } catch {
    failReleaseArtifact("git_commit is not reachable from origin/main");
  }
}

async function installReleaseTools(directory, contract = readReleaseArtifactContract()) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    failReleaseArtifact("release tools require Linux x64");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const [name, tool] of Object.entries(contract.tools)) {
    const url = `https://github.com/${tool.repository}/releases/download/v${tool.version}/${tool.archive}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) failReleaseArtifact(`${name} download returned HTTP ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    verifyBufferChecksum(archive, tool.checksum);
    const archivePath = join(directory, tool.archive);
    writeFileSync(archivePath, archive, { mode: 0o600 });
    execFileSync("tar", ["-xzf", archivePath, "-C", directory, name], { stdio: "ignore" });
    const executable = join(directory, name);
    chmodSync(executable, 0o700);
    const versionOutput = execFileSync(executable, ["version"], { encoding: "utf8" });
    if (!versionOutput.includes(tool.version)) failReleaseArtifact(`${name} version differs`);
  }
  return { directory, tools: Object.keys(contract.tools) };
}

function parseFlags(argv) {
  if (argv.length % 2 !== 0) failReleaseArtifact("command arguments must be name/value pairs");
  const flags = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name.startsWith("--") || value === undefined || Object.hasOwn(flags, name)) {
      failReleaseArtifact("command arguments are invalid");
    }
    flags[name] = value;
  }
  return flags;
}

function requireFlag(flags, name) {
  const value = flags[`--${name}`];
  if (!value) failReleaseArtifact(`--${name} is required`);
  return value;
}

function assertOnlyFlags(flags, allowed) {
  const names = new Set(allowed.map((name) => `--${name}`));
  const unexpected = Object.keys(flags).filter((name) => !names.has(name));
  if (unexpected.length > 0) failReleaseArtifact(`unexpected argument ${unexpected[0]}`);
}

function readBoundedJson(path, maximumBytes, label) {
  if (statSync(path).size > maximumBytes) failReleaseArtifact(`${label} exceeds size limit`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256BoundedFile(path, maximumBytes, label) {
  if (statSync(path).size > maximumBytes) failReleaseArtifact(`${label} exceeds size limit`);
  return sha256File(path);
}

async function runCommand(action, argv) {
  const contract = readReleaseArtifactContract();
  if (action === "check") return validateCheckedInReleaseArtifactContract();
  const flags = parseFlags(argv);
  if (action === "preflight") {
    assertOnlyFlags(flags, ["operation", "environment", "git-commit"]);
    const input = validateDispatchInput({
      operation: requireFlag(flags, "operation"),
      environment: requireFlag(flags, "environment"),
      gitCommit: flags["--git-commit"] ?? "",
    });
    if (input.operation === "publish") assertTrustedCommit(input.gitCommit);
    return input;
  }
  if (action === "install-tools") {
    assertOnlyFlags(flags, ["directory"]);
    return installReleaseTools(requireFlag(flags, "directory"), contract);
  }
  if (action === "vulnerabilities") {
    assertOnlyFlags(flags, ["report", "exceptions", "as-of", "output"]);
    const result = evaluateVulnerabilityReport({
      report: readBoundedJson(
        requireFlag(flags, "report"),
        contract.vulnerabilities.maximumReportBytes,
        "vulnerability report",
      ),
      exceptionCatalog: readBoundedJson(
        requireFlag(flags, "exceptions"),
        1024 * 1024,
        "vulnerability exception catalog",
      ),
      asOf: requireFlag(flags, "as-of"),
    });
    writeFileSync(requireFlag(flags, "output"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  if (action === "handoff") {
    assertOnlyFlags(flags, [
      "commit",
      "digest",
      "image-reference",
      "build-id",
      "workflow-run-id",
      "dockerfile",
      "lockfile",
      "sbom",
      "vulnerability-result",
      "container-result",
      "registry-result",
      "output",
    ]);
    const result = createReleaseHandoff(
      {
        commit: requireFlag(flags, "commit"),
        digest: requireFlag(flags, "digest"),
        imageReference: requireFlag(flags, "image-reference"),
        buildId: requireFlag(flags, "build-id"),
        workflowRunId: requireFlag(flags, "workflow-run-id"),
        checksums: {
          dockerfile: sha256File(requireFlag(flags, "dockerfile")),
          lockfile: sha256File(requireFlag(flags, "lockfile")),
          softwareBillOfMaterials: sha256BoundedFile(
            requireFlag(flags, "sbom"),
            contract.handoff.maximumSoftwareBillOfMaterialsBytes,
            "software bill of materials",
          ),
        },
        results: {
          vulnerabilities: readBoundedJson(
            requireFlag(flags, "vulnerability-result"),
            1024 * 1024,
            "vulnerability result",
          ),
          containerHealth: readBoundedJson(
            requireFlag(flags, "container-result"),
            1024 * 1024,
            "container result",
          ),
          registryVerification: readBoundedJson(
            requireFlag(flags, "registry-result"),
            1024 * 1024,
            "registry result",
          ),
        },
      },
      contract,
    );
    writeFileSync(requireFlag(flags, "output"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  failReleaseArtifact("expected check, preflight, install-tools, vulnerabilities, or handoff");
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const result = await runCommand(process.argv[2], process.argv.slice(3));
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "release_artifact_failed"}\n`);
    process.exitCode = 1;
  }
}
