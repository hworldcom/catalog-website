import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { parseDocument } from "yaml";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = "deployment/configuration-catalog.json";
const runtimeTerraformPath =
  "infrastructure/google-cloud/modules/runtime-activation-platform/main.tf";
const runtimePublicConfigurationPath = "src/lib/runtime-public-config.ts";
const dynamicNameDeclaration = "CONFIGURATION_AUDIT_ALLOWED_DYNAMIC_ENVIRONMENT_NAMES";

const scopes = new Set([
  "application_runtime",
  "release_workflow",
  "fixture_workflow",
  "local_tool",
  "continuous_integration_tool",
  "platform_provided",
]);
const valueClasses = new Set([
  "browser_safe",
  "server_non_secret",
  "server_secret",
  "protected_github_variable",
  "protected_github_secret",
  "fixture_only_secret",
]);
const environments = new Set(["local", "continuous_integration", "uat", "production"]);
const roles = new Set([
  "website",
  "activation_worker",
  "reconciliation_job",
  "migration",
  "release",
  "uat_fixture",
  "local_classifier",
  "disabled_classifier",
  "infrastructure_observation",
  "continuous_integration",
  "platform",
]);
const presencePolicies = new Set(["required", "optional", "fixed"]);
const examplePolicies = new Set(["blank", "synthetic", "fixed", "omitted"]);
const statuses = new Set(["active", "reserved"]);
const valueFormats = new Set(["positive_decimal"]);
const browserPolicies = new Set(["allowed", "forbidden"]);
const valueExposurePolicies = new Set([
  "value_allowed",
  "name_only",
  "redacted",
  "sensitive",
  "not_applicable",
]);
const controlledNamePattern =
  /\b(?:(?:BAZORIA|SUPABASE|OPENAI|GOOGLE)_[A-Z0-9]+(?:_[A-Z0-9]+)*|NODE_ENV|HOST|PORT|K_REVISION|npm_config_package_lock_only)\b/gu;
const exactControlledNamePattern =
  /^(?:(?:BAZORIA|SUPABASE|OPENAI|GOOGLE)_[A-Z0-9]+(?:_[A-Z0-9]+)*|NODE_ENV|HOST|PORT|K_REVISION|npm_config_package_lock_only)$/u;

function fail(message) {
  throw new Error(`deployment_configuration_contract_invalid: ${message}`);
}

export function readConfigurationCatalog(root = repositoryRoot) {
  return JSON.parse(readFileSync(join(root, catalogPath), "utf8"));
}

export function listTrackedConfigurationSources(root = repositoryRoot) {
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  return files.filter(isConfigurationSourcePath);
}

export function isConfigurationSourcePath(path) {
  if (
    path === catalogPath ||
    path === "package-lock.json" ||
    path.startsWith("tickets/") ||
    path.includes("/.terraform/") ||
    path.endsWith(".tfstate")
  ) {
    return false;
  }
  return (
    path === "Dockerfile" ||
    path === ".env.example" ||
    path.endsWith(".env.example") ||
    [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sh", ".yaml", ".yml", ".tf", ".json"].includes(
      extname(path),
    )
  );
}

export function discoverConfigurationOccurrencesFromSources(sources) {
  const occurrences = new Map();
  for (const source of sources) {
    const names = extractNames(source.path, source.contents);
    for (const name of names) {
      const paths = occurrences.get(name) ?? new Set();
      paths.add(source.path);
      occurrences.set(name, paths);
    }
  }
  return occurrences;
}

export function discoverConfigurationOccurrences(root = repositoryRoot, trackedFiles) {
  const paths = trackedFiles ?? listTrackedConfigurationSources(root);
  return discoverConfigurationOccurrencesFromSources(
    paths.map((path) => ({ path, contents: readFileSync(join(root, path), "utf8") })),
  );
}

function extractNames(path, contents) {
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(path)) {
    return extractJavaScriptNames(path, contents);
  }
  if (/\.ya?ml$/u.test(path)) return extractYamlNames(path, contents);
  if (path === ".env.example" || path.endsWith(".env.example")) {
    return extractEnvironmentExampleNames(contents);
  }
  if (path === "Dockerfile") return extractTextNames(stripLineComments(contents, "#"));
  if (path.endsWith(".tf")) return extractTextNames(stripTerraformComments(contents));
  if (path.endsWith(".sh")) return extractTextNames(stripLineComments(contents, "#"));
  if (path.endsWith(".json")) return extractJsonNames(path, contents);
  return [];
}

function extractJavaScriptNames(path, contents) {
  const scriptKind = path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, scriptKind);
  const names = new Set();
  let hasDynamicProcessEnvironmentAccess = false;
  let allowedDynamicNames;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === dynamicNameDeclaration
    ) {
      allowedDynamicNames = readStringArrayInitializer(node.initializer, path);
    }

    if (ts.isPropertyAccessExpression(node) && exactControlledNamePattern.test(node.name.text)) {
      names.add(node.name.text);
    }

    if (ts.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      if (
        argument &&
        (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      ) {
        addTextNames(names, argument.text);
      } else if (isProcessEnvironmentExpression(node.expression)) {
        hasDynamicProcessEnvironmentAccess = true;
      }
    }

    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      addTextNames(names, node.text);
    }

    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const name = propertyNameText(node.name);
      if (name && exactControlledNamePattern.test(name)) names.add(name);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (hasDynamicProcessEnvironmentAccess) {
    if (!allowedDynamicNames || allowedDynamicNames.length === 0) {
      fail(`${path} uses dynamic process.env access without ${dynamicNameDeclaration}`);
    }
    for (const name of allowedDynamicNames) {
      if (!exactControlledNamePattern.test(name)) {
        fail(`${path} declares invalid dynamic environment name ${name}`);
      }
      names.add(name);
    }
  }
  return names;
}

function readStringArrayInitializer(initializer, path) {
  if (!initializer) fail(`${path} must initialize ${dynamicNameDeclaration}`);
  let value = initializer;
  if (ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression;
  if (!ts.isArrayLiteralExpression(value)) {
    fail(`${path} must declare ${dynamicNameDeclaration} as a literal string array`);
  }
  return value.elements.map((element) => {
    if (!ts.isStringLiteral(element) && !ts.isNoSubstitutionTemplateLiteral(element)) {
      fail(`${path} must declare only literal dynamic environment names`);
    }
    return element.text;
  });
}

function isProcessEnvironmentExpression(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      node.name.text === "env"
    );
  }
  if (!ts.isElementAccessExpression(node) || !ts.isIdentifier(node.expression)) return false;
  const argument = node.argumentExpression;
  return (
    node.expression.text === "process" &&
    Boolean(argument && ts.isStringLiteral(argument) && argument.text === "env")
  );
}

function propertyNameText(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))
    return node.text;
  return null;
}

function extractYamlNames(path, contents) {
  const document = parseDocument(contents, { prettyErrors: false });
  if (document.errors.length > 0) fail(`${path} is not valid YAML`);
  const names = new Set();
  walkYamlValue(document.toJS(), names);
  return names;
}

function walkYamlValue(value, names) {
  if (typeof value === "string") {
    addTextNames(names, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkYamlValue(item, names);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    addTextNames(names, key);
    walkYamlValue(child, names);
  }
}

function extractEnvironmentExampleNames(contents) {
  const names = new Set();
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/u);
    if (match && exactControlledNamePattern.test(match[1])) names.add(match[1]);
  }
  return names;
}

function extractJsonNames(path, contents) {
  const sourceFile = ts.parseJsonText(path, contents);
  if (sourceFile.parseDiagnostics.length > 0)
    fail(`${path} is not valid JSON or JSON with comments`);
  const names = new Set();
  function visit(node) {
    if (ts.isStringLiteral(node)) addTextNames(names, node.text);
    if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name);
      if (name) addTextNames(names, name);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function extractTextNames(contents) {
  const names = new Set();
  addTextNames(names, contents);
  return names;
}

function addTextNames(names, text) {
  for (const name of text.match(controlledNamePattern) ?? []) names.add(name);
}

function stripLineComments(contents, marker) {
  return contents
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith(marker))
    .join("\n");
}

function stripTerraformComments(contents) {
  return stripLineComments(contents.replace(/\/\*[\s\S]*?\*\//gu, ""), "#")
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

export function validateConfigurationCatalog(catalog, options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const trackedFiles = options.trackedFiles ?? listTrackedConfigurationSources(root);
  const trackedSet =
    options.trackedSet ??
    new Set(
      execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
        .split("\0")
        .filter(Boolean),
    );
  const discoveredOccurrences =
    options.occurrences ?? discoverConfigurationOccurrences(root, trackedFiles);
  const occurrences = new Map(
    [...discoveredOccurrences].map(([name, paths]) => [name, new Set(paths)]),
  );

  if (!catalog || catalog.schemaVersion !== 1) fail("catalog schemaVersion must be 1");
  if (!Array.isArray(catalog.environmentVariables) || !Array.isArray(catalog.sourceConstants)) {
    fail("catalog arrays are missing");
  }

  const environmentEntries = new Map();
  for (const entry of catalog.environmentVariables) {
    validateEnvironmentEntry(entry, root, trackedSet);
    if (environmentEntries.has(entry.name)) fail(`duplicate environment variable ${entry.name}`);
    environmentEntries.set(entry.name, entry);
  }

  const constantEntries = new Map();
  for (const entry of catalog.sourceConstants) {
    validateSourceConstantEntry(entry, root, trackedSet);
    if (constantEntries.has(entry.name) || environmentEntries.has(entry.name)) {
      fail(`duplicate configuration name ${entry.name}`);
    }
    constantEntries.set(entry.name, entry);
  }

  for (const constantName of constantEntries.keys()) occurrences.delete(constantName);

  for (const [name, paths] of occurrences) {
    const entry = environmentEntries.get(name);
    if (!entry) fail(`unclassified environment variable ${name}`);
    for (const path of paths) {
      if (!entry.permittedSourcePathPatterns.some((pattern) => pathMatches(pattern, path))) {
        fail(`${name} is not permitted in ${path}`);
      }
    }
  }

  for (const entry of environmentEntries.values()) {
    if (entry.status === "active" && !occurrences.has(entry.name)) {
      fail(`active environment variable ${entry.name} has no tracked occurrence`);
    }
  }

  validateSourceConstants(constantEntries, root);
  validateExamples(environmentEntries, root);
  validateRuntimeTerraformConsumers(environmentEntries, root);
  validateBrowserConfigurationContract(catalog, environmentEntries, root);

  return {
    environmentVariables: environmentEntries.size,
    sourceConstants: constantEntries.size,
    discoveredEnvironmentVariables: occurrences.size,
  };
}

function validateEnvironmentEntry(entry, root, trackedSet) {
  if (!entry || !exactControlledNamePattern.test(entry.name ?? ""))
    fail("invalid environment name");
  if (!scopes.has(entry.scope)) fail(`${entry.name} has invalid scope`);
  if (!valueClasses.has(entry.valueClass)) fail(`${entry.name} has invalid valueClass`);
  if (!statuses.has(entry.status)) fail(`${entry.name} has invalid status`);
  if (entry.valueFormat !== undefined && !valueFormats.has(entry.valueFormat)) {
    fail(`${entry.name} has invalid valueFormat`);
  }
  if (
    [
      "BAZORIA_SUPABASE_SERVICE_ROLE_SECRET_VERSION",
      "BAZORIA_OPENAI_API_KEY_SECRET_VERSION",
    ].includes(entry.name) &&
    entry.valueFormat !== "positive_decimal"
  ) {
    fail(`${entry.name} must use the positive_decimal valueFormat`);
  }
  if (entry.status === "reserved" && !/^\d{4}[a-z0-9-]*$/u.test(entry.ownerTicket ?? "")) {
    fail(`${entry.name} must name its owning future ticket`);
  }
  if (entry.status === "active" && entry.ownerTicket !== undefined) {
    fail(`${entry.name} cannot retain a reserved owner ticket`);
  }
  if (!Array.isArray(entry.consumers) || entry.consumers.length === 0) {
    fail(`${entry.name} has no consumers`);
  }
  for (const consumer of entry.consumers) {
    if (!roles.has(consumer.role)) fail(`${entry.name} has invalid role ${consumer.role}`);
    if (!Array.isArray(consumer.environments) || consumer.environments.length === 0) {
      fail(`${entry.name} consumer has no environments`);
    }
    for (const environment of consumer.environments) {
      if (!environments.has(environment))
        fail(`${entry.name} has invalid environment ${environment}`);
    }
    if (!presencePolicies.has(consumer.presence)) fail(`${entry.name} has invalid presence`);
    if (consumer.presence === "fixed" && typeof consumer.fixedValue !== "string") {
      fail(`${entry.name} fixed consumer has no fixedValue`);
    }
    if (consumer.presence !== "fixed" && consumer.fixedValue !== undefined) {
      fail(`${entry.name} non-fixed consumer has fixedValue`);
    }
  }
  if (!Array.isArray(entry.validationSources) || entry.validationSources.length === 0) {
    fail(`${entry.name} has no validationSources`);
  }
  if (
    !Array.isArray(entry.permittedSourcePathPatterns) ||
    entry.permittedSourcePathPatterns.length === 0
  ) {
    fail(`${entry.name} has no permitted source path patterns`);
  }
  if (entry.status === "active") {
    for (const path of entry.validationSources)
      assertTrackedPath(entry.name, path, root, trackedSet);
  }
  validateExposure(entry.name, entry.exposure);
  validateExamplePolicy(entry.name, entry.localExample);
}

function validateSourceConstantEntry(entry, root, trackedSet) {
  if (!entry || !/^[A-Z][A-Z0-9_]*$/u.test(entry.name ?? "")) fail("invalid source constant name");
  if (!roles.has(entry.owningRole)) fail(`${entry.name} has invalid owning role`);
  assertTrackedPath(entry.name, entry.sourcePath, root, trackedSet);
  assertTrackedPath(entry.name, entry.validationSource, root, trackedSet);
  validateExposure(entry.name, entry.exposure);
  if (!("expectedValue" in entry) && typeof entry.catalogField !== "string") {
    fail(`${entry.name} has no expected value or catalog field`);
  }
}

function assertTrackedPath(name, path, root, trackedSet) {
  if (typeof path !== "string" || !trackedSet.has(path) || !existsSync(join(root, path))) {
    fail(`${name} references missing or untracked source ${String(path)}`);
  }
}

function validateExposure(name, exposure) {
  if (!exposure || !browserPolicies.has(exposure.browserConfiguration)) {
    fail(`${name} has invalid browser configuration exposure`);
  }
  if (!browserPolicies.has(exposure.browserAssets))
    fail(`${name} has invalid browser asset exposure`);
  for (const key of ["logs", "terraformPlans", "releaseRecords"]) {
    if (!valueExposurePolicies.has(exposure[key])) fail(`${name} has invalid ${key} exposure`);
  }
  if (exposure.browserConfiguration === "allowed" && !exposure.browserConfigurationKey) {
    fail(`${name} has no public runtime configuration key`);
  }
  if (
    exposure.browserConfiguration === "forbidden" &&
    exposure.browserConfigurationKey !== undefined
  ) {
    fail(`${name} has a forbidden public runtime configuration key`);
  }
}

function validateExamplePolicy(name, localExample) {
  if (!localExample || !examplePolicies.has(localExample.policy)) {
    fail(`${name} has invalid local example policy`);
  }
  if (!Array.isArray(localExample.paths)) fail(`${name} has invalid local example paths`);
  if (localExample.policy === "fixed" && typeof localExample.fixedValue !== "string") {
    fail(`${name} fixed example has no fixedValue`);
  }
  if (localExample.policy !== "fixed" && localExample.fixedValue !== undefined) {
    fail(`${name} non-fixed example has fixedValue`);
  }
}

function validateExamples(entries, root) {
  const examplePaths = [
    ".env.example",
    "supabase/environments/uat.env.example",
    "supabase/environments/production.env.example",
  ];
  for (const path of examplePaths) {
    const seen = new Set();
    for (const line of readFileSync(join(root, path), "utf8").split(/\r?\n/u)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
      if (!match) continue;
      const [, name, value] = match;
      if (seen.has(name)) fail(`${path} repeats ${name}`);
      seen.add(name);
      const entry = entries.get(name);
      if (!entry) fail(`${path} contains unclassified ${name}`);
      if (!entry.localExample.paths.includes(path) || entry.localExample.policy === "omitted") {
        fail(`${name} is not permitted in ${path}`);
      }
      if (entry.localExample.policy === "blank" && value !== "") {
        fail(`${name} must be blank in ${path}`);
      }
      if (entry.localExample.policy === "synthetic") {
        if (!value || looksLikeHostedCredentialOrIdentity(value)) {
          fail(`${name} must use a clearly synthetic value in ${path}`);
        }
      }
      if (entry.localExample.policy === "fixed" && value !== entry.localExample.fixedValue) {
        fail(`${name} must use its fixed example value in ${path}`);
      }
      if (
        ["server_secret", "protected_github_secret", "fixture_only_secret"].includes(
          entry.valueClass,
        ) &&
        value !== ""
      ) {
        fail(`${name} secret example must be blank in ${path}`);
      }
    }
  }
}

function looksLikeHostedCredentialOrIdentity(value) {
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(value);
  return (
    /^sb_(?:secret|publishable)_/u.test(value) ||
    /^postgres(?:ql)?:\/\//u.test(value) ||
    /^sk-[A-Za-z0-9_-]+$/u.test(value) ||
    (uuidLike && value !== "00000000-0000-0000-0000-000000000001") ||
    /\.supabase\.co/u.test(value)
  );
}

function validateSourceConstants(entries, root) {
  for (const entry of entries.values()) {
    const contents = readFileSync(join(root, entry.sourcePath), "utf8");
    const actual = readExportedConstant(contents, entry.sourcePath, entry.name);
    if (
      "expectedValue" in entry &&
      JSON.stringify(actual) !== JSON.stringify(entry.expectedValue)
    ) {
      fail(`${entry.name} differs from its expected value`);
    }
  }
}

function readExportedConstant(contents, path, name) {
  const sourceFile = ts.createSourceFile(
    path,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!exported) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return evaluateConstant(declaration.initializer, path, name);
      }
    }
  }
  fail(`${name} is not an exported constant in ${path}`);
}

function evaluateConstant(node, path, name) {
  if (!node) fail(`${name} has no initializer in ${path}`);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text.replaceAll("_", ""));
  if (ts.isArrayLiteralExpression(node))
    return node.elements.map((item) => evaluateConstant(item, path, name));
  if (ts.isBinaryExpression(node)) {
    const left = evaluateConstant(node.left, path, name);
    const right = evaluateConstant(node.right, path, name);
    if (typeof left !== "number" || typeof right !== "number")
      fail(`${name} uses a non-numeric expression`);
    if (node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) return left * right;
    if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) return left + right;
  }
  fail(`${name} uses an unsupported constant expression in ${path}`);
}

function validateRuntimeTerraformConsumers(entries, root) {
  const terraform = readFileSync(join(root, runtimeTerraformPath), "utf8");
  const actual = {
    website: resolveTerraformEnvironmentMap(terraform, "website_environment"),
    activation_worker: resolveTerraformEnvironmentMap(terraform, "worker_environment"),
    reconciliation_job: resolveTerraformEnvironmentMap(terraform, "reconciliation_environment"),
  };
  for (const [role, actualNames] of Object.entries(actual)) {
    const catalogNames = new Set();
    for (const entry of entries.values()) {
      if (
        entry.consumers.some(
          (consumer) => consumer.role === role && consumer.suppliedBy === "terraform",
        )
      ) {
        catalogNames.add(entry.name);
      }
    }
    if (JSON.stringify([...actualNames].sort()) !== JSON.stringify([...catalogNames].sort())) {
      fail(`${role} Terraform environment keys differ from the catalog`);
    }
  }
}

function resolveTerraformEnvironmentMap(contents, rootName) {
  const definitions = readTerraformLocalDefinitions(contents);
  const visiting = new Set();
  function resolveName(name) {
    if (visiting.has(name)) fail(`Terraform environment map ${name} is recursive`);
    const expression = definitions.get(name);
    if (!expression) fail(`Terraform environment map ${name} is missing`);
    visiting.add(name);
    const names = new Set(extractTextNames(expression));
    for (const reference of expression.matchAll(/\blocal\.([a-z][a-z0-9_]*)\b/gu)) {
      if (definitions.has(reference[1])) {
        for (const nested of resolveName(reference[1])) names.add(nested);
      }
    }
    visiting.delete(name);
    return names;
  }
  return resolveName(rootName);
}

function readTerraformLocalDefinitions(contents) {
  const definitions = new Map();
  const pattern = /^\s{2}([a-z][a-z0-9_]*)\s*=\s*/gmu;
  for (const match of contents.matchAll(pattern)) {
    const start = match.index + match[0].length;
    if (contents.startsWith("merge(", start)) {
      definitions.set(match[1], readBalancedExpression(contents, start, "(", ")"));
    } else if (contents[start] === "{") {
      definitions.set(match[1], readBalancedExpression(contents, start, "{", "}"));
    }
  }
  return definitions;
}

function readBalancedExpression(contents, start, opening, closing) {
  const firstOpening = contents.indexOf(opening, start);
  let depth = 0;
  let quote = null;
  for (let index = firstOpening; index < contents.length; index += 1) {
    const character = contents[index];
    if (quote) {
      if (character === quote && contents[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"') {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) depth -= 1;
    if (depth === 0) return contents.slice(start, index + 1);
  }
  fail("Terraform local expression is unbalanced");
}

function validateBrowserConfigurationContract(catalog, entries, root) {
  const mappedKeys = [];
  for (const entry of entries.values()) {
    if (entry.exposure.browserConfiguration === "allowed") {
      mappedKeys.push(entry.exposure.browserConfigurationKey);
      if (entry.valueClass !== "browser_safe")
        fail(`${entry.name} browser configuration is not browser-safe`);
    }
    if (
      ["server_secret", "protected_github_secret", "fixture_only_secret"].includes(
        entry.valueClass,
      ) &&
      entry.exposure.browserAssets !== "forbidden"
    ) {
      fail(`${entry.name} secret is allowed in browser assets`);
    }
  }
  if (
    JSON.stringify(mappedKeys.sort()) !==
    JSON.stringify([...catalog.publicRuntimeConfigurationKeys].sort())
  ) {
    fail("public runtime configuration keys differ from catalog exposure mappings");
  }
  const sourceKeys = readRuntimePublicConfigurationKeys(root);
  if (
    JSON.stringify(sourceKeys.sort()) !==
    JSON.stringify([...catalog.publicRuntimeConfigurationKeys].sort())
  ) {
    fail("public runtime configuration source keys differ from the catalog");
  }
}

function readRuntimePublicConfigurationKeys(root) {
  const contents = readFileSync(join(root, runtimePublicConfigurationPath), "utf8");
  const sourceFile = ts.createSourceFile(
    runtimePublicConfigurationPath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "runtimePublicConfigSchema" &&
        declaration.initializer
      ) {
        const object = findZodObjectLiteral(declaration.initializer);
        if (!object) fail("runtime public configuration schema object is missing");
        return object.properties.map((property) => {
          if (!ts.isPropertyAssignment(property)) {
            fail("runtime public configuration schema contains a non-property field");
          }
          const name = propertyNameText(property.name);
          if (!name) fail("runtime public configuration schema contains a computed field");
          return name;
        });
      }
    }
  }
  fail("runtime public configuration schema is missing");
}

function findZodObjectLiteral(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "z" &&
    node.expression.name.text === "object"
  ) {
    const argument = node.arguments[0];
    return argument && ts.isObjectLiteralExpression(argument) ? argument : null;
  }
  if (ts.isCallExpression(node)) return findZodObjectLiteral(node.expression);
  if (ts.isPropertyAccessExpression(node)) return findZodObjectLiteral(node.expression);
  return null;
}

function pathMatches(pattern, path) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  const regex = escaped
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${regex}$`, "u").test(path);
}

export function validateConfigurationContract(root = repositoryRoot) {
  return validateConfigurationCatalog(readConfigurationCatalog(root), { repositoryRoot: root });
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const result = validateConfigurationContract();
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "deployment_configuration_contract_failed"}\n`,
    );
    process.exitCode = 1;
  }
}
