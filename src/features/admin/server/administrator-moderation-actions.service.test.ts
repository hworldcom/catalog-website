import { describe, expect, it, vi } from "vitest";

import type { PrototypeAdministratorRequestContext } from "../prototype-administrator.middleware";
import { AdministratorModerationActionsService } from "./administrator-moderation-actions.service";
import type { ProductActivationRepository } from "./product-activation.repository";
import {
  ProductActivationError,
  type ProductActivationDispatchResult,
  type ProductActivationRecoveryResult,
} from "./product-activation.types";

const authorization = {
  userId: uuid(1),
  prototypeAdministrator: true,
} as PrototypeAdministratorRequestContext;

describe("AdministratorModerationActionsService", () => {
  it("verifies seller identity, records the decision, and returns fresh detail", async () => {
    const current = sellerDetail(uuid(2));
    const fresh = sellerDetail(uuid(2), "approved");
    const details = {
      getSeller: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(fresh),
      getProduct: vi.fn(),
    };
    const decideSeller = vi.fn(async () => ({ submission: { id: uuid(3) } }));
    const service = serviceFixture({ details, decideSeller });

    const result = await service.decideSeller(
      {
        sellerId: uuid(2),
        submissionId: uuid(3),
        expectedRevision: 4,
        decision: "approve",
        reason: null,
        requestId: uuid(5),
      },
      authorization,
    );

    expect(decideSeller).toHaveBeenCalledWith({
      authorization,
      sellerId: uuid(2),
      submissionId: uuid(3),
      expectedRevision: 4,
      decision: "approve",
      reason: null,
      requestId: uuid(5),
    });
    expect(result).toMatchObject({ dispatch: null, detail: fresh });
  });

  it.each([
    ["seller_approval_submission_invalid", 400],
    ["seller_approval_submission_conflict", 409],
    ["seller_profile_revision_conflict", 409],
    ["seller_profile_slug_conflict", 409],
    ["seller_approval_required", 409],
    ["seller_approval_not_found", 404],
    ["seller_profile_image_not_ready", 409],
  ] as const)(
    "transports stable seller failure %s as a typed action error",
    async (code, statusCode) => {
      const service = serviceFixture({
        decideSeller: vi.fn(async () => {
          throw new Error(code);
        }),
      });

      await expect(
        service.decideSeller(
          {
            sellerId: uuid(2),
            submissionId: uuid(3),
            expectedRevision: 4,
            decision: "approve",
            reason: null,
            requestId: uuid(5),
          },
          authorization,
        ),
      ).rejects.toMatchObject({
        name: "AdministratorSellerModerationActionError",
        code,
        statusCode,
      });
    },
  );

  it("hides seller and activation route mismatches as submission not found", async () => {
    const decideSeller = vi.fn();
    const repository = activationRepository();
    const sellerService = serviceFixture({
      details: {
        getSeller: vi.fn(async () => sellerDetail(uuid(99))),
        getProduct: vi.fn(),
      },
      decideSeller,
      repository,
    });

    await expect(
      sellerService.decideSeller(
        {
          sellerId: uuid(2),
          submissionId: uuid(3),
          expectedRevision: 1,
          decision: "approve",
          reason: null,
          requestId: uuid(5),
        },
        authorization,
      ),
    ).rejects.toMatchObject({ code: "moderation_submission_not_found", statusCode: 404 });
    expect(decideSeller).not.toHaveBeenCalled();

    const activationService = serviceFixture({
      details: {
        getSeller: vi.fn(),
        getProduct: vi.fn(async () => productDetail(uuid(77))),
      },
      repository,
    });
    await expect(
      activationService.retryActivation(recoveryRequest(), authorization),
    ).rejects.toMatchObject({ code: "moderation_submission_not_found", statusCode: 404 });
    expect(repository.retryActivation).not.toHaveBeenCalled();
  });

  it("commits product approval, dispatches it, and returns the fresh detail", async () => {
    const current = productDetail(uuid(6));
    const fresh = productDetail(uuid(6), "approved");
    const repository = activationRepository({
      decide: vi.fn<ProductActivationRepository["decide"]>(async () => ({
        result: "decided",
        submissionId: uuid(4),
        productId: uuid(8),
        sellerId: uuid(2),
        reviewStatus: "approved",
        revision: 3,
        activationRunId: uuid(6),
        dispatchGeneration: 1,
        dispatchRequired: true,
      })),
    });
    const dispatcher = { dispatch: vi.fn(async () => dispatched()) };
    const service = serviceFixture({
      details: {
        getSeller: vi.fn(),
        getProduct: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(fresh),
      },
      repository,
      dispatcher,
    });

    const result = await service.decideProduct(
      {
        submissionId: uuid(4),
        expectedRevision: 3,
        decision: "approve",
        reason: null,
        requestId: uuid(5),
      },
      authorization,
    );

    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      runId: uuid(6),
      dispatchGeneration: 1,
    });
    expect(result.detail).toBe(fresh);
  });

  it("returns a fresh detail for a known stale dispatch result", async () => {
    const repository = activationRepository({
      retryDispatch: vi.fn<ProductActivationRepository["retryDispatch"]>(async () => ({
        ...dispatched(),
        result: "stale",
        dispatchGeneration: 3,
      })),
    });
    const dispatcher = { dispatch: vi.fn(async () => dispatched()) };
    const service = serviceFixture({ repository, dispatcher });

    const result = await service.retryDispatch(recoveryRequest(), authorization);

    expect(result.dispatch.result).toBe("stale");
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(result.detail.kind).toBe("product");
  });

  it("uses the administrator cleanup operation and preserves stable recovery conflicts", async () => {
    const repository = activationRepository({
      retryAdministratorPostSwitchCleanup: vi.fn(async () => recovery()),
    });
    const service = serviceFixture({ repository });

    await service.retryPostSwitchCleanup(recoveryRequest(), authorization);
    expect(repository.retryAdministratorPostSwitchCleanup).toHaveBeenCalledWith({
      runId: uuid(6),
      expectedDispatchGeneration: 2,
      requestId: uuid(7),
      administratorUserId: authorization.userId,
    });

    const conflict = new ProductActivationError(
      409,
      "product_moderation_revision_conflict",
      "The product moderation revision changed.",
    );
    repository.retryActivation = vi.fn(async () => {
      throw conflict;
    });
    await expect(service.retryActivation(recoveryRequest(), authorization)).rejects.toBe(conflict);
  });

  it("maps unknown post-write outcomes to moderation unavailable", async () => {
    const logger = { error: vi.fn() };
    const service = serviceFixture({
      repository: activationRepository({
        decide: vi.fn(async () => {
          throw new Error("connection reset");
        }),
      }),
      logger,
    });

    await expect(
      service.decideProduct(
        {
          submissionId: uuid(4),
          expectedRevision: 3,
          decision: "approve",
          reason: null,
          requestId: uuid(5),
        },
        authorization,
      ),
    ).rejects.toMatchObject({ code: "moderation_unavailable", statusCode: 503 });
    expect(logger.error).toHaveBeenCalledWith(
      "administrator_moderation_write_failed",
      expect.objectContaining({ operation: "product_decision" }),
    );
  });
});

function serviceFixture(
  overrides: {
    details?: { getSeller: ReturnType<typeof vi.fn>; getProduct: ReturnType<typeof vi.fn> };
    decideSeller?: ReturnType<typeof vi.fn>;
    repository?: ProductActivationRepository;
    dispatcher?: { dispatch: ReturnType<typeof vi.fn> };
    logger?: { error: ReturnType<typeof vi.fn> };
  } = {},
): AdministratorModerationActionsService {
  return new AdministratorModerationActionsService(
    (overrides.details ?? {
      getSeller: vi.fn(async () => sellerDetail(uuid(2))),
      getProduct: vi.fn(async () => productDetail(uuid(6))),
    }) as never,
    (overrides.decideSeller ?? vi.fn(async () => ({ submission: { id: uuid(3) } }))) as never,
    {
      repository: overrides.repository ?? activationRepository(),
      dispatcher: (overrides.dispatcher ?? { dispatch: vi.fn(async () => dispatched()) }) as never,
    },
    overrides.logger as never,
  );
}

function activationRepository(
  overrides: Partial<ProductActivationRepository> = {},
): ProductActivationRepository {
  return {
    decide: vi.fn(),
    recordDispatchResult: vi.fn(),
    retryDispatch: vi.fn(async () => ({ ...dispatched(), dispatchRequired: false })),
    retryActivation: vi.fn(async () => recovery()),
    requestAbandonment: vi.fn(),
    retryCleanup: vi.fn(),
    retryAdministratorPostSwitchCleanup: vi.fn(async () => recovery()),
    claimRun: vi.fn(),
    continueCleanup: vi.fn(),
    recordObjectCreated: vi.fn(),
    verifyItem: vi.fn(),
    failAttempt: vi.fn(),
    failWorkerStart: vi.fn(),
    finalize: vi.fn(),
    recordCleanupItemResult: vi.fn(),
    finalizeCleanup: vi.fn(),
    listRecoverableDispatches: vi.fn(),
    ...overrides,
  } as ProductActivationRepository;
}

function sellerDetail(sellerId: string, reviewStatus = "pending") {
  return {
    kind: "seller",
    request: { submissionId: uuid(3), seller: { sellerId }, reviewStatus },
  } as never;
}

function productDetail(runId: string, reviewStatus = "pending") {
  return {
    kind: "product",
    request: {
      submissionId: uuid(4),
      seller: { sellerId: uuid(2) },
      reviewStatus,
      activation: { runId },
    },
  } as never;
}

function recoveryRequest() {
  return {
    submissionId: uuid(4),
    runId: uuid(6),
    expectedDispatchGeneration: 2,
    requestId: uuid(7),
  };
}

function dispatched(): ProductActivationDispatchResult {
  return {
    result: "recorded",
    runId: uuid(6),
    dispatchGeneration: 1,
    dispatchStatus: "dispatched",
    dispatchRequired: false,
  };
}

function recovery(): ProductActivationRecoveryResult {
  return {
    result: "recorded",
    runId: uuid(6),
    productId: uuid(8),
    sellerId: uuid(2),
    phase: "post_switch_cleanup",
    status: "pending",
    dispatchGeneration: 3,
    dispatchStatus: "pending",
    dispatchRequired: false,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
