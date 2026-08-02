import {
  ProductDescriptionCoverImageError,
  type ProductDescriptionCoverImageGateway,
} from "./product-description-cover-image.gateway";
import type { ProductDescriptionGenerationProvider } from "./product-draft-description-generation.provider";
import { ProductDescriptionGenerationProviderError } from "./product-draft-description-generation.provider";
import type {
  ProductDescriptionGenerationClaim,
  ProductDescriptionGenerationRepository,
} from "./product-draft-description-generation.repository";
import {
  generationError,
  normalizeProductDescriptionGenerationOutput,
  PRODUCT_DESCRIPTION_OPERATION_TIMEOUT_MS,
  PRODUCT_DESCRIPTION_PIPELINE_VERSION,
  ProductDescriptionGenerationError,
  ProductDescriptionGenerationImageNotUsableError,
  ProductDescriptionGenerationOutputError,
  type ProductDescriptionGenerationErrorCode,
} from "./product-draft-description-generation.types";

type GenerationResult = Awaited<ReturnType<ProductDescriptionGenerationRepository["finalize"]>> & {
  result: "completed";
};

type TerminalGenerationErrorCode = Extract<
  ProductDescriptionGenerationErrorCode,
  | "product_description_generation_provider_failed"
  | "product_description_generation_provider_timeout"
  | "product_description_generation_output_invalid"
  | "product_description_generation_configuration_invalid"
  | "product_description_generation_cover_unsupported"
  | "product_description_generation_cover_unavailable"
  | "product_description_generation_image_not_usable"
>;

export class ProductDescriptionGenerationService {
  constructor(
    private readonly repository: ProductDescriptionGenerationRepository,
    private readonly provider: ProductDescriptionGenerationProvider,
    private readonly coverImageGateway: ProductDescriptionCoverImageGateway,
  ) {}

  async generate(
    productDraftId: string,
    expectedSellerId: string,
  ): Promise<Omit<GenerationResult, "result">> {
    const operationDeadline = Date.now() + PRODUCT_DESCRIPTION_OPERATION_TIMEOUT_MS;
    const claim = await this.claim(productDraftId, expectedSellerId);
    const providerResult = await this.generateWithFailureFinalization(
      productDraftId,
      expectedSellerId,
      claim,
      operationDeadline,
    );

    let finalization: Awaited<ReturnType<ProductDescriptionGenerationRepository["finalize"]>>;
    try {
      finalization = await this.repository.finalize({
        productDraftId,
        expectedSellerId,
        claim,
        output: providerResult.output,
        provider: providerResult.provider,
        model: providerResult.model,
        pipelineVersion: PRODUCT_DESCRIPTION_PIPELINE_VERSION,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      throw unavailable(error);
    }

    if (finalization.result === "completed") {
      if (providerResult.responseId) {
        console.info("[Product description generation] Generation completed.", {
          responseId: providerResult.responseId,
          productDraftId,
        });
      }
      return {
        descriptionSnapshot: finalization.descriptionSnapshot,
        titleSnapshot: finalization.titleSnapshot,
      };
    }
    if (finalization.result === "not_found") throw productDraftNotFound();
    if (finalization.result === "not_editable") throw productDraftNotEditable();
    if (finalization.result === "facts_missing") throw productDraftFactsMissing();
    if (finalization.result === "input_changed") {
      throw generationError(
        409,
        "product_description_generation_input_changed",
        "The ProductDraft generation input changed while descriptions were generated.",
      );
    }
    throw attemptSuperseded();
  }

  private async claim(
    productDraftId: string,
    expectedSellerId: string,
  ): Promise<ProductDescriptionGenerationClaim> {
    let claim: Awaited<ReturnType<ProductDescriptionGenerationRepository["claim"]>>;
    try {
      claim = await this.repository.claim(productDraftId, expectedSellerId);
    } catch (error) {
      throw unavailable(error);
    }

    if (claim.result === "claimed") return claim;
    if (claim.result === "not_found") throw productDraftNotFound();
    if (claim.result === "not_editable") throw productDraftNotEditable();
    if (claim.result === "category_missing") {
      throw generationError(
        409,
        "product_description_generation_category_missing",
        "Assign a category before generating ProductDraft descriptions.",
      );
    }
    if (claim.result === "cover_missing") {
      throw generationError(
        409,
        "product_description_generation_cover_missing",
        "Save a selected cover image before generating ProductDraft descriptions.",
      );
    }
    if (claim.result === "cover_not_ready") {
      throw generationError(
        409,
        "product_description_generation_cover_not_ready",
        "The selected ProductDraft cover image is not ready.",
      );
    }
    if (claim.result === "facts_missing") throw productDraftFactsMissing();
    if (claim.result === "no_writable_targets") {
      throw generationError(
        409,
        "product_description_generation_no_writable_targets",
        "Every description and the title are already owned by human edits.",
      );
    }
    throw generationError(
      409,
      "product_description_generation_in_progress",
      "Another description generation request is already running.",
    );
  }

  private async generateWithFailureFinalization(
    productDraftId: string,
    expectedSellerId: string,
    claim: ProductDescriptionGenerationClaim,
    operationDeadline: number,
  ) {
    try {
      const providerResult = await withOperationDeadline(operationDeadline, (signal) =>
        this.coverImageGateway.load(claim.cover, signal).then((coverImage) =>
          this.provider.generate(
            {
              category: claim.category,
              facts: claim.facts,
              coverImage,
              titleProposalRequested: claim.titleBlank,
            },
            signal,
          ),
        ),
      );
      if (Date.now() >= operationDeadline) {
        throw new ProductDescriptionGenerationProviderError("timeout");
      }
      if (!providerResult.provider.trim() || !providerResult.model.trim()) {
        throw new ProductDescriptionGenerationOutputError();
      }
      return {
        ...providerResult,
        provider: providerResult.provider.trim(),
        model: providerResult.model.trim(),
        output: normalizeProductDescriptionGenerationOutput(
          providerResult.output,
          claim.titleBlank,
        ),
      };
    } catch (error) {
      const mapped = generationFailure(error);
      await this.recordProviderFailure(
        productDraftId,
        expectedSellerId,
        claim.attemptToken,
        mapped.code as TerminalGenerationErrorCode,
      );
      throw mapped;
    }
  }

  private async recordProviderFailure(
    productDraftId: string,
    expectedSellerId: string,
    attemptToken: string,
    errorCode: TerminalGenerationErrorCode,
  ) {
    let result: Awaited<ReturnType<ProductDescriptionGenerationRepository["fail"]>>;
    try {
      result = await this.repository.fail({
        productDraftId,
        expectedSellerId,
        attemptToken,
        errorCode,
      });
    } catch (error) {
      throw unavailable(error);
    }
    if (result === "not_found") throw productDraftNotFound();
    if (result === "superseded") throw attemptSuperseded();
  }
}

async function withOperationDeadline<T>(
  deadline: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const remainingTime = deadline - Date.now();
  if (remainingTime <= 0) {
    throw new ProductDescriptionGenerationProviderError("timeout");
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new ProductDescriptionGenerationProviderError("timeout"));
    }, remainingTime);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function generationFailure(error: unknown): ProductDescriptionGenerationError {
  if (error instanceof ProductDescriptionCoverImageError) {
    if (error.kind === "unsupported") {
      return generationError(
        409,
        "product_description_generation_cover_unsupported",
        "Upload the selected cover through Bazoria before generating descriptions.",
      );
    }
    return generationError(
      503,
      "product_description_generation_cover_unavailable",
      "The selected cover image could not be read.",
    );
  }
  if (error instanceof ProductDescriptionGenerationImageNotUsableError) {
    return generationError(
      422,
      "product_description_generation_image_not_usable",
      "Choose a clearer cover image that shows the product.",
    );
  }
  if (error instanceof ProductDescriptionGenerationOutputError) {
    return generationError(
      502,
      "product_description_generation_output_invalid",
      "The description provider returned invalid output.",
    );
  }
  if (error instanceof ProductDescriptionGenerationProviderError) {
    if (error.kind === "configuration_invalid") {
      return generationError(
        500,
        "product_description_generation_configuration_invalid",
        "Product description generation is not configured correctly.",
      );
    }
    if (error.kind === "timeout") {
      return generationError(
        504,
        "product_description_generation_provider_timeout",
        "The description provider timed out.",
      );
    }
    if (error.kind === "output_invalid") {
      return generationError(
        502,
        "product_description_generation_output_invalid",
        "The description provider returned invalid output.",
      );
    }
  }
  return generationError(
    502,
    "product_description_generation_provider_failed",
    "The description provider could not generate descriptions.",
  );
}

function productDraftNotFound() {
  return generationError(404, "product_draft_not_found", "The ProductDraft was not found.");
}

function productDraftNotEditable() {
  return generationError(
    409,
    "product_description_generation_not_editable",
    "Descriptions can only be generated while the product is a draft.",
  );
}

function productDraftFactsMissing() {
  return generationError(
    500,
    "product_draft_facts_missing",
    "The ProductDraft facts record is missing or invalid.",
  );
}

function attemptSuperseded() {
  return generationError(
    409,
    "product_description_generation_attempt_superseded",
    "A newer description generation attempt owns the ProductDraft.",
  );
}

function unavailable(error: unknown) {
  if (error instanceof ProductDescriptionGenerationError) return error;
  console.error("[Product description generation] Persistence operation failed.", {
    exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
  });
  return generationError(
    500,
    "product_description_generation_unavailable",
    "Product description generation is temporarily unavailable.",
  );
}
