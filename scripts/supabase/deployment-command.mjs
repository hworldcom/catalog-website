#!/usr/bin/env node

import {
  DatabaseToolingError,
  assertSupportedRuntime,
  parseEnvironmentArguments,
  reportDatabaseToolingError,
} from "./database-tooling.mjs";
import {
  loadBootstrapEnvironmentTarget,
  verifyHostedDeploymentFoundation,
} from "./deployment-bootstrap.mjs";
import { runStorageSmoke } from "./storage-smoke.mjs";

try {
  assertSupportedRuntime();
  const action = process.argv[2];
  if (!new Set(["verify", "storage-smoke"]).has(action)) {
    throw new DatabaseToolingError(
      "supabase_deployment_action_invalid",
      `Unsupported deployment action ${action}.`,
    );
  }
  const write = action === "storage-smoke";
  const { environment, confirmProject } = parseEnvironmentArguments(process.argv.slice(3), {
    write,
  });
  const target = loadBootstrapEnvironmentTarget(environment);
  if (action === "verify") await verifyHostedDeploymentFoundation(target);
  else await runStorageSmoke(target, confirmProject);
} catch (error) {
  reportDatabaseToolingError(error);
  process.exitCode = 1;
}
