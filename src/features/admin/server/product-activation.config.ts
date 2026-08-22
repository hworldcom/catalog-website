import { z } from "zod";

import {
  readProductPublicationConfig,
  type ProductPublicationConfig,
} from "@/features/seller/server/product-publication.config";

const positiveInteger = z.coerce.number().int().positive();
const secureUrl = z
  .string()
  .trim()
  .url()
  .transform((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "must use https" });
      return z.NEVER;
    }
    return url.toString();
  });

const recoverySchema = z.object({
  BAZORIA_PRODUCT_ACTIVATION_RECOVERY_INTERVAL_SECONDS: positiveInteger.default(30),
  BAZORIA_PRODUCT_ACTIVATION_RECOVERY_BATCH_SIZE: positiveInteger.max(100).default(25),
});

const cloudTasksSchema = z.object({
  GOOGLE_CLOUD_PROJECT: z.string().trim().min(1),
  BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION: z.string().trim().min(1),
  BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE: z.string().trim().min(1),
  BAZORIA_PRODUCT_PUBLICATION_WORKER_URL: secureUrl.transform((value) => value.replace(/\/+$/, "")),
  BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT: z.string().trim().email(),
  BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: secureUrl,
  BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS: positiveInteger.max(1_800),
  BAZORIA_PRODUCT_PUBLICATION_TASK_CLIENT_TIMEOUT_SECONDS: positiveInteger.max(30).default(10),
  BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: positiveInteger,
});

export type LocalProductActivationSettings = {
  dispatchMode: "local";
  deploymentEnvironment: "local";
  recoveryIntervalMs: number;
  recoveryBatchSize: number;
};

export type CloudTasksProductActivationSettings = {
  dispatchMode: "cloud_tasks";
  deploymentEnvironment: "uat" | "production";
  googleCloudProject: string;
  taskLocation: string;
  taskQueue: string;
  workerUrl: string;
  taskServiceAccount: string;
  taskAudience: string;
  taskDispatchDeadlineSeconds: number;
  taskClientTimeoutMs: number;
  taskMaximumRetryDurationSeconds: number;
  maximumEnqueueAttemptMs: number;
};

export type ProductActivationConfig = ProductPublicationConfig &
  (LocalProductActivationSettings | CloudTasksProductActivationSettings);

export type LocalProductActivationConfig = ProductPublicationConfig &
  LocalProductActivationSettings;

export function readProductActivationConfig(
  environment: Record<string, string | undefined> = process.env,
): ProductActivationConfig {
  const publication = readProductPublicationConfig(environment);
  if (publication.dispatchMode === "cloud_tasks") {
    return readCloudTasksConfig(publication, environment);
  }

  const recovery = recoverySchema.safeParse(environment);
  if (!recovery.success) {
    const details = recovery.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`product_activation_configuration_invalid: ${details}`);
  }
  return {
    ...publication,
    dispatchMode: "local",
    deploymentEnvironment: "local",
    recoveryIntervalMs: recovery.data.BAZORIA_PRODUCT_ACTIVATION_RECOVERY_INTERVAL_SECONDS * 1_000,
    recoveryBatchSize: recovery.data.BAZORIA_PRODUCT_ACTIVATION_RECOVERY_BATCH_SIZE,
  };
}

function readCloudTasksConfig(
  publication: ProductPublicationConfig,
  environment: Record<string, string | undefined>,
): ProductActivationConfig {
  const cloud = cloudTasksSchema.safeParse(environment);
  if (!cloud.success) {
    throwInvalidCloudConfig(
      cloud.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const details: string[] = [];
  const workerDeadlineSeconds = publication.workerDeadlineMs / 1_000;
  if (
    cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS <
    workerDeadlineSeconds + 30
  ) {
    details.push(
      `BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS: must be at least ${workerDeadlineSeconds + 30}`,
    );
  }
  if (
    cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS <
    publication.claimTimeoutSeconds + 60
  ) {
    details.push(
      `BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: must be at least ${publication.claimTimeoutSeconds + 60}`,
    );
  }
  if (details.length > 0) throwInvalidCloudConfig(details);

  const taskClientTimeoutMs =
    cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_CLIENT_TIMEOUT_SECONDS * 1_000;
  return {
    ...publication,
    dispatchMode: "cloud_tasks",
    deploymentEnvironment: publication.deploymentEnvironment as "uat" | "production",
    googleCloudProject: cloud.data.GOOGLE_CLOUD_PROJECT,
    taskLocation: cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION,
    taskQueue: cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE,
    workerUrl: cloud.data.BAZORIA_PRODUCT_PUBLICATION_WORKER_URL,
    taskServiceAccount: cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT,
    taskAudience: cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE,
    taskDispatchDeadlineSeconds:
      cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS,
    taskClientTimeoutMs,
    taskMaximumRetryDurationSeconds:
      cloud.data.BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS,
    maximumEnqueueAttemptMs: taskClientTimeoutMs * 4 + 5_000,
  };
}

function throwInvalidCloudConfig(details: string[]): never {
  throw new Error(`product_publication_configuration_invalid: ${details.join("; ")}`);
}
