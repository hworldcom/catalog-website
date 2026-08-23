import { describe, expect, it, vi } from "vitest";

import type { ProductActivationDispatcher } from "@/features/admin/server/product-activation.dispatcher";
import type { ProductActivationRepository } from "@/features/admin/server/product-activation.repository";
import type {
  ProductActivationDispatchResult,
  ProductActivationRecoveryResult,
} from "@/features/admin/server/product-activation.types";

import type { ProductModerationStatusDetail } from "../product-moderation-status.types";
import type {
  ProductModerationRequester,
  ProductModerationService,
} from "./product-moderation.service";
import type { ProductModerationSellerActionsRepository } from "./product-moderation-seller-actions.repository";
import { ProductModerationSellerActionsService } from "./product-moderation-seller-actions.service";

const sellerId = uuid(1);
const userId = uuid(2);
const productId = uuid(3);
const submissionId = uuid(4);
const runId = uuid(5);
const requestId = uuid(6);

describe("ProductModerationSellerActionsService", () => {
  it("resolves seller ownership before idempotently beginning an edit", async () => {
    const calls: string[] = [];
    const requester = requesterFixture(calls);
    const resources = resourceFixture(calls);
    resources.beginEditing = vi.fn(async () => {
      calls.push("begin");
      return { productId, moderationRevision: 8, editSource: "working_copy" as const };
    });
    const service = actionService({ requester, resources });

    await expect(service.beginEditing({ userId, productId })).resolves.toEqual({
      productId,
      moderationRevision: 8,
      editSource: "working_copy",
    });
    expect(calls).toEqual(["requester", "identity", "begin"]);
  });

  it("hides cross-product submissions before invoking withdrawal", async () => {
    const resources = resourceFixture([], { submissionOwned: false });
    const moderation = moderationFixture();
    const service = actionService({ resources, moderation });

    await expect(
      service.withdraw({
        userId,
        productId,
        submissionId,
        expectedModerationRevision: 8,
        requestId,
      }),
    ).rejects.toMatchObject({ code: "product_moderation_not_found", statusCode: 404 });
    expect(moderation.withdrawForSeller).not.toHaveBeenCalled();
  });

  it("does not precheck action flags before replay-safe submission", async () => {
    const moderation = moderationFixture();
    const statusReader = { get: vi.fn(async () => statusDetail()) };
    const service = actionService({ moderation, statusReader });

    await service.submit({
      userId,
      productId,
      expectedModerationRevision: 8,
      requestId,
    });
    await service.submit({
      userId,
      productId,
      expectedModerationRevision: 8,
      requestId,
    });

    expect(moderation.submitForSeller).toHaveBeenCalledTimes(2);
    expect(statusReader.get).toHaveBeenCalledTimes(2);
  });

  it("dispatches seller abandonment and returns the refreshed durable failure", async () => {
    const calls: string[] = [];
    const activation = activationFixture(calls);
    const statusReader = {
      get: vi.fn(async () => {
        calls.push("status");
        return statusDetail({ activation: { displayState: "dispatch_failed" } as never });
      }),
    };
    const service = actionService({
      requester: requesterFixture(calls),
      resources: resourceFixture(calls),
      activation,
      statusReader,
    });

    const result = await service.abandonFailedActivation({
      userId,
      productId,
      runId,
      expectedDispatchGeneration: 1,
      requestId,
    });

    expect(calls).toEqual(["requester", "identity", "recover", "dispatch", "status"]);
    expect(activation.dispatcher.dispatch).toHaveBeenCalledWith({
      runId,
      dispatchGeneration: 2,
    });
    expect(result.moderationStatus.activation?.displayState).toBe("dispatch_failed");
  });

  it("does not expose cleanup recovery for a cross-product run", async () => {
    const resources = resourceFixture([], { runOwned: false });
    const activation = activationFixture([]);
    const service = actionService({ resources, activation });

    await expect(
      service.retryAbandonmentCleanup({
        userId,
        productId,
        runId,
        expectedDispatchGeneration: 2,
        requestId,
      }),
    ).rejects.toMatchObject({ code: "product_moderation_not_found" });
    expect(activation.repository.retryCleanup).not.toHaveBeenCalled();
  });

  it("maps requester lookup failures before service-role resource reads", async () => {
    const resources = resourceFixture([]);
    const requester = requesterFixture([], new Error("requester unavailable"));
    const service = actionService({ requester, resources });

    await expect(service.beginEditing({ userId, productId })).rejects.toMatchObject({
      code: "product_moderation_unavailable",
    });
    expect(resources.readIdentity).not.toHaveBeenCalled();
  });
});

function actionService(
  overrides: {
    requester?: ProductModerationRequester;
    resources?: ProductModerationSellerActionsRepository;
    moderation?: Pick<ProductModerationService, "submitForSeller" | "withdrawForSeller">;
    statusReader?: {
      get(productId: string, sellerId: string): Promise<ProductModerationStatusDetail>;
    };
    activation?: {
      repository: ProductActivationRepository;
      dispatcher: ProductActivationDispatcher;
    };
  } = {},
) {
  return new ProductModerationSellerActionsService(
    overrides.requester ?? requesterFixture([]),
    overrides.resources ?? resourceFixture([]),
    overrides.moderation ?? moderationFixture(),
    async () => overrides.statusReader ?? { get: vi.fn(async () => statusDetail()) },
    async () => overrides.activation ?? activationFixture([]),
  );
}

function requesterFixture(calls: string[], failure?: Error): ProductModerationRequester {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            calls.push("requester");
            if (failure) return { data: null, error: { message: failure.message } };
            return { data: { id: sellerId }, error: null };
          }),
        })),
      })),
    })),
  };
}

function resourceFixture(
  calls: string[],
  identity: Partial<{ productOwned: boolean; submissionOwned: boolean; runOwned: boolean }> = {},
): ProductModerationSellerActionsRepository {
  return {
    readIdentity: vi.fn(async () => {
      calls.push("identity");
      return {
        productOwned: true,
        submissionOwned: true,
        runOwned: true,
        ...identity,
      };
    }),
    beginEditing: vi.fn(async () => ({
      productId,
      moderationRevision: 8,
      editSource: "working_copy" as const,
    })),
  };
}

function moderationFixture(): Pick<
  ProductModerationService,
  "submitForSeller" | "withdrawForSeller"
> {
  return {
    submitForSeller: vi.fn(async () => ({}) as never),
    withdrawForSeller: vi.fn(async () => ({}) as never),
  };
}

function activationFixture(calls: string[]) {
  const repository = {
    requestAbandonment: vi.fn(async () => {
      calls.push("recover");
      return recovery();
    }),
    retryCleanup: vi.fn(async () => {
      calls.push("recover");
      return recovery({ phase: "pre_switch_cleanup" });
    }),
  } as unknown as ProductActivationRepository;
  const dispatcher: ProductActivationDispatcher = {
    dispatch: vi.fn(async () => {
      calls.push("dispatch");
      return dispatchFailure();
    }),
  };
  return { repository, dispatcher };
}

function recovery(
  overrides: Partial<ProductActivationRecoveryResult> = {},
): ProductActivationRecoveryResult {
  return {
    result: "recorded",
    runId,
    productId,
    sellerId,
    phase: "pre_switch_cleanup",
    status: "pending",
    dispatchGeneration: 2,
    dispatchStatus: "pending",
    dispatchRequired: true,
    ...overrides,
  };
}

function dispatchFailure(): ProductActivationDispatchResult {
  return {
    result: "recorded",
    runId,
    dispatchGeneration: 2,
    dispatchStatus: "failed",
    dispatchRequired: false,
  };
}

function statusDetail(overrides: Partial<ProductModerationStatusDetail> = {}) {
  return {
    productId,
    publicState: "published",
    marketplaceVisibility: "visible",
    actionRevision: 8,
    hasWorkingCopy: true,
    review: null,
    activation: null,
    actions: {
      canEdit: true,
      canSubmit: true,
      canWithdraw: false,
      canAbandonFailedActivation: false,
      canRetryAbandonmentCleanup: false,
      canArchive: true,
      canRestore: false,
    },
    submittedRevision: null,
    ...overrides,
  } satisfies ProductModerationStatusDetail;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
