import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const serverFunctionFiles = [
  "src/features/seller-classifier/seller-classifier-batch.functions.ts",
  "src/features/seller-classifier/seller-classifier-history.functions.ts",
  "src/features/seller-classifier/seller-classifier-comparison.functions.ts",
  "src/features/seller-classifier/seller-classifier-review.functions.ts",
  "src/features/seller-classifier/seller-classifier-import.functions.ts",
  "src/features/admin/delegated-classifier-upload.functions.ts",
  "src/features/admin/delegated-classifier-review-import.functions.ts",
];

const routeFiles: Array<[string, string]> = [
  ["src/routes/_authenticated/seller.classifier-batches.tsx", "guardSellerClassifierRoute"],
  ["src/routes/_authenticated/seller.classifier-batches_.new.tsx", "guardSellerClassifierRoute"],
  [
    "src/routes/_authenticated/seller.classifier-batches_.$workflowId.upload.tsx",
    "guardSellerClassifierRoute",
  ],
  [
    "src/routes/_authenticated/seller.classifier-batches_.$workflowId.processing.tsx",
    "guardSellerClassifierRoute",
  ],
  [
    "src/routes/_authenticated/seller.classifier-batches_.$workflowId.review.tsx",
    "guardSellerClassifierRoute",
  ],
  [
    "src/routes/_authenticated/seller.classifier-batches_.$workflowId.import.tsx",
    "guardSellerClassifierRoute",
  ],
  [
    "src/routes/_authenticated/admin.classifier-uploads_.new.tsx",
    "guardAdministratorClassifierRoute",
  ],
  [
    "src/routes/_authenticated/admin.classifier-uploads_.$workflowId.tsx",
    "guardAdministratorClassifierRoute",
  ],
  [
    "src/routes/_authenticated/admin.classifier-uploads_.$workflowId_.review.tsx",
    "guardAdministratorClassifierRoute",
  ],
  [
    "src/routes/_authenticated/admin.classifier-uploads_.$workflowId_.import.tsx",
    "guardAdministratorClassifierRoute",
  ],
  [
    "src/routes/_authenticated/admin.classifier-uploads_.$workflowId_.products.$productDraftId.tsx",
    "guardAdministratorClassifierRoute",
  ],
  ["src/routes/_authenticated/admin.classifier-imports.tsx", "guardAdministratorClassifierRoute"],
  [
    "src/routes/_authenticated/admin.classifier-imports_.$importId.tsx",
    "guardAdministratorClassifierRoute",
  ],
];

describe("classifier release-gate coverage", () => {
  it.each(serverFunctionFiles)("gates every exported server function in %s", (relativePath) => {
    const source = sourceFile(relativePath);
    const ungated: string[] = [];

    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          !declaration.initializer ||
          !declaration.initializer.getText(source).includes("createServerFn")
        ) {
          continue;
        }
        if (!declaration.initializer.getText(source).includes("requireClassifierAssistedUpload")) {
          ungated.push(declaration.name.getText(source));
        }
      }
    }

    expect(ungated).toEqual([]);
  });

  it.each(routeFiles)("guards classifier route %s", (relativePath, guardName) => {
    const source = sourceFile(relativePath);
    const routeOptions = source.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find((declaration) => declaration.name.getText(source) === "Route")
      ?.initializer?.getText(source);

    expect(routeOptions).toContain("beforeLoad");
    expect(routeOptions).toContain(guardName);
  });
});

function sourceFile(relativePath: string): ts.SourceFile {
  const absolutePath = resolve(process.cwd(), relativePath);
  return ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasExportModifier(statement: ts.VariableStatement): boolean {
  return (
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
  );
}
