import { describe, expect, it, vi } from "vitest";

import type { ProductPublicationDispatcher } from "./product-publication.dispatcher";
import type {
  ProductPublicationAuthorizationInput,
  ProductPublicationRepository,
} from "./product-publication.repository";
import { ProductPublicationService } from "./product-publication.service";
import type { ProductPublicationRun } from "./product-publication.types";

describe("ProductPublicationService", () => {
  it("dispatches only after durable authorization returns pending", async () => {
    const repository = repositoryMock();
    const dispatcher = dispatcherMock();
    const service = new ProductPublicationService(repository, dispatcher);

    await expect(service.authorize(authorization())).resolves.toMatchObject({
      result: "pending",
    });
    expect(repository.authorize).toHaveBeenCalledBefore(dispatcher.dispatch);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(uuid(1));
  });

  it("marks a still-pending run failed when dispatch cannot be confirmed", async () => {
    const repository = repositoryMock();
    const dispatcher = dispatcherMock();
    dispatcher.dispatch.mockRejectedValueOnce(new Error("schedule unavailable"));
    const service = new ProductPublicationService(repository, dispatcher);

    await expect(service.authorize(authorization())).resolves.toMatchObject({
      result: "dispatch_failed",
      snapshot: {
        status: "failed",
        errorCode: "product_publication_dispatch_failed",
        retryAllowed: true,
      },
    });
    expect(repository.markDispatchFailed).toHaveBeenCalledWith(uuid(1));
  });

  it("does not dispatch an idempotent authorization once a worker is running", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.authorize).mockResolvedValueOnce({
      result: "in_progress",
      productDraftId: uuid(1),
      status: "running",
    });
    const dispatcher = dispatcherMock();

    await expect(
      new ProductPublicationService(repository, dispatcher).authorize(authorization()),
    ).resolves.toMatchObject({ result: "in_progress" });
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("redispatches an idempotent pending authorization after a request interruption", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.authorize).mockResolvedValueOnce({
      result: "in_progress",
      productDraftId: uuid(1),
      status: "pending",
    });
    const dispatcher = dispatcherMock();

    await expect(
      new ProductPublicationService(repository, dispatcher).authorize(authorization()),
    ).resolves.toMatchObject({ result: "in_progress", status: "pending" });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(uuid(1));
  });

  it("reconciles durable cleanup before explicitly requeueing a retry", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.retry)
      .mockResolvedValueOnce("cleanup_required")
      .mockResolvedValueOnce("requeued");
    const dispatcher = dispatcherMock();
    const reconcileCleanup = vi.fn(async () => true);
    const service = new ProductPublicationService(repository, dispatcher, reconcileCleanup);

    await expect(service.retry(uuid(1), uuid(2))).resolves.toBe("requeued");
    expect(reconcileCleanup).toHaveBeenCalledWith(uuid(1));
    expect(repository.retry).toHaveBeenCalledTimes(2);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(uuid(1));
  });

  it("redispatches a durable pending run returned as a retry no-op", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.retry).mockResolvedValueOnce("noop");
    vi.mocked(repository.getRun).mockResolvedValueOnce({
      ...run(),
      status: "pending",
      attemptToken: null,
      claimStartedAt: null,
    });
    const dispatcher = dispatcherMock();

    await expect(
      new ProductPublicationService(repository, dispatcher).retry(uuid(1), uuid(2)),
    ).resolves.toBe("requeued");
    expect(dispatcher.dispatch).toHaveBeenCalledWith(uuid(1));
  });

  it("exposes cleanup retry only when the runtime can reconcile cleanup", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.getRun).mockResolvedValue({
      ...run(),
      status: "cleanup_required",
      attemptToken: null,
      claimStartedAt: null,
      errorCode: "product_publication_cleanup_required",
    });

    await expect(
      new ProductPublicationService(repository, dispatcherMock()).get(uuid(1)),
    ).resolves.toMatchObject({ retryAllowed: false });
    await expect(
      new ProductPublicationService(repository, dispatcherMock(), async () => true, true).get(
        uuid(1),
      ),
    ).resolves.toMatchObject({ retryAllowed: true });
  });
});

function repositoryMock(): ProductPublicationRepository & {
  [key: string]: ReturnType<typeof vi.fn>;
} {
  const failedRun: ProductPublicationRun = {
    productDraftId: uuid(1),
    sellerId: uuid(2),
    status: "failed",
    attemptCount: 0,
    attemptToken: null,
    claimStartedAt: null,
    errorCode: "product_publication_dispatch_failed",
    completedAt: null,
  };
  return {
    authorize: vi.fn(async () => ({
      result: "pending" as const,
      productDraftId: uuid(1),
      status: "pending" as const,
    })),
    getRun: vi.fn(async () => failedRun),
    claimRun: vi.fn(),
    listItems: vi.fn(),
    recordObjectCreated: vi.fn(),
    clearObjectOwnership: vi.fn(),
    verifyItem: vi.fn(),
    failAttempt: vi.fn(),
    failClaimedRun: vi.fn(),
    hasPublishedImage: vi.fn(),
    completeCleanup: vi.fn(),
    finalizeCleanup: vi.fn(),
    finalize: vi.fn(),
    markDispatchFailed: vi.fn(async () => true),
    retry: vi.fn(),
  } as ProductPublicationRepository & {
    [key: string]: ReturnType<typeof vi.fn>;
  };
}

function run(): ProductPublicationRun {
  return {
    productDraftId: uuid(1),
    sellerId: uuid(2),
    status: "running",
    attemptCount: 1,
    attemptToken: uuid(9),
    claimStartedAt: new Date().toISOString(),
    errorCode: null,
    completedAt: null,
  };
}

function dispatcherMock(): ProductPublicationDispatcher & {
  dispatch: ReturnType<typeof vi.fn>;
} {
  return {
    dispatch: vi.fn(async () => "accepted" as const),
  };
}

function authorization(): ProductPublicationAuthorizationInput {
  return {
    productDraftId: uuid(1),
    sellerId: uuid(2),
    titlePatchPresent: false,
    title: null,
    descriptionPatchPresent: false,
    description: null,
    categoryId: null,
    moq: null,
    packSize: null,
    price: null,
    currency: "EUR",
    stock: "in_stock",
    coverImageUrlPatchPresent: false,
    coverImageUrl: null,
    trending: false,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
