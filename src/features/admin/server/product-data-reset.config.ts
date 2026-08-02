import { z } from "zod";

export const PRODUCT_DATA_RESET_PROJECT_REF = "jhkouuxouplqcfecjutd";

const environmentSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
    BAZORIA_PRODUCT_RESET_QA_USER_IDS: z.string().trim().min(1),
  })
  .passthrough();

const uuidSchema = z.string().uuid();

export type ProductDataResetMode = "prepare" | "verify";

export type ProductDataResetConfig = {
  mode: ProductDataResetMode;
  supabaseUrl: string;
  serviceRoleKey: string;
  projectRef: string;
  qaUserIds: string[];
  snapshotPath: string;
  summaryPath: string;
  pageSize: number;
};

export function readProductDataResetConfig(
  environment: NodeJS.ProcessEnv = process.env,
  arguments_: string[] = process.argv.slice(2),
): ProductDataResetConfig {
  const parsedEnvironment = environmentSchema.safeParse(environment);
  if (!parsedEnvironment.success) throw new Error("product_data_reset_configuration_invalid");

  const options = parseArguments(arguments_);
  const projectRef = projectRefFromUrl(parsedEnvironment.data.SUPABASE_URL);
  if (
    projectRef !== PRODUCT_DATA_RESET_PROJECT_REF ||
    options.confirmProjectRef !== PRODUCT_DATA_RESET_PROJECT_REF
  ) {
    throw new Error("product_data_reset_project_confirmation_invalid");
  }

  const qaUserIds = parsedEnvironment.data.BAZORIA_PRODUCT_RESET_QA_USER_IDS.split(",").map(
    (value) => value.trim(),
  );
  if (
    qaUserIds.length === 0 ||
    new Set(qaUserIds).size !== qaUserIds.length ||
    qaUserIds.some((value) => !uuidSchema.safeParse(value).success)
  ) {
    throw new Error("product_data_reset_qa_users_invalid");
  }

  return {
    mode: options.mode,
    supabaseUrl: parsedEnvironment.data.SUPABASE_URL.replace(/\/+$/, ""),
    serviceRoleKey: parsedEnvironment.data.SUPABASE_SERVICE_ROLE_KEY,
    projectRef,
    qaUserIds,
    snapshotPath: options.snapshotPath,
    summaryPath: options.summaryPath,
    pageSize: options.pageSize,
  };
}

function parseArguments(arguments_: string[]): {
  mode: ProductDataResetMode;
  confirmProjectRef: string;
  snapshotPath: string;
  summaryPath: string;
  pageSize: number;
} {
  const [mode, ...rest] = arguments_;
  if (mode !== "prepare" && mode !== "verify") {
    throw new Error("product_data_reset_mode_invalid");
  }

  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) {
      throw new Error("product_data_reset_arguments_invalid");
    }
    values.set(key, value);
  }

  const allowed = new Set(["--confirm-project-ref", "--snapshot", "--summary", "--page-size"]);
  if ([...values.keys()].some((key) => !allowed.has(key))) {
    throw new Error("product_data_reset_arguments_invalid");
  }

  const confirmProjectRef = values.get("--confirm-project-ref");
  const snapshotPath = values.get("--snapshot");
  const summaryPath = values.get("--summary");
  const pageSize = Number.parseInt(values.get("--page-size") ?? "100", 10);
  if (
    !confirmProjectRef ||
    !snapshotPath ||
    !summaryPath ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1000
  ) {
    throw new Error("product_data_reset_arguments_invalid");
  }

  return { mode, confirmProjectRef, snapshotPath, summaryPath, pageSize };
}

export function projectRefFromUrl(value: string): string {
  const url = new URL(value);
  const match = /^([a-z0-9]{20})\.supabase\.co$/u.exec(url.hostname);
  if (!match || url.protocol !== "https:") {
    throw new Error("product_data_reset_supabase_url_invalid");
  }
  return match[1]!;
}
