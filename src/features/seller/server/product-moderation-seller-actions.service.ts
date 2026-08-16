import type { ProductActivationDispatcher } from "@/features/admin/server/product-activation.dispatcher";
import type { ProductActivationRepository } from "@/features/admin/server/product-activation.repository";
import {
  requestProductActivationAbandonment,
  retryProductActivationCleanup,
} from "@/features/admin/server/product-activation.service";
import { ProductActivationError } from "@/features/admin/server/product-activation.types";

import {
  ProductModerationError,
  productModerationError,
  type ProductModerationEditStart,
} from "../product-moderation.types";
import type { ProductModerationStatusDetail } from "../product-moderation-status.types";
import { getCurrentSellerId } from "./current-seller.service";
import type {
  ProductModerationRequester,
  ProductModerationService,
} from "./product-moderation.service";
import type { ProductModerationSellerActionsRepository } from "./product-moderation-seller-actions.repository";

type ModerationWriter = Pick<ProductModerationService, "submitForSeller" | "withdrawForSeller">;

type StatusReader = {
  get(productId: string, sellerId: string): Promise<ProductModerationStatusDetail>;
};

type ActivationRuntime = {
  repository: ProductActivationRepository;
  dispatcher: ProductActivationDispatcher;
};

type ModerationStatusResponse = {
  moderationStatus: ProductModerationStatusDetail;
};

export class ProductModerationSellerActionsService {
  constructor(
    private readonly requester: ProductModerationRequester,
    private readonly resources: ProductModerationSellerActionsRepository,
    private readonly moderation: ModerationWriter,
    private readonly getStatusReader: () => Promise<StatusReader>,
    private readonly getActivationRuntime: () => Promise<ActivationRuntime>,
  ) {}

  async beginEditing(input: {
    userId: string;
    productId: string;
  }): Promise<ProductModerationEditStart> {
    const sellerId = await this.authorize(input.userId, input.productId);
    return this.resources.beginEditing(input.productId, sellerId);
  }

  async submit(input: {
    userId: string;
    productId: string;
    expectedModerationRevision: number;
    requestId: string;
  }): Promise<ModerationStatusResponse> {
    const sellerId = await this.authorize(input.userId, input.productId);
    await this.moderation.submitForSeller({
      userId: input.userId,
      sellerId,
      productDraftId: input.productId,
      expectedModerationRevision: input.expectedModerationRevision,
      requestId: input.requestId,
    });
    return this.status(input.productId, sellerId);
  }

  async withdraw(input: {
    userId: string;
    productId: string;
    submissionId: string;
    expectedModerationRevision: number;
    requestId: string;
  }): Promise<ModerationStatusResponse> {
    const sellerId = await this.authorize(input.userId, input.productId, {
      submissionId: input.submissionId,
    });
    await this.moderation.withdrawForSeller({
      userId: input.userId,
      sellerId,
      productDraftId: input.productId,
      submissionId: input.submissionId,
      expectedModerationRevision: input.expectedModerationRevision,
      requestId: input.requestId,
    });
    return this.status(input.productId, sellerId);
  }

  async abandonFailedActivation(input: {
    userId: string;
    productId: string;
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
  }): Promise<ModerationStatusResponse> {
    const sellerId = await this.authorize(input.userId, input.productId, {
      runId: input.runId,
    });
    const runtime = await this.activationRuntime();
    await this.runRecovery(() =>
      requestProductActivationAbandonment({
        authorization: { userId: input.userId, sellerId },
        repository: runtime.repository,
        dispatcher: runtime.dispatcher,
        runId: input.runId,
        expectedDispatchGeneration: input.expectedDispatchGeneration,
        requestId: input.requestId,
      }),
    );
    return this.status(input.productId, sellerId);
  }

  async retryAbandonmentCleanup(input: {
    userId: string;
    productId: string;
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
  }): Promise<ModerationStatusResponse> {
    const sellerId = await this.authorize(input.userId, input.productId, {
      runId: input.runId,
    });
    const runtime = await this.activationRuntime();
    await this.runRecovery(() =>
      retryProductActivationCleanup({
        authorization: { userId: input.userId, sellerId },
        repository: runtime.repository,
        dispatcher: runtime.dispatcher,
        runId: input.runId,
        expectedDispatchGeneration: input.expectedDispatchGeneration,
        requestId: input.requestId,
      }),
    );
    return this.status(input.productId, sellerId);
  }

  private async authorize(
    userId: string,
    productId: string,
    resource: { submissionId?: string; runId?: string } = {},
  ): Promise<string> {
    let sellerId: string | null;
    try {
      sellerId = await getCurrentSellerId({
        supabase: this.requester as never,
        userId,
      });
    } catch (error) {
      console.error("[Product moderation seller actions] Seller lookup failed.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      throw productModerationError("product_moderation_unavailable");
    }
    if (!sellerId) throw productModerationError("product_moderation_not_found");

    const identity = await this.resources.readIdentity({
      productId,
      sellerId,
      ...resource,
    });
    if (
      !identity.productOwned ||
      (resource.submissionId !== undefined && !identity.submissionOwned) ||
      (resource.runId !== undefined && !identity.runOwned)
    ) {
      throw productModerationError("product_moderation_not_found");
    }
    return sellerId;
  }

  private async status(productId: string, sellerId: string): Promise<ModerationStatusResponse> {
    return {
      moderationStatus: await (await this.getStatusReader()).get(productId, sellerId),
    };
  }

  private async activationRuntime(): Promise<ActivationRuntime> {
    try {
      return await this.getActivationRuntime();
    } catch (error) {
      console.error("[Product moderation seller actions] Activation runtime failed.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      throw activationUnavailable();
    }
  }

  private async runRecovery(operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (error instanceof ProductActivationError || error instanceof ProductModerationError) {
        throw error;
      }
      console.error("[Product moderation seller actions] Activation recovery failed.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      throw activationUnavailable();
    }
  }
}

function activationUnavailable(): ProductActivationError {
  return new ProductActivationError(
    503,
    "product_moderation_activation_unavailable",
    "Product activation is temporarily unavailable.",
  );
}
