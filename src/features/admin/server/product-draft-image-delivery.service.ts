import { PRODUCT_DRAFT_IMAGE_BUCKET } from "./destination-image-storage";
import type {
  ProductDraftImageDeliveryRecord,
  ProductDraftImageDeliveryRepository,
} from "./product-draft-image-delivery.repository";
import {
  ProductDraftImageDeliveryStorageError,
  type ProductDraftImageDeliveryStorage,
} from "./product-draft-image-delivery.storage";
import {
  parseProductDraftImageDeliveryInput,
  PRODUCT_DRAFT_IMAGE_DELIVERY_CONCURRENCY,
  PRODUCT_DRAFT_IMAGE_DELIVERY_OPERATION_TIMEOUT_MS,
  PRODUCT_DRAFT_IMAGE_DELIVERY_REQUEST_TIMEOUT_MS,
  PRODUCT_DRAFT_IMAGE_SIGNED_URL_LIFETIME_SECONDS,
  productDraftImageDeliveryUnavailable,
  productDraftNotFound,
  type ConfirmedPrototypeAdministratorContext,
  type ProductDraftImageDeliveryErrorCode,
  type ProductDraftImageDeliveryInput,
  type ProductDraftImageDeliveryResponse,
  type ProductDraftImageDeliveryResult,
} from "./product-draft-image-delivery.types";
import { PrototypeAdministratorError } from "./prototype-administrator-access";

export type ProductDraftImageDeliveryLogger = {
  error(
    event: "product_draft_image_delivery_image_unavailable",
    context: {
      productDraftId: string;
      imageId: string;
      errorCode: ProductDraftImageDeliveryErrorCode;
      exceptionClass?: string;
    },
  ): void;
};

export type ProductDraftImageDeliveryServiceOptions = {
  concurrency?: number;
  operationTimeoutMs?: number;
  requestTimeoutMs?: number;
  signedUrlLifetimeSeconds?: number;
  now?: () => number;
  logger?: ProductDraftImageDeliveryLogger;
};

type DeliveryTask = {
  key: string;
  record: ProductDraftImageDeliveryRecord;
};

const consoleLogger: ProductDraftImageDeliveryLogger = {
  error(event, context) {
    console.error(`[ProductDraft image delivery] ${event}`, context);
  },
};

export class ProductDraftImageDeliveryEngine {
  private readonly concurrency: number;
  private readonly operationTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly signedUrlLifetimeSeconds: number;
  private readonly now: () => number;
  private readonly logger: ProductDraftImageDeliveryLogger;

  constructor(
    private readonly repository: ProductDraftImageDeliveryRepository,
    private readonly storage: ProductDraftImageDeliveryStorage,
    options: ProductDraftImageDeliveryServiceOptions = {},
  ) {
    this.concurrency = options.concurrency ?? PRODUCT_DRAFT_IMAGE_DELIVERY_CONCURRENCY;
    this.operationTimeoutMs =
      options.operationTimeoutMs ?? PRODUCT_DRAFT_IMAGE_DELIVERY_OPERATION_TIMEOUT_MS;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? PRODUCT_DRAFT_IMAGE_DELIVERY_REQUEST_TIMEOUT_MS;
    this.signedUrlLifetimeSeconds =
      options.signedUrlLifetimeSeconds ?? PRODUCT_DRAFT_IMAGE_SIGNED_URL_LIFETIME_SECONDS;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? consoleLogger;
  }

  async resolve(input: unknown): Promise<ProductDraftImageDeliveryResponse> {
    const controller = new AbortController();
    let deadlineReached = false;
    const deadline = setTimeout(() => {
      deadlineReached = true;
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      const entries = parseProductDraftImageDeliveryInput(input);
      const result = await this.resolveEntries(entries, controller);
      if (deadlineReached) throw productDraftImageDeliveryUnavailable();
      return result;
    } catch (error) {
      if (
        deadlineReached ||
        (error instanceof ProductDraftImageDeliveryStorageError &&
          error.failure === "service_unavailable")
      ) {
        controller.abort();
        throw productDraftImageDeliveryUnavailable();
      }
      throw error;
    } finally {
      clearTimeout(deadline);
    }
  }

  private async resolveEntries(
    entries: ProductDraftImageDeliveryInput,
    controller: AbortController,
  ): Promise<ProductDraftImageDeliveryResponse> {
    const productDraftIds = entries.map((entry) => entry.productDraftId);
    const imageIds = [...new Set(entries.flatMap((entry) => entry.imageIds))];
    const data = await this.repository.load(productDraftIds, imageIds, controller.signal);

    if (
      productDraftIds.some((productDraftId) => !data.existingProductDraftIds.has(productDraftId))
    ) {
      throw productDraftNotFound();
    }

    const recordByPair = new Map(
      data.images.map((record) => [pairKey(record.productDraftId, record.imageId), record]),
    );
    const resultByPair = new Map<string, ProductDraftImageDeliveryResult>();
    const tasks: DeliveryTask[] = [];

    for (const entry of entries) {
      for (const imageId of entry.imageIds) {
        const key = pairKey(entry.productDraftId, imageId);
        const record = recordByPair.get(key);
        if (!record) {
          resultByPair.set(key, stateResult(imageId, null, "missing"));
          continue;
        }

        const immediate = this.resolveWithoutStorage(record);
        if (immediate) {
          resultByPair.set(key, immediate);
        } else {
          tasks.push({ key, record });
        }
      }
    }

    const taskResults = await runWithConcurrency(
      tasks,
      this.concurrency,
      controller,
      async (task) =>
        [task.key, await this.deliverAvailableImage(task.record, controller.signal)] as const,
    );
    for (const [key, result] of taskResults) resultByPair.set(key, result);

    return {
      entries: entries.map((entry) => ({
        productDraftId: entry.productDraftId,
        images: entry.imageIds.map((imageId) => {
          const result = resultByPair.get(pairKey(entry.productDraftId, imageId));
          if (!result) {
            throw new Error("ProductDraft image delivery result was not produced.");
          }
          return result;
        }),
      })),
    };
  }

  private resolveWithoutStorage(
    record: ProductDraftImageDeliveryRecord,
  ): ProductDraftImageDeliveryResult | null {
    if (record.status === "pending") {
      return stateResult(record.imageId, "pending", "pending");
    }
    if (record.status === "failed") {
      return stateResult(record.imageId, "failed", "failed");
    }

    if (record.reconciliationStatus && record.reconciliationStatus !== "completed") {
      return this.unavailable(
        record,
        persistedReconciliationError(record.reconciliationStatus, record.reconciliationErrorCode),
      );
    }
    if (
      record.storageBucket !== PRODUCT_DRAFT_IMAGE_BUCKET ||
      record.contentType !== "image/jpeg" ||
      record.sizeBytes === null
    ) {
      return this.unavailable(record, "private_object_conflict");
    }
    return null;
  }

  private async deliverAvailableImage(
    record: ProductDraftImageDeliveryRecord,
    signal: AbortSignal,
  ): Promise<ProductDraftImageDeliveryResult> {
    try {
      const info = await withOperationTimeout(signal, this.operationTimeoutMs, (operationSignal) =>
        this.storage.getInfo(record.destinationKey, operationSignal),
      );
      if (!info) return this.unavailable(record, "private_object_missing");
      if (info.contentType !== record.contentType || info.sizeBytes !== record.sizeBytes) {
        return this.unavailable(record, "private_object_conflict");
      }

      const url = await withOperationTimeout(signal, this.operationTimeoutMs, (operationSignal) =>
        this.storage.createSignedUrl(
          record.destinationKey,
          this.signedUrlLifetimeSeconds,
          operationSignal,
        ),
      );
      return {
        imageId: record.imageId,
        durableStatus: "available",
        deliveryStatus: "available",
        deliveryErrorCode: null,
        url,
        expiresAt: new Date(this.now() + this.signedUrlLifetimeSeconds * 1000).toISOString(),
      };
    } catch (error) {
      if (!(error instanceof ProductDraftImageDeliveryStorageError)) throw error;
      if (error.failure === "service_unavailable") throw error;

      return this.unavailable(
        record,
        error.failure === "object_missing"
          ? "private_object_missing"
          : error.failure === "object_conflict"
            ? "private_object_conflict"
            : "private_object_signing_failed",
        error,
      );
    }
  }

  private unavailable(
    record: ProductDraftImageDeliveryRecord,
    errorCode: ProductDraftImageDeliveryErrorCode,
    error?: unknown,
  ): ProductDraftImageDeliveryResult {
    this.logger.error("product_draft_image_delivery_image_unavailable", {
      productDraftId: record.productDraftId,
      imageId: record.imageId,
      errorCode,
      ...(error
        ? {
            exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
          }
        : {}),
    });
    return {
      imageId: record.imageId,
      durableStatus: record.status,
      deliveryStatus: "unavailable",
      deliveryErrorCode: errorCode,
      url: null,
      expiresAt: null,
    };
  }
}

export class ProductDraftImageDeliveryService {
  constructor(private readonly engine: Pick<ProductDraftImageDeliveryEngine, "resolve">) {}

  async resolve(
    input: unknown,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<ProductDraftImageDeliveryResponse> {
    assertConfirmedAdministrator(authorization);
    return this.engine.resolve(input);
  }
}

function assertConfirmedAdministrator(authorization: ConfirmedPrototypeAdministratorContext): void {
  if (authorization.prototypeAdministrator !== true) {
    throw new PrototypeAdministratorError(
      403,
      "prototype_administrator_required",
      "Prototype administrator access is required.",
    );
  }
}

function stateResult(
  imageId: string,
  durableStatus: ProductDraftImageDeliveryResult["durableStatus"],
  deliveryStatus: "pending" | "failed" | "missing",
): ProductDraftImageDeliveryResult {
  return {
    imageId,
    durableStatus,
    deliveryStatus,
    deliveryErrorCode: null,
    url: null,
    expiresAt: null,
  };
}

function persistedReconciliationError(
  status: ProductDraftImageDeliveryRecord["reconciliationStatus"],
  errorCode: string | null,
): ProductDraftImageDeliveryErrorCode {
  if (status === "failed" && errorCode) {
    return errorCode as ProductDraftImageDeliveryErrorCode;
  }
  return "private_object_conflict";
}

function pairKey(productDraftId: string, imageId: string): string {
  return `${productDraftId}:${imageId}`;
}

async function runWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  controller: AbortController,
  operation: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) return [];
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      if (controller.signal.aborted) {
        throw new ProductDraftImageDeliveryStorageError(
          "service_unavailable",
          "ProductDraft image delivery was cancelled.",
        );
      }
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index]!);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  try {
    await Promise.all(workers);
  } catch (error) {
    controller.abort();
    await Promise.allSettled(workers);
    throw error;
  }
  return results;
}

function withOperationTimeout<TResult>(
  requestSignal: AbortSignal,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<TResult>,
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      requestSignal.removeEventListener("abort", abort);
      callback();
    };
    const unavailable = () =>
      new ProductDraftImageDeliveryStorageError(
        "service_unavailable",
        "ProductDraft image delivery operation timed out or was cancelled.",
      );
    const abort = () => {
      controller.abort();
      finish(() => reject(unavailable()));
    };
    const timeout = setTimeout(abort, timeoutMs);

    requestSignal.addEventListener("abort", abort, { once: true });
    if (requestSignal.aborted) {
      abort();
      return;
    }

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (result) => finish(() => resolve(result)),
        (error) => finish(() => reject(error)),
      );
  });
}
