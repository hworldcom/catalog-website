import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowDirectory = ".github/workflows";
const actionDirectory = ".github/actions";

function fail(message) {
  throw new Error(`github_actions_contract_invalid: ${message}`);
}

export function validateUsesReference(reference) {
  if (typeof reference !== "string" || !reference) fail("uses reference must be a string");
  if (reference.includes("${{")) fail(`expression-generated uses reference ${reference}`);
  if (reference.startsWith("./")) return { kind: "local", reference };
  if (reference.startsWith("docker://")) {
    if (!/^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/u.test(reference)) {
      fail(`docker reference is not pinned by digest: ${reference}`);
    }
    return { kind: "docker", reference };
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.\/-]+)?@[0-9a-f]{40}$/u.test(reference)) {
    fail(`remote action is not pinned to a full commit: ${reference}`);
  }
  return { kind: "remote", reference };
}

export function extractUsesReferences(source, path = "workflow.yml") {
  const document = parseDocument(source, { prettyErrors: false });
  if (document.errors.length > 0) fail(`${path} is not valid YAML`);
  const references = [];

  function visit(value) {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "uses") references.push(child);
      visit(child);
    }
  }

  visit(document.toJS());
  return references;
}

export function listGitHubActionSources(root = repositoryRoot) {
  const workflowRoot = join(root, workflowDirectory);
  const sources = existsSync(workflowRoot)
    ? readdirSync(workflowRoot)
        .filter((name) => /\.ya?ml$/u.test(name))
        .map((name) => join(workflowDirectory, name))
    : [];
  const localActionRoot = join(root, actionDirectory);
  if (existsSync(localActionRoot)) {
    for (const path of listFiles(localActionRoot, root)) {
      if (/(?:^|\/)action\.ya?ml$/u.test(path)) sources.push(path);
    }
  }
  return sources.sort();
}

export function validateGitHubActions(root = repositoryRoot) {
  const sources = listGitHubActionSources(root);
  const references = [];
  for (const path of sources) {
    for (const rawReference of extractUsesReferences(
      readFileSync(join(root, path), "utf8"),
      path,
    )) {
      const result = validateUsesReference(rawReference);
      if (result.kind === "local" && !existsSync(join(root, result.reference))) {
        fail(`${path} references missing local action ${result.reference}`);
      }
      references.push({ path, ...result });
    }
  }
  return { sources: sources.length, references: references.length };
}

function listFiles(directory, root) {
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...listFiles(path, root));
    else if (entry.isFile()) paths.push(path.slice(root.length + 1));
  }
  return paths;
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const result = validateGitHubActions();
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "github_actions_contract_failed"}\n`,
    );
    process.exitCode = 1;
  }
}
