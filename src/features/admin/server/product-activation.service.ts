import type { PrototypeAdministratorRequestContext } from "../prototype-administrator.middleware";
import type { ProductActivationDispatcher } from "./product-activation.dispatcher";
import type { ProductActivationRepository } from "./product-activation.repository";
import type {
  ProductActivationDispatchResult,
  ProductModerationDecision,
  ProductModerationDecisionResult,
  ProductActivationRecoveryResult,
} from "./product-activation.types";

export type ProductActivationSellerAuthorization = {
  userId: string;
  sellerId: string;
};

export async function decideProductModerationSubmission(input: {
  authorization: PrototypeAdministratorRequestContext;
  repository: ProductActivationRepository;
  dispatcher: ProductActivationDispatcher;
  submissionId: string;
  expectedRevision: number;
  decision: ProductModerationDecision;
  reason: string | null;
  decisionRequestId: string;
}): Promise<{
  decision: ProductModerationDecisionResult;
  dispatch: ProductActivationDispatchResult | null;
}> {
  assertAdministrator(input.authorization);
  const decision = await input.repository.decide({
    submissionId: input.submissionId,
    expectedRevision: input.expectedRevision,
    decision: input.decision,
    reason: input.reason,
    decisionRequestId: input.decisionRequestId,
    administratorUserId: input.authorization.userId,
  });
  return {
    decision,
    dispatch: await dispatchWhenRequired(input.dispatcher, decision),
  };
}

export async function retryProductActivationDispatch(input: {
  authorization: PrototypeAdministratorRequestContext;
  repository: ProductActivationRepository;
  dispatcher: ProductActivationDispatcher;
  runId: string;
  expectedDispatchGeneration: number;
  requestId: string;
}): Promise<ProductActivationDispatchResult> {
  assertAdministrator(input.authorization);
  const retry = await input.repository.retryDispatch({
    runId: input.runId,
    expectedDispatchGeneration: input.expectedDispatchGeneration,
    requestId: input.requestId,
    actorUserId: input.authorization.userId,
  });
  if (!retry.dispatchRequired) return retry;
  return input.dispatcher.dispatch({
    runId: retry.runId,
    dispatchGeneration: retry.dispatchGeneration,
  });
}

export async function retryProductActivationRun(input: {
  authorization: PrototypeAdministratorRequestContext;
  repository: ProductActivationRepository;
  dispatcher: ProductActivationDispatcher;
  runId: string;
  expectedDispatchGeneration: number;
  requestId: string;
}): Promise<{
  recovery: ProductActivationRecoveryResult;
  dispatch: ProductActivationDispatchResult | null;
}> {
  assertAdministrator(input.authorization);
  const recovery = await input.repository.retryActivation({
    runId: input.runId,
    expectedDispatchGeneration: input.expectedDispatchGeneration,
    requestId: input.requestId,
    administratorUserId: input.authorization.userId,
  });
  return {
    recovery,
    dispatch: await dispatchRecoveryWhenRequired(input.dispatcher, recovery),
  };
}

export async function requestProductActivationAbandonment(input: {
  authorization: ProductActivationSellerAuthorization;
  repository: ProductActivationRepository;
  dispatcher: ProductActivationDispatcher;
  runId: string;
  expectedDispatchGeneration: number;
  requestId: string;
}): Promise<{
  recovery: ProductActivationRecoveryResult;
  dispatch: ProductActivationDispatchResult | null;
}> {
  const recovery = await input.repository.requestAbandonment({
    runId: input.runId,
    expectedDispatchGeneration: input.expectedDispatchGeneration,
    requestId: input.requestId,
    sellerId: input.authorization.sellerId,
  });
  return {
    recovery,
    dispatch: await dispatchRecoveryWhenRequired(input.dispatcher, recovery),
  };
}

export async function retryProductActivationCleanup(input: {
  authorization: PrototypeAdministratorRequestContext | ProductActivationSellerAuthorization;
  repository: ProductActivationRepository;
  dispatcher: ProductActivationDispatcher;
  runId: string;
  expectedDispatchGeneration: number;
  requestId: string;
}): Promise<{
  recovery: ProductActivationRecoveryResult;
  dispatch: ProductActivationDispatchResult | null;
}> {
  const recovery = await input.repository.retryCleanup({
    runId: input.runId,
    expectedDispatchGeneration: input.expectedDispatchGeneration,
    requestId: input.requestId,
    actorUserId: input.authorization.userId,
  });
  return {
    recovery,
    dispatch: await dispatchRecoveryWhenRequired(input.dispatcher, recovery),
  };
}

async function dispatchWhenRequired(
  dispatcher: ProductActivationDispatcher,
  decision: ProductModerationDecisionResult,
): Promise<ProductActivationDispatchResult | null> {
  if (!decision.dispatchRequired) return null;
  if (!decision.activationRunId || !decision.dispatchGeneration) {
    throw new Error("product_moderation_activation_unavailable");
  }
  return dispatcher.dispatch({
    runId: decision.activationRunId,
    dispatchGeneration: decision.dispatchGeneration,
  });
}

async function dispatchRecoveryWhenRequired(
  dispatcher: ProductActivationDispatcher,
  recovery: ProductActivationRecoveryResult,
): Promise<ProductActivationDispatchResult | null> {
  if (!recovery.dispatchRequired) return null;
  return dispatcher.dispatch({
    runId: recovery.runId,
    dispatchGeneration: recovery.dispatchGeneration,
  });
}

function assertAdministrator(
  authorization: PrototypeAdministratorRequestContext,
): asserts authorization is PrototypeAdministratorRequestContext {
  if (authorization.prototypeAdministrator !== true) {
    throw new Error("prototype_administrator_required");
  }
}
