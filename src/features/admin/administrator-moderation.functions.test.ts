import { describe, expect, it, vi } from "vitest";

import type { PrototypeAdministratorRequestContext } from "./prototype-administrator.middleware";
import {
  handleDecideAdministratorProductSubmission,
  handleDecideAdministratorSellerSubmission,
  handleGetAdministratorProductModerationRequest,
  handleGetAdministratorSellerModerationRequest,
  handleGetAdministratorNavigationContext,
  handleListAdministratorModerationRequests,
  handleRetryAdministratorProductActivation,
  handleRetryAdministratorProductActivationDispatch,
  handleRetryAdministratorProductPostSwitchCleanup,
} from "./administrator-moderation.functions";
import {
  parseAdministratorProductActivationRecovery,
  parseAdministratorProductModerationDecision,
  parseAdministratorSellerModerationDecision,
} from "./administrator-moderation.types";

const context = {
  userId: uuid(1),
  prototypeAdministrator: true,
} as PrototypeAdministratorRequestContext;

describe("administrator moderation server operations", () => {
  it("derives a minimal navigation context independently for each authenticated user", async () => {
    const dependencies = {
      isPrototypeAdministrator: vi.fn(async (userId: string) => userId === uuid(1)),
      applyResponseHeaders: vi.fn(),
      logFailure: vi.fn(),
    };

    await expect(
      handleGetAdministratorNavigationContext({ userId: uuid(1) }, dependencies),
    ).resolves.toEqual({ prototypeAdministrator: true });
    await expect(
      handleGetAdministratorNavigationContext({ userId: uuid(2) }, dependencies),
    ).resolves.toEqual({ prototypeAdministrator: false });

    expect(dependencies.isPrototypeAdministrator).toHaveBeenNthCalledWith(1, uuid(1));
    expect(dependencies.isPrototypeAdministrator).toHaveBeenNthCalledWith(2, uuid(2));
    expect(dependencies.applyResponseHeaders).toHaveBeenCalledTimes(2);
  });

  it("omits administrator navigation and logs malformed allowlist configuration", async () => {
    const failure = new Error("malformed allowlist");
    const dependencies = {
      isPrototypeAdministrator: vi.fn(async () => {
        throw failure;
      }),
      applyResponseHeaders: vi.fn(),
      logFailure: vi.fn(),
    };

    await expect(
      handleGetAdministratorNavigationContext({ userId: uuid(1) }, dependencies),
    ).resolves.toEqual({ prototypeAdministrator: false });
    expect(dependencies.logFailure).toHaveBeenCalledWith(failure);
    expect(dependencies.applyResponseHeaders).toHaveBeenCalledOnce();
  });

  it("passes confirmed administrator authorization and applies private headers", async () => {
    const events: string[] = [];
    const page = { items: [], nextCursor: null, normalizedFilters: filters() };
    const list = vi.fn(async () => {
      events.push("list");
      return page;
    });
    const dependencies = {
      createService: vi.fn(async () => {
        events.push("create");
        return { list, getSeller: vi.fn(), getProduct: vi.fn() };
      }),
      applyResponseHeaders: vi.fn(() => events.push("headers")),
    };

    await expect(
      handleListAdministratorModerationRequests(
        { ...filters(), cursor: null },
        context,
        dependencies as never,
      ),
    ).resolves.toEqual(page);
    expect(events).toEqual(["create", "list", "headers"]);
    expect(dependencies.createService).toHaveBeenCalledWith({
      userId: context.userId,
      prototypeAdministrator: true,
    });
  });

  it("keeps seller and product detail operations separate", async () => {
    const sellerDetail = { kind: "seller" as const };
    const productDetail = { kind: "product" as const };
    const getSeller = vi.fn(async () => sellerDetail);
    const getProduct = vi.fn(async () => productDetail);
    const dependencies = {
      createService: vi.fn(async () => ({ list: vi.fn(), getSeller, getProduct })),
      applyResponseHeaders: vi.fn(),
    };

    await expect(
      handleGetAdministratorSellerModerationRequest(
        { submissionId: uuid(2) },
        context,
        dependencies as never,
      ),
    ).resolves.toBe(sellerDetail);
    await expect(
      handleGetAdministratorProductModerationRequest(
        { submissionId: uuid(3) },
        context,
        dependencies as never,
      ),
    ).resolves.toBe(productDetail);

    expect(getSeller).toHaveBeenCalledWith(uuid(2));
    expect(getProduct).toHaveBeenCalledWith(uuid(3), {
      userId: context.userId,
      prototypeAdministrator: true,
    });
    expect(dependencies.applyResponseHeaders).toHaveBeenCalledTimes(2);
  });

  it("routes every write through confirmed authorization and applies private headers", async () => {
    const service = {
      decideSeller: vi.fn(async () => ({ operation: "seller" })),
      decideProduct: vi.fn(async () => ({ operation: "product" })),
      retryDispatch: vi.fn(async () => ({ operation: "dispatch" })),
      retryActivation: vi.fn(async () => ({ operation: "activation" })),
      retryPostSwitchCleanup: vi.fn(async () => ({ operation: "cleanup" })),
    };
    const dependencies = {
      createService: vi.fn(async () => service),
      applyResponseHeaders: vi.fn(),
    };
    const recovery = {
      submissionId: uuid(3),
      runId: uuid(4),
      expectedDispatchGeneration: 2,
      requestId: uuid(5),
    };

    await handleDecideAdministratorSellerSubmission(
      {
        sellerId: uuid(2),
        submissionId: uuid(3),
        expectedRevision: 1,
        decision: "approve",
        reason: null,
        requestId: uuid(5),
      },
      context,
      dependencies as never,
    );
    await handleDecideAdministratorProductSubmission(
      {
        submissionId: uuid(3),
        expectedRevision: 1,
        decision: "approve",
        reason: null,
        requestId: uuid(5),
      },
      context,
      dependencies as never,
    );
    await handleRetryAdministratorProductActivationDispatch(
      recovery,
      context,
      dependencies as never,
    );
    await handleRetryAdministratorProductActivation(recovery, context, dependencies as never);
    await handleRetryAdministratorProductPostSwitchCleanup(
      recovery,
      context,
      dependencies as never,
    );

    expect(dependencies.createService).toHaveBeenCalledTimes(5);
    expect(dependencies.createService).toHaveBeenCalledWith({
      userId: context.userId,
      prototypeAdministrator: true,
    });
    expect(dependencies.applyResponseHeaders).toHaveBeenCalledTimes(5);
  });

  it("normalizes decision reasons and rejects malformed action contracts", () => {
    expect(
      parseAdministratorSellerModerationDecision({
        sellerId: uuid(2),
        submissionId: uuid(3),
        expectedRevision: 1,
        decision: "request_changes",
        reason: "  Add\n a   clearer image. ",
        requestId: uuid(5),
      }).reason,
    ).toBe("Add a clearer image.");

    for (const operation of [
      () =>
        parseAdministratorProductModerationDecision({
          submissionId: uuid(3),
          expectedRevision: 1,
          decision: "approve",
          reason: "Not allowed",
          requestId: uuid(5),
        }),
      () =>
        parseAdministratorProductModerationDecision({
          submissionId: uuid(3),
          expectedRevision: 1,
          decision: "reject",
          reason: "   ",
          requestId: uuid(5),
        }),
      () =>
        parseAdministratorProductActivationRecovery({
          submissionId: uuid(3),
          runId: uuid(4),
          expectedDispatchGeneration: 0,
          requestId: uuid(5),
        }),
    ]) {
      expect(operation).toThrowError(
        expect.objectContaining({ code: "moderation_request_invalid" }),
      );
    }
  });

  it("maps action-runtime initialization failure to moderation unavailable", async () => {
    await expect(
      handleRetryAdministratorProductActivation(
        {
          submissionId: uuid(3),
          runId: uuid(4),
          expectedDispatchGeneration: 1,
          requestId: uuid(5),
        },
        context,
        {
          createService: vi.fn(async () => {
            throw new Error("invalid runtime configuration");
          }),
          applyResponseHeaders: vi.fn(),
        } as never,
      ),
    ).rejects.toMatchObject({ code: "moderation_unavailable", statusCode: 503 });
  });
});

function filters() {
  return {
    submissionType: null,
    reviewStatus: "pending" as const,
    activationStatus: null,
    sellerId: null,
    limit: 25,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
