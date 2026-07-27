import { createServerFn } from "@tanstack/react-start";

import {
  parseAdminProductDraftReviewRequest,
  type AdminProductDraftReview,
  type AdminProductDraftReviewRequest,
} from "./admin-product-draft-review.types";
import {
  requirePrototypeAdministrator,
  type PrototypeAdministratorRequestContext,
} from "./prototype-administrator.middleware";
import type { AdminProductDraftReviewService } from "./server/admin-product-draft-review.service";
import type { ConfirmedPrototypeAdministratorContext } from "./server/product-draft-image-delivery.types";

type HandlerDependencies = {
  assertEnabled(): Promise<void>;
  createService(
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<Pick<AdminProductDraftReviewService, "get">>;
  applyResponseHeaders(): Promise<void> | void;
};

export const getAdminProductDraftReview = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdminProductDraftReviewRequest)
  .handler(async ({ data, context }) =>
    handleGetAdminProductDraftReview(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultDependencies(),
    ),
  );

export async function handleGetAdminProductDraftReview(
  request: AdminProductDraftReviewRequest,
  context: PrototypeAdministratorRequestContext,
  dependencies: HandlerDependencies,
): Promise<AdminProductDraftReview> {
  await dependencies.assertEnabled();
  const authorization = {
    userId: context.userId,
    prototypeAdministrator: true as const,
  };
  const service = await dependencies.createService(authorization);
  const response = await service.get(request, authorization);
  await dependencies.applyResponseHeaders();
  return response;
}

function defaultDependencies(): HandlerDependencies {
  return {
    async assertEnabled() {
      const { getProductDraftAdminGate } =
        await import("./server/product-draft-admin-gate.runtime");
      await (await getProductDraftAdminGate()).assertEnabled();
    },
    async createService(authorization) {
      const { createAdminProductDraftReviewService } =
        await import("./server/admin-product-draft-review.runtime");
      return createAdminProductDraftReviewService(authorization);
    },
    async applyResponseHeaders() {
      const { applyPrivateProductDraftImageResponseHeaders } =
        await import("./server/product-draft-image-delivery.response");
      applyPrivateProductDraftImageResponseHeaders();
    },
  };
}
