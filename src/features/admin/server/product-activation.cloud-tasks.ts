import { CloudTasksClient, protos } from "@google-cloud/tasks";
import { status as grpcStatus } from "@grpc/grpc-js";

import type { CloudTasksProductActivationSettings } from "./product-activation.config";
import type { ProductActivationDispatcher } from "./product-activation.dispatcher";
import type { ProductActivationRepository } from "./product-activation.repository";
import {
  ProductActivationError,
  productActivationDispatchPayloadSchema,
  type ProductActivationDispatchPayload,
  type ProductActivationDispatchResult,
} from "./product-activation.types";

const TASK_ENDPOINT = "/internal/tasks/activate-product-submission";

export type ProductActivationTaskCreateResult =
  "created" | "already_exists" | "definitive_failure" | "ambiguous";
export type ProductActivationTaskLookupResult = "exists" | "absent" | "unknown";
export type ProductActivationTaskOutcome =
  "created" | "already_exists" | "found_after_ambiguous_create" | "definitive_failure";

export type ProductActivationDetailedDispatchResult = {
  durableResult: ProductActivationDispatchResult;
  taskOutcome: ProductActivationTaskOutcome;
};

export interface ProductActivationDetailedDispatcher {
  dispatchWithOutcome(
    payload: ProductActivationDispatchPayload,
    options?: { signal?: AbortSignal },
  ): Promise<ProductActivationDetailedDispatchResult>;
}

export interface ProductActivationTaskClient {
  create(payload: ProductActivationDispatchPayload): Promise<ProductActivationTaskCreateResult>;
  lookup(payload: ProductActivationDispatchPayload): Promise<ProductActivationTaskLookupResult>;
}

type CreateTaskRequest = protos.google.cloud.tasks.v2.ICreateTaskRequest;
type GetTaskRequest = protos.google.cloud.tasks.v2.IGetTaskRequest;

export interface GoogleCloudTasksApi {
  queuePath(project: string, location: string, queue: string): string;
  taskPath(project: string, location: string, queue: string, task: string): string;
  createTask(request: CreateTaskRequest, options: { timeout: number }): Promise<unknown>;
  getTask(request: GetTaskRequest, options: { timeout: number }): Promise<unknown>;
}

export class GoogleCloudProductActivationTaskClient implements ProductActivationTaskClient {
  private readonly parent: string;

  constructor(
    private readonly config: CloudTasksProductActivationSettings,
    private readonly client: GoogleCloudTasksApi = new CloudTasksClient(),
  ) {
    this.parent = client.queuePath(
      config.googleCloudProject,
      config.taskLocation,
      config.taskQueue,
    );
  }

  async create(
    payload: ProductActivationDispatchPayload,
  ): Promise<ProductActivationTaskCreateResult> {
    try {
      await this.client.createTask(
        {
          parent: this.parent,
          task: {
            name: this.taskName(payload),
            dispatchDeadline: { seconds: this.config.taskDispatchDeadlineSeconds },
            httpRequest: {
              httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
              url: `${this.config.workerUrl}${TASK_ENDPOINT}`,
              headers: { "Content-Type": "application/json" },
              body: Buffer.from(JSON.stringify(payload), "utf8"),
              oidcToken: {
                serviceAccountEmail: this.config.taskServiceAccount,
                audience: this.config.taskAudience,
              },
            },
          },
        },
        { timeout: this.config.taskClientTimeoutMs },
      );
      return "created";
    } catch (error) {
      const code = readGrpcStatus(error);
      if (code === grpcStatus.ALREADY_EXISTS) return "already_exists";
      return isAmbiguousCreateStatus(code) ? "ambiguous" : "definitive_failure";
    }
  }

  async lookup(
    payload: ProductActivationDispatchPayload,
  ): Promise<ProductActivationTaskLookupResult> {
    try {
      await this.client.getTask(
        { name: this.taskName(payload) },
        { timeout: this.config.taskClientTimeoutMs },
      );
      return "exists";
    } catch (error) {
      return readGrpcStatus(error) === grpcStatus.NOT_FOUND ? "absent" : "unknown";
    }
  }

  taskName(payload: ProductActivationDispatchPayload): string {
    return this.client.taskPath(
      this.config.googleCloudProject,
      this.config.taskLocation,
      this.config.taskQueue,
      productActivationTaskId(payload),
    );
  }
}

export class CloudTasksProductActivationDispatcher
  implements ProductActivationDispatcher, ProductActivationDetailedDispatcher
{
  constructor(
    private readonly repository: Pick<ProductActivationRepository, "recordDispatchResult">,
    private readonly tasks: ProductActivationTaskClient,
    private readonly maximumEnqueueAttemptMs: number,
  ) {}

  async dispatch(
    payload: ProductActivationDispatchPayload,
  ): Promise<ProductActivationDispatchResult> {
    const result = await this.dispatchWithOutcome(payload);
    return result.durableResult;
  }

  async dispatchWithOutcome(
    payload: ProductActivationDispatchPayload,
    options: { signal?: AbortSignal } = {},
  ): Promise<ProductActivationDetailedDispatchResult> {
    const parsed = productActivationDispatchPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProductActivationError(
        400,
        "product_activation_dispatch_invalid",
        "The product activation dispatch is invalid.",
      );
    }

    const deadline = createDispatchDeadline(this.maximumEnqueueAttemptMs, options.signal);
    try {
      assertWithinDeadline(deadline.signal);
      return await raceWithDeadline(
        this.dispatchWithinDeadline(parsed.data, deadline.signal),
        deadline.signal,
      );
    } finally {
      deadline.dispose();
    }
  }

  private async dispatchWithinDeadline(
    payload: ProductActivationDispatchPayload,
    signal: AbortSignal,
  ): Promise<ProductActivationDetailedDispatchResult> {
    assertWithinDeadline(signal);
    const firstCreate = await this.tasks.create(payload);
    assertWithinDeadline(signal);
    if (firstCreate === "created") return this.record(payload, "dispatched", "created", signal);
    if (firstCreate === "already_exists") {
      return this.record(payload, "dispatched", "already_exists", signal);
    }
    if (firstCreate === "definitive_failure") {
      return this.record(payload, "failed", "definitive_failure", signal);
    }

    const firstLookup = await this.tasks.lookup(payload);
    assertWithinDeadline(signal);
    if (firstLookup === "exists") {
      return this.record(payload, "dispatched", "found_after_ambiguous_create", signal);
    }
    if (firstLookup === "unknown") throw activationUnavailable();

    const secondCreate = await this.tasks.create(payload);
    assertWithinDeadline(signal);
    if (secondCreate === "created") return this.record(payload, "dispatched", "created", signal);
    if (secondCreate === "already_exists") {
      return this.record(payload, "dispatched", "found_after_ambiguous_create", signal);
    }
    if (secondCreate === "definitive_failure") {
      return this.record(payload, "failed", "definitive_failure", signal);
    }

    const finalLookup = await this.tasks.lookup(payload);
    assertWithinDeadline(signal);
    if (finalLookup === "exists") {
      return this.record(payload, "dispatched", "found_after_ambiguous_create", signal);
    }
    if (finalLookup === "absent") {
      return this.record(payload, "failed", "definitive_failure", signal);
    }
    throw activationUnavailable();
  }

  private async record(
    payload: ProductActivationDispatchPayload,
    result: "dispatched" | "failed",
    taskOutcome: ProductActivationTaskOutcome,
    signal: AbortSignal,
  ): Promise<ProductActivationDetailedDispatchResult> {
    assertWithinDeadline(signal);
    const durableResult = await this.repository.recordDispatchResult({ ...payload, result });
    return { durableResult, taskOutcome };
  }
}

export function productActivationTaskId(payload: ProductActivationDispatchPayload): string {
  return `product-activation-${payload.runId}-${payload.dispatchGeneration}`;
}

function readGrpcStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "number" ? error.code : null;
}

function isAmbiguousCreateStatus(code: number | null): boolean {
  return (
    code === null ||
    code === grpcStatus.CANCELLED ||
    code === grpcStatus.UNKNOWN ||
    code === grpcStatus.DEADLINE_EXCEEDED ||
    code === grpcStatus.ABORTED ||
    code === grpcStatus.INTERNAL ||
    code === grpcStatus.UNAVAILABLE
  );
}

function assertWithinDeadline(signal: AbortSignal): void {
  if (signal.aborted) throw activationUnavailable();
}

function createDispatchDeadline(
  maximumEnqueueAttemptMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, maximumEnqueueAttemptMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abort);
      abort();
    },
  };
}

async function raceWithDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw activationUnavailable();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(activationUnavailable()));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function activationUnavailable(): ProductActivationError {
  return new ProductActivationError(
    503,
    "product_moderation_activation_unavailable",
    "Product activation could not be dispatched.",
  );
}
