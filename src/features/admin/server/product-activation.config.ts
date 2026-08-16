import { z } from "zod";

import {
  readProductPublicationConfig,
  type ProductPublicationConfig,
} from "@/features/seller/server/product-publication.config";

const positiveInteger = z.coerce.number().int().positive();

const recoverySchema = z.object({
  BAZORIA_PRODUCT_ACTIVATION_RECOVERY_INTERVAL_SECONDS: positiveInteger.default(30),
  BAZORIA_PRODUCT_ACTIVATION_RECOVERY_BATCH_SIZE: positiveInteger.max(100).default(25),
});

export type ProductActivationConfig = ProductPublicationConfig & {
  recoveryIntervalMs: number;
  recoveryBatchSize: number;
};

export function readProductActivationConfig(
  environment: Record<string, string | undefined> = process.env,
): ProductActivationConfig {
  const publication = readProductPublicationConfig(environment);
  const recovery = recoverySchema.safeParse(environment);
  if (!recovery.success) {
    const details = recovery.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`product_activation_configuration_invalid: ${details}`);
  }
  return {
    ...publication,
    recoveryIntervalMs: recovery.data.BAZORIA_PRODUCT_ACTIVATION_RECOVERY_INTERVAL_SECONDS * 1_000,
    recoveryBatchSize: recovery.data.BAZORIA_PRODUCT_ACTIVATION_RECOVERY_BATCH_SIZE,
  };
}
