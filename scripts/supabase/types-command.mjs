#!/usr/bin/env node

import {
  checkLocalGeneratedTypes,
  generateLocalTypes,
  reportDatabaseToolingError,
} from "./database-tooling.mjs";

try {
  const action = process.argv[2];
  if (action === "generate") await generateLocalTypes();
  else if (action === "check") await checkLocalGeneratedTypes();
  else throw new Error(`Unsupported type action ${action}.`);
} catch (error) {
  reportDatabaseToolingError(error);
  process.exitCode = 1;
}
