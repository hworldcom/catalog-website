import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { DEPLOYED_PROJECTS, DatabaseToolingError, repositoryRoot } from "./database-tooling.mjs";

const projectRefSchema = z.string().regex(/^[a-z0-9]{20}$/u);
const nonSecretDatabaseUserSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes(":") && !value.includes("@"), {
    message: "Migration user form must not contain credentials or a host.",
  });
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "Expected an HTTPS URL.",
  });
const requiredBucketSchema = z
  .object({
    id: z.enum(["product-images", "product-draft-images", "seller-profile-images"]),
    public: z.boolean(),
    fileSizeLimitBytes: z.literal(20 * 1024 * 1024),
    allowedMimeTypes: z.tuple([
      z.literal("image/jpeg"),
      z.literal("image/png"),
      z.literal("image/webp"),
    ]),
  })
  .strict();

export const deploymentEnvironmentInventorySchema = z
  .object({
    schemaVersion: z.literal(2),
    environment: z.enum(["uat", "production"]),
    supabase: z
      .object({
        projectRef: projectRefSchema,
        organizationId: z.string().min(1),
        region: z.literal("eu-central-1"),
        projectUrl: httpsUrlSchema,
        database: z
          .object({
            host: z.string().min(1),
            name: z.literal("postgres"),
            migrationUserForm: nonSecretDatabaseUserSchema,
          })
          .strict(),
        plan: z.string().min(1),
        backups: z
          .object({
            managed: z.boolean(),
            retention: z.string().min(1),
            pointInTimeRecovery: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    application: z
      .object({
        canonicalOrigin: httpsUrlSchema,
        googleSignInEnabled: z.literal(false),
      })
      .strict(),
    authentication: z
      .object({
        siteUrl: httpsUrlSchema,
        redirectUrls: z.array(httpsUrlSchema).length(2),
        googleCallbackUrl: httpsUrlSchema,
        passwordPolicy: z
          .object({
            minimumLength: z.literal(8),
            requiredCharacters: z.literal("none"),
            verifiedBy: z.string().min(1).nullable(),
            verifiedAt: z.string().datetime({ offset: true }).nullable(),
          })
          .strict()
          .superRefine((value, context) => {
            if ((value.verifiedBy === null) !== (value.verifiedAt === null)) {
              context.addIssue({
                code: "custom",
                message: "Password-policy verifier and time must be recorded together.",
              });
            }
          }),
      })
      .strict(),
    storage: z
      .object({
        requiredBuckets: z.array(requiredBucketSchema).length(3),
      })
      .strict(),
    ownership: z
      .object({
        administratorAllowlist: z.array(z.string().uuid()),
        externalProviderConfiguration: z
          .object({
            googleEnabled: z.literal(false),
          })
          .strict(),
      })
      .strict(),
    bootstrap: z
      .object({
        gitCommit: z
          .string()
          .regex(/^[0-9a-f]{40}$/u)
          .nullable(),
        migrationHead: z
          .string()
          .regex(/^\d{14}$/u)
          .nullable(),
        verifiedAt: z.string().datetime({ offset: true }).nullable(),
      })
      .strict(),
  })
  .strict();

export const referenceDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    rootCategory: z
      .object({
        slug: z.literal("fashion"),
        productCodePrefix: z.literal("F"),
      })
      .strict(),
    leafCategories: z
      .array(
        z
          .object({
            slug: z.string().min(1),
            productCodePrefix: z.string().regex(/^[A-Z0-9]{2,4}$/u),
          })
          .strict(),
      )
      .length(18),
    productAudiences: z.tuple([z.literal("women"), z.literal("men"), z.literal("kids")]),
  })
  .strict()
  .superRefine((value, context) => {
    reportDuplicates(
      value.leafCategories.map(({ slug }) => slug),
      "leaf category slug",
      context,
    );
    reportDuplicates(
      value.leafCategories.map(({ productCodePrefix }) => productCodePrefix),
      "leaf category product-code prefix",
      context,
    );
  });

export function loadDeploymentEnvironmentInventory(environment, root = repositoryRoot) {
  const filePath = join(root, "deployment", "environments", `${environment}.json`);
  const inventory = parseJsonFile(filePath, deploymentEnvironmentInventorySchema);
  validateEnvironmentInventoryIdentity(environment, inventory);
  return inventory;
}

export function loadReferenceData(root = repositoryRoot) {
  return parseJsonFile(join(root, "deployment", "reference-data.json"), referenceDataSchema);
}

export function validateEnvironmentInventoryIdentity(environment, inventory) {
  const expectedRef = DEPLOYED_PROJECTS[environment];
  const expectedOrigin =
    environment === "uat" ? "https://uat2026.bazoria.pl" : "https://bazoria.pl";
  const expectedProjectUrl = `https://${expectedRef}.supabase.co`;
  const expectedRedirects = [`${expectedOrigin}/auth`, `${expectedOrigin}/auth/recovery`];
  const expectedBuckets = [
    ["product-draft-images", false],
    ["product-images", true],
    ["seller-profile-images", false],
  ];

  if (
    inventory.environment !== environment ||
    inventory.supabase.projectRef !== expectedRef ||
    inventory.supabase.projectUrl !== expectedProjectUrl ||
    inventory.application.canonicalOrigin !== expectedOrigin ||
    inventory.application.googleSignInEnabled !== false ||
    inventory.authentication.siteUrl !== expectedOrigin ||
    JSON.stringify(inventory.authentication.redirectUrls) !== JSON.stringify(expectedRedirects) ||
    inventory.authentication.googleCallbackUrl !== `${expectedProjectUrl}/auth/v1/callback`
  ) {
    throw new DatabaseToolingError(
      "supabase_deployment_inventory_mismatch",
      `The ${environment} inventory does not match its fixed environment identity.`,
    );
  }

  const actualBuckets = inventory.storage.requiredBuckets
    .map(({ id, public: isPublic }) => [id, isPublic])
    .sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actualBuckets) !== JSON.stringify(expectedBuckets)) {
    throw new DatabaseToolingError(
      "supabase_deployment_inventory_mismatch",
      `The ${environment} inventory does not contain the exact storage bucket set.`,
    );
  }
}

export function assertInventoryReadyForBootstrap(inventory) {
  if (
    inventory.bootstrap.gitCommit !== null ||
    inventory.bootstrap.migrationHead !== null ||
    inventory.bootstrap.verifiedAt !== null
  ) {
    throw new DatabaseToolingError(
      "supabase_environment_already_bootstrapped",
      `The ${inventory.environment} inventory already records a completed bootstrap.`,
    );
  }
}

export function assertEnvironmentBootstrapMayProceed(environment, root = repositoryRoot) {
  if (environment !== "production") return;
  const uatInventory = loadDeploymentEnvironmentInventory("uat", root);
  if (
    !uatInventory.bootstrap.gitCommit ||
    !uatInventory.bootstrap.migrationHead ||
    !uatInventory.bootstrap.verifiedAt ||
    uatInventory.ownership.administratorAllowlist.length === 0
  ) {
    throw new DatabaseToolingError(
      "supabase_production_bootstrap_blocked",
      "Complete and record the UAT bootstrap before accessing production bootstrap operations.",
    );
  }
}

function parseJsonFile(filePath, schema) {
  let value;
  try {
    value = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new DatabaseToolingError(
      "supabase_deployment_inventory_invalid",
      `Could not read ${filePath}.`,
      { cause: error },
    );
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DatabaseToolingError(
      "supabase_deployment_inventory_invalid",
      `Invalid deployment inventory ${filePath}: ${result.error.issues[0]?.message ?? "unknown error"}.`,
    );
  }
  return result.data;
}

function reportDuplicates(values, label, context) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) {
    context.addIssue({
      code: "custom",
      message: `Duplicate ${label} ${duplicate}.`,
    });
  }
}
