import type { PrototypeAdministratorRequestContext } from "../prototype-administrator.middleware";
import {
  AdministratorModerationError,
  AdministratorSellerModerationActionError,
  administratorModerationSubmissionNotFound,
  administratorModerationUnavailable,
  type AdministratorSellerModerationActionErrorCode,
  type AdministratorProductActivationRecoveryRequest,
  type AdministratorProductModerationDecisionRequest,
  type AdministratorProductModerationDetail,
  type AdministratorSellerModerationDecisionRequest,
  type AdministratorSellerModerationDetail,
} from "../administrator-moderation.types";
import type { SellerProfileSubmission } from "@/features/seller/server/seller-profile-moderation.service";
import {
  decideProductModerationSubmission,
  retryAdministratorProductActivationPostSwitchCleanup,
  retryProductActivationDispatch,
  retryProductActivationRun,
} from "./product-activation.service";
import type { ProductActivationDispatcher } from "./product-activation.dispatcher";
import type { ProductActivationRepository } from "./product-activation.repository";
import { ProductActivationError } from "./product-activation.types";
import type { AdministratorModerationService } from "./administrator-moderation.service";

type DetailReader = Pick<AdministratorModerationService, "getSeller" | "getProduct">;

type SellerDecisionWriter = (input: {
  authorization: PrototypeAdministratorRequestContext;
  sellerId: string;
  submissionId: string;
  expectedRevision: number;
  decision: "approve" | "request_changes" | "reject";
  reason: string | null;
  requestId: string;
}) => Promise<{ submission: SellerProfileSubmission }>;

type ActivationRuntime = {
  repository: ProductActivationRepository;
  dispatcher: ProductActivationDispatcher;
};

export type AdministratorModerationActionsLogger = {
  error(
    event: "administrator_moderation_write_failed",
    context: { operation: AdministratorModerationWriteOperation; exceptionClass: string },
  ): void;
};

type AdministratorModerationWriteOperation =
  | "seller_decision"
  | "product_decision"
  | "dispatch_retry"
  | "activation_retry"
  | "post_switch_cleanup_retry";

const consoleLogger: AdministratorModerationActionsLogger = {
  error(event, context) {
    console.error(`[Administrator moderation] ${event}`, context);
  },
};

const stableSellerDecisionErrors = new Set<AdministratorSellerModerationActionErrorCode>([
  "seller_approval_submission_invalid",
  "seller_approval_submission_conflict",
  "seller_profile_revision_conflict",
  "seller_profile_slug_conflict",
  "seller_approval_required",
  "seller_approval_not_found",
  "seller_profile_image_not_ready",
]);

export class AdministratorModerationActionsService {
  constructor(
    private readonly details: DetailReader,
    private readonly decideSellerSubmission: SellerDecisionWriter,
    private readonly activation: ActivationRuntime,
    private readonly logger: AdministratorModerationActionsLogger = consoleLogger,
  ) {}

  async decideSeller(
    request: AdministratorSellerModerationDecisionRequest,
    authorization: PrototypeAdministratorRequestContext,
  ): Promise<{
    decision: { submission: SellerProfileSubmission };
    dispatch: null;
    detail: AdministratorSellerModerationDetail;
  }> {
    return this.write("seller_decision", async () => {
      const current = await this.details.getSeller(request.submissionId);
      if (current.request.seller.sellerId !== request.sellerId) {
        throw administratorModerationSubmissionNotFound();
      }
      const decision = await this.decideSellerSubmission({ authorization, ...request });
      return {
        decision,
        dispatch: null,
        detail: await this.details.getSeller(request.submissionId),
      };
    });
  }

  async decideProduct(
    request: AdministratorProductModerationDecisionRequest,
    authorization: PrototypeAdministratorRequestContext,
  ) {
    return this.write("product_decision", async () => {
      await this.requireProduct(request.submissionId, authorization);
      const result = await decideProductModerationSubmission({
        authorization,
        repository: this.activation.repository,
        dispatcher: this.activation.dispatcher,
        submissionId: request.submissionId,
        expectedRevision: request.expectedRevision,
        decision: request.decision,
        reason: request.reason,
        decisionRequestId: request.requestId,
      });
      return {
        ...result,
        detail: await this.details.getProduct(request.submissionId, authorization),
      };
    });
  }

  async retryDispatch(
    request: AdministratorProductActivationRecoveryRequest,
    authorization: PrototypeAdministratorRequestContext,
  ) {
    return this.write("dispatch_retry", async () => {
      await this.requireRun(request, authorization);
      const dispatch = await retryProductActivationDispatch({
        authorization,
        repository: this.activation.repository,
        dispatcher: this.activation.dispatcher,
        runId: request.runId,
        expectedDispatchGeneration: request.expectedDispatchGeneration,
        requestId: request.requestId,
      });
      return {
        dispatch,
        detail: await this.details.getProduct(request.submissionId, authorization),
      };
    });
  }

  async retryActivation(
    request: AdministratorProductActivationRecoveryRequest,
    authorization: PrototypeAdministratorRequestContext,
  ) {
    return this.write("activation_retry", async () => {
      await this.requireRun(request, authorization);
      const recovery = await retryProductActivationRun({
        authorization,
        repository: this.activation.repository,
        dispatcher: this.activation.dispatcher,
        runId: request.runId,
        expectedDispatchGeneration: request.expectedDispatchGeneration,
        requestId: request.requestId,
      });
      return {
        ...recovery,
        detail: await this.details.getProduct(request.submissionId, authorization),
      };
    });
  }

  async retryPostSwitchCleanup(
    request: AdministratorProductActivationRecoveryRequest,
    authorization: PrototypeAdministratorRequestContext,
  ) {
    return this.write("post_switch_cleanup_retry", async () => {
      await this.requireRun(request, authorization);
      const recovery = await retryAdministratorProductActivationPostSwitchCleanup({
        authorization,
        repository: this.activation.repository,
        dispatcher: this.activation.dispatcher,
        runId: request.runId,
        expectedDispatchGeneration: request.expectedDispatchGeneration,
        requestId: request.requestId,
      });
      return {
        ...recovery,
        detail: await this.details.getProduct(request.submissionId, authorization),
      };
    });
  }

  private async requireProduct(
    submissionId: string,
    authorization: PrototypeAdministratorRequestContext,
  ): Promise<AdministratorProductModerationDetail> {
    return this.details.getProduct(submissionId, authorization);
  }

  private async requireRun(
    request: AdministratorProductActivationRecoveryRequest,
    authorization: PrototypeAdministratorRequestContext,
  ): Promise<AdministratorProductModerationDetail> {
    const detail = await this.requireProduct(request.submissionId, authorization);
    if (detail.request.activation?.runId !== request.runId) {
      throw administratorModerationSubmissionNotFound();
    }
    return detail;
  }

  private async write<T>(
    operation: AdministratorModerationWriteOperation,
    execute: () => Promise<T>,
  ): Promise<T> {
    try {
      return await execute();
    } catch (error) {
      if (
        error instanceof AdministratorModerationError ||
        error instanceof AdministratorSellerModerationActionError ||
        error instanceof ProductActivationError
      ) {
        throw error;
      }
      if (error instanceof Error && isStableSellerDecisionError(error.message)) {
        throw sellerActionError(error.message);
      }
      this.logger.error("administrator_moderation_write_failed", {
        operation,
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      throw administratorModerationUnavailable();
    }
  }
}

function isStableSellerDecisionError(
  message: string,
): message is AdministratorSellerModerationActionErrorCode {
  return stableSellerDecisionErrors.has(message as AdministratorSellerModerationActionErrorCode);
}

function sellerActionError(
  code: AdministratorSellerModerationActionErrorCode,
): AdministratorSellerModerationActionError {
  const details: Record<
    AdministratorSellerModerationActionErrorCode,
    { statusCode: 400 | 404 | 409; message: string }
  > = {
    seller_approval_submission_invalid: {
      statusCode: 400,
      message: "The seller moderation decision is invalid.",
    },
    seller_approval_submission_conflict: {
      statusCode: 409,
      message: "This seller moderation request conflicts with current state.",
    },
    seller_profile_revision_conflict: {
      statusCode: 409,
      message: "The seller profile revision changed before the decision was applied.",
    },
    seller_profile_slug_conflict: {
      statusCode: 409,
      message: "The proposed seller address is already in use.",
    },
    seller_approval_required: {
      statusCode: 409,
      message: "The seller approval state does not allow this decision.",
    },
    seller_approval_not_found: {
      statusCode: 404,
      message: "The seller moderation request was not found.",
    },
    seller_profile_image_not_ready: {
      statusCode: 409,
      message: "The submitted seller images are not ready.",
    },
  };
  const detail = details[code];
  return new AdministratorSellerModerationActionError(detail.statusCode, code, detail.message);
}
