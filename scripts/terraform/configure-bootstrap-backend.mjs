import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = join(
  repositoryRoot,
  "infrastructure/google-cloud/bootstrap/backend.generated.tf",
);

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

try {
  const mode = readArgument("--mode");
  const environment = readArgument("--environment");
  if (!["local", "gcs"].includes(mode) || !["uat", "production"].includes(environment)) {
    throw new Error("terraform_bootstrap_backend_arguments_invalid");
  }

  const source =
    mode === "local"
      ? `# Generated locally; do not commit.\nterraform {\n  backend "local" {\n    path = "../../../.terraform-data/state/bootstrap-${environment}/terraform.tfstate"\n  }\n}\n`
      : `# Generated locally for ${environment}; do not commit.\nterraform {\n  backend "gcs" {}\n}\n`;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, source, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ status: "passed", environment, mode })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
