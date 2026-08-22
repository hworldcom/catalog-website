import { z } from "zod";

import {
  readProductActivationConfig,
  type ProductActivationConfig,
} from "./product-activation.config";

const positiveInteger = z.coerce.number().int().positive();
const reconciliationSchema = z.object({
  BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_BATCH_SIZE: positiveInteger.max(500).default(100),
  BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_DEADLINE_SECONDS: positiveInteger
    .min(10)
    .max(300)
    .default(60),
});

type CloudProductActivationConfig = Extract<
  ProductActivationConfig,
  { dispatchMode: "cloud_tasks" }
>;

export type ProductActivationReconciliationConfig = CloudProductActivationConfig & {
  reconciliationBatchSize: number;
  reconciliationDeadlineMs: number;
};

export function readProductActivationReconciliationConfig(
  environment: Record<string, string | undefined> = process.env,
): ProductActivationReconciliationConfig {
  const activation = readProductActivationConfig(environment);
  if (activation.dispatchMode !== "cloud_tasks") {
    throw invalidConfiguration([
      "BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: must be cloud_tasks for reconciliation",
    ]);
  }

  const reconciliation = reconciliationSchema.safeParse(environment);
  if (!reconciliation.success) {
    throw invalidConfiguration(
      reconciliation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const reconciliationDeadlineMs =
    reconciliation.data.BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_DEADLINE_SECONDS * 1_000;
  const minimumDeadlineMs = activation.maximumEnqueueAttemptMs + 5_000;
  if (reconciliationDeadlineMs < minimumDeadlineMs) {
    throw invalidConfiguration([
      `BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_DEADLINE_SECONDS: must be at least ${minimumDeadlineMs / 1_000}`,
    ]);
  }

  return {
    ...activation,
    reconciliationBatchSize:
      reconciliation.data.BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_BATCH_SIZE,
    reconciliationDeadlineMs,
  };
}

function invalidConfiguration(details: string[]): Error {
  return new Error(`product_publication_configuration_invalid: ${details.join("; ")}`);
}
