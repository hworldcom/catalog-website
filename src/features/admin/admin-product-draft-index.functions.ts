import { createServerFn } from "@tanstack/react-start";

import {
  parseAdminProductDraftIndexRequest,
  type AdminProductDraftIndexPage,
  type AdminProductDraftIndexRequest,
} from "./admin-product-draft-index.types";
import {
  requirePrototypeAdministrator,
  type PrototypeAdministratorRequestContext,
} from "./prototype-administrator.middleware";
import type { AdminProductDraftIndexService } from "./server/admin-product-draft-index.service";
import type { ConfirmedPrototypeAdministratorContext } from "./server/product-draft-image-delivery.types";

type HandlerDependencies = {
  assertEnabled(): Promise<void>;
  createService(
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<Pick<AdminProductDraftIndexService, "list">>;
  applyResponseHeaders(): Promise<void> | void;
};

export const listAdminProductDrafts = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdminProductDraftIndexRequest)
  .handler(async ({ data, context }) =>
    handleListAdminProductDrafts(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultDependencies(),
    ),
  );

export async function handleListAdminProductDrafts(
  request: AdminProductDraftIndexRequest,
  context: PrototypeAdministratorRequestContext,
  dependencies: HandlerDependencies,
): Promise<AdminProductDraftIndexPage> {
  await dependencies.assertEnabled();
  const authorization = {
    userId: context.userId,
    prototypeAdministrator: true as const,
  };
  const service = await dependencies.createService(authorization);
  const response = await service.list(request, authorization);
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
      const { createAdminProductDraftIndexService } =
        await import("./server/admin-product-draft-index.runtime");
      return createAdminProductDraftIndexService(authorization);
    },
    async applyResponseHeaders() {
      const { applyPrivateProductDraftImageResponseHeaders } =
        await import("./server/product-draft-image-delivery.response");
      applyPrivateProductDraftImageResponseHeaders();
    },
  };
}
