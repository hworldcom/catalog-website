import {
  createDelegatedActionFingerprint,
  type DelegatedActionPayload,
  DelegatedAdministratorActionService,
} from "./delegated-administrator-action.service";
import {
  DelegatedProductPublicationRepositoryError,
  type DelegatedProductDraftRecord,
  type DelegatedProductPublicationRepository,
} from "./delegated-product-publication.repository";
import {
  delegatedProductDraftInvalid,
  delegatedProductDraftNotEditable,
  delegatedProductDraftNotFound,
  delegatedProductDraftUnavailable,
  DelegatedProductDraftError,
  type DelegatedProductDescriptionsUpdateInput,
  type DelegatedProductDraftSnapshot,
  type DelegatedProductFactsUpdateInput,
  type DelegatedProductFields,
  type DelegatedProductPublishInput,
  type DelegatedProductRetryInput,
  type DelegatedProductSaveInput,
  type DelegatedProductScope,
} from "../delegated-product-publication.types";
import type { ProductDraftDescriptionService } from "@/features/product-draft-descriptions/product-draft-descriptions.service";
import type { ProductDraftFactsService } from "@/features/product-draft-facts/product-draft-facts.service";
import type { ProductDraftTitleService } from "@/features/product-draft-title/product-draft-title.service";
import {
  normalizeProductDraftTitle,
  parseStoredProductDraftTitleSource,
} from "@/features/product-draft-title/product-draft-title.types";
import type { SellerProductDraftImageGalleryService } from "@/features/seller/server/seller-product-draft-image-gallery.service";
import {
  publicationInProgress,
  type SellerProductPublicationService,
} from "@/features/seller/server/seller-product-publication.service";
import {
  SellerProductPublicationError,
  type SellerProductPublicationErrorCode,
} from "@/features/seller/seller-product-publication.types";

type DelegatedAccess = {
  mode: "delegated_administrator";
  expectedSellerId: string;
};

export class DelegatedProductPublicationService {
  constructor(
    private readonly repository: DelegatedProductPublicationRepository,
    private readonly titles: ProductDraftTitleService,
    private readonly facts: ProductDraftFactsService,
    private readonly descriptions: ProductDraftDescriptionService,
    private readonly gallery: SellerProductDraftImageGalleryService,
    private readonly publications: SellerProductPublicationService,
    private readonly actions: DelegatedAdministratorActionService,
  ) {}

  async get(input: DelegatedProductScope): Promise<DelegatedProductDraftSnapshot> {
    return this.repositoryOperation(async () => this.snapshot(await this.requireResolved(input)));
  }

  async save(input: DelegatedProductSaveInput): Promise<DelegatedProductDraftSnapshot> {
    return this.repositoryOperation(async () => {
      const resolved = await this.requireResolved(input);
      if (resolved.product.status !== "draft") throw delegatedProductDraftNotEditable();
      const fields = normalizeFields(input);
      await this.requireCategory(fields.categoryId);
      await this.titles.saveSellerProduct({
        productDraftId: input.productDraftId,
        sellerId: resolved.seller.id,
        title: fields.title,
        productFields: sellerFields(fields),
      });
      return this.snapshot(await this.requireResolved(input));
    });
  }

  async listCategories(workflowId: string) {
    return this.repositoryOperation(async () => {
      if (!(await this.repository.findAdministratorWorkflow(workflowId))) {
        throw delegatedProductDraftNotFound();
      }
      return { categories: await this.repository.listCategories() };
    });
  }

  async getFacts(input: DelegatedProductScope) {
    return this.repositoryOperation(async () => {
      const resolved = await this.requireResolved(input);
      return this.facts.get(input.productDraftId, access(resolved));
    });
  }

  async updateFacts(input: DelegatedProductFactsUpdateInput) {
    return this.repositoryOperation(async () => {
      const resolved = await this.requireResolved(input);
      return this.facts.update(input.productDraftId, input.patch, access(resolved));
    });
  }

  async getDescriptions(input: DelegatedProductScope) {
    return this.repositoryOperation(async () => {
      const resolved = await this.requireResolved(input);
      return this.descriptions.get(input.productDraftId, access(resolved));
    });
  }

  async updateDescriptions(input: DelegatedProductDescriptionsUpdateInput) {
    return this.repositoryOperation(async () => {
      const resolved = await this.requireResolved(input);
      return this.descriptions.update(input.productDraftId, input.descriptions, access(resolved));
    });
  }

  async getPublication(input: DelegatedProductScope) {
    return this.repositoryOperation(async () => {
      const resolved = await this.requireResolved(input);
      return this.publications.get(input.productDraftId, resolved.seller.id);
    });
  }

  async publish(input: DelegatedProductPublishInput, administratorUserId: string) {
    return this.repositoryOperation(async () => {
      const workflow = await this.requireWorkflow(input.workflowId);
      const fields = normalizeFields(input);
      const payload = publicationPayload(fields);
      const requestFingerprint = createDelegatedActionFingerprint({
        actionType: "publish_product_draft",
        targetId: input.productDraftId,
        payload,
      });

      return this.actions.run({
        requestId: input.requestId,
        workflowId: input.workflowId,
        expectedSellerId: workflow.sellerId,
        administratorUserId,
        actionType: "publish_product_draft",
        targetId: input.productDraftId,
        payload,
        readTerminal: () => this.publications.get(input.productDraftId, workflow.sellerId),
        reconcile: () =>
          this.reconcilePublication(
            input.productDraftId,
            workflow.sellerId,
            input.requestId,
            requestFingerprint,
          ),
        execute: async () => {
          const resolved = await this.requireResolved(input);
          await this.requireCategory(fields.categoryId);
          return this.publications.publish(
            resolved.seller.id,
            {
              id: input.productDraftId,
              title: fields.title,
              category_id: fields.categoryId,
              moq: fields.minimumOrderQuantity,
              pack_size: fields.packSize,
              price: fields.price,
              currency: fields.currency,
              stock: fields.stock,
              trending: fields.trending,
            },
            {
              requestId: input.requestId,
              requestFingerprint,
            },
          );
        },
        restoreTerminalError: restorePublicationError,
        terminalErrorCode: publicationTerminalErrorCode,
      });
    });
  }

  async retry(input: DelegatedProductRetryInput, administratorUserId: string) {
    return this.repositoryOperation(async () => {
      const workflow = await this.requireWorkflow(input.workflowId);
      const payload = null;
      const requestFingerprint = createDelegatedActionFingerprint({
        actionType: "retry_product_publication",
        targetId: input.productDraftId,
        payload,
      });

      return this.actions.run({
        requestId: input.requestId,
        workflowId: input.workflowId,
        expectedSellerId: workflow.sellerId,
        administratorUserId,
        actionType: "retry_product_publication",
        targetId: input.productDraftId,
        payload,
        readTerminal: () => this.publications.get(input.productDraftId, workflow.sellerId),
        reconcile: () =>
          this.reconcilePublication(
            input.productDraftId,
            workflow.sellerId,
            input.requestId,
            requestFingerprint,
          ),
        execute: async () => {
          const resolved = await this.requireResolved(input);
          return this.publications.retry(input.productDraftId, resolved.seller.id, {
            requestId: input.requestId,
            requestFingerprint,
          });
        },
        restoreTerminalError: restorePublicationError,
        terminalErrorCode: publicationTerminalErrorCode,
      });
    });
  }

  private async reconcilePublication(
    productDraftId: string,
    sellerId: string,
    requestId: string,
    requestFingerprint: string,
  ) {
    const run = await this.repository.getPublicationRun(productDraftId, sellerId);
    if (!run) return null;
    if (
      run.delegatedActionRequestId === requestId &&
      run.delegatedActionRequestFingerprint === requestFingerprint
    ) {
      if (run.status === "pending") return null;
      return this.publications.get(productDraftId, sellerId);
    }
    if (run.status === "pending" || run.status === "running") {
      throw publicationInProgress();
    }
    return null;
  }

  private async requireResolved(input: DelegatedProductScope) {
    const resolved = await this.repository.resolve(input.workflowId, input.productDraftId);
    if (!resolved) throw delegatedProductDraftNotFound();
    return resolved;
  }

  private async requireWorkflow(workflowId: string) {
    const workflow = await this.repository.findAdministratorWorkflow(workflowId);
    if (!workflow) throw delegatedProductDraftNotFound();
    return workflow;
  }

  private async requireCategory(categoryId: string | null): Promise<void> {
    if (categoryId && !(await this.repository.categoryExists(categoryId))) {
      throw delegatedProductDraftInvalid();
    }
  }

  private async snapshot(
    resolved: DelegatedProductDraftRecord,
  ): Promise<DelegatedProductDraftSnapshot> {
    const product = resolved.product;
    return {
      workflowId: resolved.workflowId,
      productDraftId: product.id,
      seller: {
        id: resolved.seller.id,
        name: resolved.seller.name,
        slug: resolved.seller.slug,
        storefrontPublished: resolved.seller.published,
      },
      source: resolved.source,
      product: {
        status: product.status,
        title: product.title,
        titleSource: parseStoredProductDraftTitleSource(product.title_source),
        categoryId: product.category_id,
        minimumOrderQuantity: product.moq,
        packSize: product.pack_size,
        price: product.price,
        currency: product.currency,
        stock: product.stock,
        trending: product.trending,
        coverImageId: product.cover_image_id,
        imagePublicationMode: "durable",
        editable: product.status === "draft",
      },
      gallery: await this.gallery.get(product),
    };
  }

  private async repositoryOperation<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DelegatedProductPublicationRepositoryError) {
        throw delegatedProductDraftUnavailable();
      }
      throw error;
    }
  }
}

function normalizeFields(input: DelegatedProductFields): DelegatedProductFields {
  return {
    ...input,
    title: normalizeProductDraftTitle(input.title),
    packSize: input.packSize?.trim() || null,
    currency: input.currency.trim(),
  };
}

function sellerFields(fields: DelegatedProductFields) {
  return {
    category_id: fields.categoryId,
    moq: fields.minimumOrderQuantity,
    pack_size: fields.packSize,
    price: fields.price,
    currency: fields.currency,
    stock: fields.stock,
    trending: fields.trending,
    status: "draft" as const,
  };
}

function publicationPayload(fields: DelegatedProductFields): DelegatedActionPayload {
  return {
    categoryId: fields.categoryId,
    currency: fields.currency,
    minimumOrderQuantity: fields.minimumOrderQuantity,
    packSize: fields.packSize,
    price: fields.price,
    stock: fields.stock,
    title: fields.title,
    trending: fields.trending,
  };
}

function access(resolved: DelegatedProductDraftRecord): DelegatedAccess {
  return {
    mode: "delegated_administrator",
    expectedSellerId: resolved.seller.id,
  };
}

const terminalPublicationCodes = new Set<SellerProductPublicationErrorCode>([
  "product_publication_invalid",
  "product_not_found",
  "product_publication_title_required",
  "product_publication_title_invalid",
  "product_publication_description_invalid",
  "product_publication_category_required",
  "product_publication_image_required",
  "product_publication_images_not_ready",
  "product_publication_in_progress",
  "product_publication_not_allowed",
]);

function publicationTerminalErrorCode(error: unknown): string | null {
  if (error instanceof DelegatedProductDraftError) {
    return error.code === "delegated_product_draft_unavailable" ? null : error.code;
  }
  if (error instanceof SellerProductPublicationError) {
    return terminalPublicationCodes.has(error.code) ? error.code : null;
  }
  return null;
}

function restorePublicationError(errorCode: string | null): Error {
  if (errorCode === "delegated_product_draft_invalid") return delegatedProductDraftInvalid();
  if (errorCode === "delegated_product_draft_not_found") return delegatedProductDraftNotFound();
  if (errorCode === "delegated_product_draft_not_editable") {
    return delegatedProductDraftNotEditable();
  }
  const statusByCode: Partial<Record<SellerProductPublicationErrorCode, 400 | 404 | 409>> = {
    product_publication_invalid: 400,
    product_not_found: 404,
    product_publication_title_required: 409,
    product_publication_title_invalid: 400,
    product_publication_description_invalid: 400,
    product_publication_category_required: 409,
    product_publication_image_required: 409,
    product_publication_images_not_ready: 409,
    product_publication_in_progress: 409,
    product_publication_not_allowed: 409,
  };
  if (errorCode && errorCode in statusByCode) {
    const code = errorCode as SellerProductPublicationErrorCode;
    return new SellerProductPublicationError(
      statusByCode[code]!,
      code,
      "The delegated product publication request cannot be completed.",
    );
  }
  return delegatedProductDraftUnavailable();
}
