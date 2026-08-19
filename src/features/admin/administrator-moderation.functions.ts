import { createServerFn } from "@tanstack/react-start";

import {
  AdministratorModerationError,
  administratorModerationUnavailable,
  parseAdministratorProductActivationRecovery,
  parseAdministratorProductModerationDecision,
  parseAdministratorModerationIdentifier,
  parseAdministratorModerationRequest,
  parseAdministratorSellerModerationDecision,
  type AdministratorProductActivationRecoveryRequest,
  type AdministratorProductModerationDecisionRequest,
  type AdministratorModerationIdentifier,
  type AdministratorModerationPage,
  type AdministratorModerationRequest,
  type AdministratorProductModerationDetail,
  type AdministratorSellerModerationDecisionRequest,
  type AdministratorSellerModerationDetail,
} from "./administrator-moderation.types";
import {
  requirePrototypeAdministrator,
  type PrototypeAdministratorRequestContext,
} from "./prototype-administrator.middleware";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { AuthenticatedSupabaseRequest } from "@/lib/supabase/request-authentication";
import type { AdministratorModerationService } from "./server/administrator-moderation.service";
import type { AdministratorModerationActionsService } from "./server/administrator-moderation-actions.service";
import type { ConfirmedPrototypeAdministratorContext } from "./server/product-draft-image-delivery.types";

type HandlerDependencies = {
  createService(
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<Pick<AdministratorModerationService, "list" | "getSeller" | "getProduct">>;
  applyResponseHeaders(): Promise<void> | void;
};

type ActionHandlerDependencies = {
  createService(
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<
    Pick<
      AdministratorModerationActionsService,
      | "decideSeller"
      | "decideProduct"
      | "retryDispatch"
      | "retryActivation"
      | "retryPostSwitchCleanup"
    >
  >;
  applyResponseHeaders(): Promise<void> | void;
};

type NavigationContextDependencies = {
  isPrototypeAdministrator(userId: string): Promise<boolean> | boolean;
  applyResponseHeaders(): Promise<void> | void;
  logFailure(error: unknown): void;
};

export type AdministratorNavigationContext = {
  prototypeAdministrator: boolean;
};

export const getAdministratorNavigationContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    handleGetAdministratorNavigationContext(
      context as AuthenticatedSupabaseRequest,
      defaultNavigationContextDependencies(),
    ),
  );

export const listAdministratorModerationRequests = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdministratorModerationRequest)
  .handler(async ({ data, context }) =>
    handleListAdministratorModerationRequests(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultDependencies(),
    ),
  );

export const getAdministratorSellerModerationRequest = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdministratorModerationIdentifier)
  .handler(async ({ data, context }) =>
    handleGetAdministratorSellerModerationRequest(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultDependencies(),
    ),
  );

export const getAdministratorProductModerationRequest = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdministratorModerationIdentifier)
  .handler(async ({ data, context }) =>
    handleGetAdministratorProductModerationRequest(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultDependencies(),
    ),
  );

export const decideAdministratorSellerSubmission = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdministratorSellerModerationDecision)
  .handler(async ({ data, context }) =>
    handleDecideAdministratorSellerSubmission(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultActionDependencies(),
    ),
  );

export const decideAdministratorProductSubmission = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdministratorProductModerationDecision)
  .handler(async ({ data, context }) =>
    handleDecideAdministratorProductSubmission(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultActionDependencies(),
    ),
  );

export const retryAdministratorProductActivationDispatch = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdministratorProductActivationRecovery)
  .handler(async ({ data, context }) =>
    handleRetryAdministratorProductActivationDispatch(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultActionDependencies(),
    ),
  );

export const retryAdministratorProductActivation = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdministratorProductActivationRecovery)
  .handler(async ({ data, context }) =>
    handleRetryAdministratorProductActivation(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultActionDependencies(),
    ),
  );

export const retryAdministratorProductPostSwitchCleanup = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseAdministratorProductActivationRecovery)
  .handler(async ({ data, context }) =>
    handleRetryAdministratorProductPostSwitchCleanup(
      data,
      context as PrototypeAdministratorRequestContext,
      defaultActionDependencies(),
    ),
  );

export async function handleListAdministratorModerationRequests(
  request: AdministratorModerationRequest,
  context: PrototypeAdministratorRequestContext,
  dependencies: HandlerDependencies,
): Promise<AdministratorModerationPage> {
  const authorization = confirmedAuthorization(context);
  const service = await dependencies.createService(authorization);
  const response = await service.list(request, authorization);
  await dependencies.applyResponseHeaders();
  return response;
}

export async function handleGetAdministratorNavigationContext(
  context: Pick<AuthenticatedSupabaseRequest, "userId">,
  dependencies: NavigationContextDependencies,
): Promise<AdministratorNavigationContext> {
  let prototypeAdministrator = false;
  try {
    prototypeAdministrator = await dependencies.isPrototypeAdministrator(context.userId);
  } catch (error) {
    dependencies.logFailure(error);
  }
  await dependencies.applyResponseHeaders();
  return { prototypeAdministrator };
}

export async function handleGetAdministratorSellerModerationRequest(
  request: AdministratorModerationIdentifier,
  context: PrototypeAdministratorRequestContext,
  dependencies: HandlerDependencies,
): Promise<AdministratorSellerModerationDetail> {
  const authorization = confirmedAuthorization(context);
  const service = await dependencies.createService(authorization);
  const response = await service.getSeller(request.submissionId);
  await dependencies.applyResponseHeaders();
  return response;
}

export async function handleGetAdministratorProductModerationRequest(
  request: AdministratorModerationIdentifier,
  context: PrototypeAdministratorRequestContext,
  dependencies: HandlerDependencies,
): Promise<AdministratorProductModerationDetail> {
  const authorization = confirmedAuthorization(context);
  const service = await dependencies.createService(authorization);
  const response = await service.getProduct(request.submissionId, authorization);
  await dependencies.applyResponseHeaders();
  return response;
}

export async function handleDecideAdministratorSellerSubmission(
  request: AdministratorSellerModerationDecisionRequest,
  context: PrototypeAdministratorRequestContext,
  dependencies: ActionHandlerDependencies,
) {
  return handleAction(context, dependencies, (service, authorization) =>
    service.decideSeller(request, authorization),
  );
}

export async function handleDecideAdministratorProductSubmission(
  request: AdministratorProductModerationDecisionRequest,
  context: PrototypeAdministratorRequestContext,
  dependencies: ActionHandlerDependencies,
) {
  return handleAction(context, dependencies, (service, authorization) =>
    service.decideProduct(request, authorization),
  );
}

export async function handleRetryAdministratorProductActivationDispatch(
  request: AdministratorProductActivationRecoveryRequest,
  context: PrototypeAdministratorRequestContext,
  dependencies: ActionHandlerDependencies,
) {
  return handleAction(context, dependencies, (service, authorization) =>
    service.retryDispatch(request, authorization),
  );
}

export async function handleRetryAdministratorProductActivation(
  request: AdministratorProductActivationRecoveryRequest,
  context: PrototypeAdministratorRequestContext,
  dependencies: ActionHandlerDependencies,
) {
  return handleAction(context, dependencies, (service, authorization) =>
    service.retryActivation(request, authorization),
  );
}

export async function handleRetryAdministratorProductPostSwitchCleanup(
  request: AdministratorProductActivationRecoveryRequest,
  context: PrototypeAdministratorRequestContext,
  dependencies: ActionHandlerDependencies,
) {
  return handleAction(context, dependencies, (service, authorization) =>
    service.retryPostSwitchCleanup(request, authorization),
  );
}

async function handleAction<T>(
  context: PrototypeAdministratorRequestContext,
  dependencies: ActionHandlerDependencies,
  execute: (
    service: Awaited<ReturnType<ActionHandlerDependencies["createService"]>>,
    authorization: PrototypeAdministratorRequestContext,
  ) => Promise<T>,
): Promise<T> {
  let service: Awaited<ReturnType<ActionHandlerDependencies["createService"]>>;
  try {
    service = await dependencies.createService(confirmedAuthorization(context));
  } catch (error) {
    if (error instanceof AdministratorModerationError) throw error;
    throw administratorModerationUnavailable();
  }
  const response = await execute(service, context);
  await dependencies.applyResponseHeaders();
  return response;
}

function confirmedAuthorization(
  context: PrototypeAdministratorRequestContext,
): ConfirmedPrototypeAdministratorContext {
  return {
    userId: context.userId,
    prototypeAdministrator: true,
  };
}

function defaultDependencies(): HandlerDependencies {
  return {
    async createService(authorization) {
      const { createAdministratorModerationService } =
        await import("./server/administrator-moderation.runtime");
      return createAdministratorModerationService(authorization);
    },
    async applyResponseHeaders() {
      const { applyPrivateProductDraftImageResponseHeaders } =
        await import("./server/product-draft-image-delivery.response");
      applyPrivateProductDraftImageResponseHeaders();
    },
  };
}

function defaultActionDependencies(): ActionHandlerDependencies {
  return {
    async createService(authorization) {
      const { createAdministratorModerationActionsService } =
        await import("./server/administrator-moderation.runtime");
      return createAdministratorModerationActionsService(authorization);
    },
    async applyResponseHeaders() {
      const { applyPrivateProductDraftImageResponseHeaders } =
        await import("./server/product-draft-image-delivery.response");
      applyPrivateProductDraftImageResponseHeaders();
    },
  };
}

function defaultNavigationContextDependencies(): NavigationContextDependencies {
  return {
    async isPrototypeAdministrator(userId) {
      const { isPrototypeAdministrator, readPrototypeAdministratorUserIds } =
        await import("./server/prototype-administrator-access");
      return isPrototypeAdministrator(userId, readPrototypeAdministratorUserIds());
    },
    async applyResponseHeaders() {
      const { applyPrivateProductDraftImageResponseHeaders } =
        await import("./server/product-draft-image-delivery.response");
      applyPrivateProductDraftImageResponseHeaders();
    },
    logFailure(error) {
      console.error("[Administrator navigation] Context resolution failed.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
    },
  };
}
