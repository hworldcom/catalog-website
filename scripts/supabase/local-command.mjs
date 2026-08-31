#!/usr/bin/env node

import { reportDatabaseToolingError, runLocalDatabaseAction } from "./database-tooling.mjs";

try {
  await runLocalDatabaseAction(process.argv[2]);
} catch (error) {
  reportDatabaseToolingError(error);
  process.exitCode = 1;
}
