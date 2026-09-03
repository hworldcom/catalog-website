import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = join(repositoryRoot, ".gitleaks.toml");
const zeroCommit = "0".repeat(40);
const commitPattern = /^[0-9a-f]{40}$/u;
const secretLikePatterns = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/u,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{12,}\b/u,
  /\bAIza[0-9A-Za-z_-]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/iu,
];

export const GITLEAKS_RELEASE = Object.freeze({
  version: "8.30.1",
  archive: "gitleaks_8.30.1_linux_x64.tar.gz",
  checksum: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
});

function fail(message) {
  throw new Error(`gitleaks_contract_invalid: ${message}`);
}

export function validateGitleaksConfiguration(source) {
  if (!/^\[extend\]\s*$/mu.test(source) || !/^useDefault\s*=\s*true\s*$/mu.test(source)) {
    fail("configuration must extend the default Gitleaks rules");
  }
  for (const pattern of secretLikePatterns) {
    if (pattern.test(source)) fail("allowlist configuration contains a secret-like value");
  }
  for (const match of source.matchAll(/^\s*'''([^']+)'''\s*,?\s*$/gmu)) {
    if (!match[1].endsWith("$") || match[1].includes(".*")) {
      fail("allowlisted paths must be exact anchored expressions");
    }
  }
  return { allowlists: [...source.matchAll(/^\[\[allowlists\]\]\s*$/gmu)].length };
}

export function resolveIntroducedCommitRange({ event, base, head }) {
  if (!commitPattern.test(head ?? "")) fail("head commit is invalid");
  if (event === "push" && base === zeroCommit) return null;
  if (!new Set(["pull_request", "push"]).has(event)) fail(`unsupported event ${event}`);
  if (!commitPattern.test(base ?? "")) fail("base commit is invalid");
  return `${base}..${head}`;
}

export function verifyArchiveChecksum(contents, expected = GITLEAKS_RELEASE.checksum) {
  const actual = createHash("sha256").update(contents).digest("hex");
  if (actual !== expected) fail("downloaded archive checksum does not match");
  return actual;
}

export async function runGitleaksScan(options) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    fail("the continuous integration scanner requires Linux x64");
  }
  if (!existsSync(configPath)) fail(".gitleaks.toml is missing");
  validateGitleaksConfiguration(readFileSync(configPath, "utf8"));
  const range = resolveIntroducedCommitRange(options);
  assertCommitAvailable(options.head);
  if (range) assertCommitAvailable(options.base);

  const directory = await mkdtemp(join(tmpdir(), "bazoria-gitleaks-"));
  try {
    const executable = await installGitleaks(directory);
    const tree = join(directory, "current-tree");
    mkdirSync(tree);
    const archivePath = join(directory, "current-tree.tar");
    writeFileSync(
      archivePath,
      execFileSync("git", ["archive", "--format=tar", "HEAD"], {
        cwd: repositoryRoot,
        maxBuffer: 100 * 1024 * 1024,
      }),
    );
    run("tar", ["-xf", archivePath, "-C", tree]);
    run(executable, scannerArguments("dir", tree));
    if (range) {
      run(executable, [...scannerArguments("git", repositoryRoot), `--log-opts=${range}`]);
    }
    return { range: range ?? "initial-history", version: GITLEAKS_RELEASE.version };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function installGitleaks(directory) {
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_RELEASE.version}/${GITLEAKS_RELEASE.archive}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) fail(`Gitleaks download returned HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  verifyArchiveChecksum(archive);
  const archivePath = join(directory, GITLEAKS_RELEASE.archive);
  writeFileSync(archivePath, archive, { mode: 0o600 });
  run("tar", ["-xzf", archivePath, "-C", directory, "gitleaks"]);
  const executable = join(directory, "gitleaks");
  chmodSync(executable, 0o700);
  return executable;
}

function scannerArguments(command, target) {
  return [
    command,
    target,
    "--config",
    configPath,
    "--redact=100",
    "--no-banner",
    "--no-color",
    "--timeout=120",
    "--exit-code=1",
  ];
}

function assertCommitAvailable(commit) {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } catch {
    fail(`commit ${commit} is unavailable`);
  }
}

function run(command, args) {
  execFileSync(command, args, { cwd: repositoryRoot, stdio: "inherit" });
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--event", "--base", "--head"]).has(name) || value === undefined) {
      fail("expected --event, --base, and --head arguments");
    }
    values[name.slice(2)] = value;
  }
  if (!values.event || values.base === undefined || !values.head) {
    fail("expected --event, --base, and --head arguments");
  }
  return values;
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const action = process.argv[2];
    if (action === "check") {
      const result = validateGitleaksConfiguration(readFileSync(configPath, "utf8"));
      process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
    } else if (action === "scan") {
      const result = await runGitleaksScan(parseArguments(process.argv.slice(3)));
      process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
    } else {
      fail("expected check or scan action");
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "gitleaks_contract_failed"}\n`,
    );
    process.exitCode = 1;
  }
}
