import { rm } from "node:fs/promises";

import { build } from "esbuild";

const outputDirectory = ".output/commands";
await rm(outputDirectory, { force: true, recursive: true });

await build({
  entryPoints: {
    "web-process": "src/features/runtime/server/web-process.ts",
    "product-activation-worker": "src/features/admin/server/product-activation.worker-process.ts",
    "product-activation-reconciliation":
      "src/features/admin/server/product-activation-reconciliation.command.ts",
  },
  outdir: outputDirectory,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node22.13",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  tsconfig: "tsconfig.json",
});
