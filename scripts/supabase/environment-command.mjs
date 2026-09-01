#!/usr/bin/env node

import {
  assertEnvironmentCurrent,
  assertPreflightMayMigrate,
  assertSupportedRuntime,
  loadEnvironmentTarget,
  parseEnvironmentArguments,
  reportDatabaseToolingError,
  runEnvironmentMigration,
  runEnvironmentPreflight,
} from "./database-tooling.mjs";
import { assertEnvironmentBootstrapMayProceed } from "./deployment-inventory.mjs";

try {
  assertSupportedRuntime();
  const action = process.argv[2];
  const write = action === "migrate";
  if (!new Set(["assert-current", "preflight", "migrate"]).has(action)) {
    throw new Error(`Unsupported environment action ${action}.`);
  }
  const { environment, confirmProject } = parseEnvironmentArguments(process.argv.slice(3), {
    write,
  });
  const target = loadEnvironmentTarget(environment);
  if (write) {
    assertEnvironmentBootstrapMayProceed(environment);
    await runEnvironmentMigration(target, confirmProject);
  } else {
    const result = await runEnvironmentPreflight(target);
    if (action === "assert-current") assertEnvironmentCurrent(result.state);
    else assertPreflightMayMigrate(result.state);
  }
} catch (error) {
  reportDatabaseToolingError(error);
  process.exitCode = 1;
}
