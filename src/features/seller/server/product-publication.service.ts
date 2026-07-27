import type { ProductPublicationDispatcher } from "./product-publication.dispatcher";
import type {
  ProductPublicationAuthorizationInput,
  ProductPublicationAuthorizationResult,
  ProductPublicationRepository,
  ProductPublicationRetryResult,
} from "./product-publication.repository";
import {
  productPublicationRetryAllowed,
  type ProductPublicationRun,
} from "./product-publication.types";

export type ProductPublicationSnapshot = ProductPublicationRun & {
  retryAllowed: boolean;
};

export class ProductPublicationService {
  constructor(
    private readonly repository: ProductPublicationRepository,
    private readonly dispatcher: ProductPublicationDispatcher,
    private readonly reconcileCleanup: (productDraftId: string) => Promise<boolean> = async () =>
      false,
    private readonly cleanupRetryAvailable = false,
  ) {}

  async authorize(
    input: ProductPublicationAuthorizationInput,
  ): Promise<
    | ProductPublicationAuthorizationResult
    | { result: "dispatch_failed"; snapshot: ProductPublicationSnapshot }
  > {
    const result = await this.repository.authorize(input);
    if (
      result.result !== "pending" &&
      !(result.result === "in_progress" && result.status === "pending")
    ) {
      return result;
    }

    try {
      await this.dispatcher.dispatch(result.productDraftId);
      return result;
    } catch {
      await this.repository.markDispatchFailed(result.productDraftId);
      const snapshot = await this.get(result.productDraftId);
      if (!snapshot) throw new Error("Product publication run disappeared after dispatch failure.");
      return { result: "dispatch_failed", snapshot };
    }
  }

  async retry(
    productDraftId: string,
    sellerId: string,
  ): Promise<
    | ProductPublicationRetryResult
    | { result: "dispatch_failed"; snapshot: ProductPublicationSnapshot }
  > {
    let result = await this.repository.retry(productDraftId, sellerId);
    if (result === "cleanup_required" && (await this.reconcileCleanup(productDraftId))) {
      result = await this.repository.retry(productDraftId, sellerId);
    }
    if (result === "noop") {
      const current = await this.repository.getRun(productDraftId);
      if (current?.status !== "pending") return result;
      result = "requeued";
    }
    if (result !== "requeued") return result;

    try {
      await this.dispatcher.dispatch(productDraftId);
      return result;
    } catch {
      await this.repository.markDispatchFailed(productDraftId);
      const snapshot = await this.get(productDraftId);
      if (!snapshot) throw new Error("Product publication run disappeared after retry dispatch.");
      return { result: "dispatch_failed", snapshot };
    }
  }

  async get(productDraftId: string): Promise<ProductPublicationSnapshot | null> {
    const run = await this.repository.getRun(productDraftId);
    return run
      ? {
          ...run,
          retryAllowed:
            (run.status === "failed" && productPublicationRetryAllowed(run.errorCode)) ||
            (run.status === "cleanup_required" && this.cleanupRetryAvailable),
        }
      : null;
  }
}
