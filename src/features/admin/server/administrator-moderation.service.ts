import { productModerationSnapshotSchema } from "@/features/seller/product-moderation-snapshot.types";
import {
  mapProductActivationStatus,
  ProductModerationStatusMappingError,
} from "@/features/seller/server/product-moderation-status.mapper";

import {
  administratorModerationSubmissionNotFound,
  administratorModerationUnavailable,
  sellerSubmissionSnapshotSchema,
  type AdministratorModerationDecision,
  type AdministratorModerationFilters,
  type AdministratorModerationPage,
  type AdministratorModerationPreview,
  type AdministratorModerationRequest,
  type AdministratorProductModerationDetail,
  type AdministratorProductModerationSnapshot,
  type AdministratorProductModerationQueueItem,
  type AdministratorProductSubmissionImageDelivery,
  type AdministratorSellerAssetDelivery,
  type AdministratorSellerModerationDetail,
  type AdministratorSellerModerationQueueItem,
  type SellerSubmissionSnapshot,
} from "../administrator-moderation.types";
import {
  decodeAdministratorModerationCursor,
  encodeAdministratorModerationCursor,
} from "../administrator-moderation.cursor";
import {
  AdministratorModerationRepositoryError,
  type AdministratorModerationActivationRecord,
  type AdministratorModerationQueueRecord,
  type AdministratorModerationRepository,
  type AdministratorProductModerationDetailRecord,
  type AdministratorProductSubmissionImageRecord,
  type AdministratorSellerAssetRecord,
  type AdministratorSellerModerationDetailRecord,
} from "./administrator-moderation.repository";
import type { ProductDraftImageDeliveryService } from "./product-draft-image-delivery.service";
import {
  PRODUCT_DRAFT_IMAGE_DELIVERY_MAX_PAIRS,
  type ConfirmedPrototypeAdministratorContext,
  type ProductDraftImageDeliveryResult,
  ProductDraftImageDeliveryRequestError,
} from "./product-draft-image-delivery.types";

type ImageDelivery = Pick<ProductDraftImageDeliveryService, "resolve">;

export type AdministratorModerationLogger = {
  error(
    event: "administrator_moderation_read_failed",
    context: { operation: "list" | "seller_detail" | "product_detail"; exceptionClass: string },
  ): void;
};

const consoleLogger: AdministratorModerationLogger = {
  error(event, context) {
    console.error(`[Administrator moderation] ${event}`, context);
  },
};

export class AdministratorModerationService {
  constructor(
    private readonly repository: AdministratorModerationRepository,
    private readonly imageDelivery: ImageDelivery,
    private readonly logger: AdministratorModerationLogger = consoleLogger,
  ) {}

  async list(
    request: AdministratorModerationRequest,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<AdministratorModerationPage> {
    return this.read("list", async () => {
      const filters = normalizedFilters(request);
      const after = request.cursor
        ? decodeAdministratorModerationCursor(request.cursor, filters)
        : null;
      const rows = await this.repository.list(filters, after);
      if (rows.length > filters.limit + 1) throw administratorModerationUnavailable();

      const hasMore = rows.length > filters.limit;
      const selectedRows = rows.slice(0, filters.limit);
      const productDeliveries = await this.resolveQueueProductPreviews(selectedRows, authorization);
      const items = selectedRows.map((row) => this.queueItem(row, productDeliveries));
      const last = selectedRows[selectedRows.length - 1];

      return {
        items,
        nextCursor:
          hasMore && last
            ? encodeAdministratorModerationCursor({
                submittedAt: last.submitted_at,
                submissionType: last.submission_type,
                submissionId: last.submission_id,
                filters,
              })
            : null,
        normalizedFilters: filters,
      };
    });
  }

  async getSeller(submissionId: string): Promise<AdministratorSellerModerationDetail> {
    return this.read("seller_detail", async () => {
      const record = await this.repository.getSeller(submissionId);
      if (!record) throw administratorModerationSubmissionNotFound();
      if (record.submissionId !== submissionId) throw administratorModerationUnavailable();
      return this.sellerDetail(record);
    });
  }

  async getProduct(
    submissionId: string,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<AdministratorProductModerationDetail> {
    return this.read("product_detail", async () => {
      const record = await this.repository.getProduct(submissionId);
      if (!record) throw administratorModerationSubmissionNotFound();
      if (record.submissionId !== submissionId) throw administratorModerationUnavailable();
      return this.productDetail(record, authorization);
    });
  }

  private async read<T>(
    operation: "list" | "seller_detail" | "product_detail",
    execute: () => Promise<T>,
  ): Promise<T> {
    try {
      return await execute();
    } catch (error) {
      if (
        error instanceof AdministratorModerationRepositoryError ||
        error instanceof ProductModerationStatusMappingError ||
        error instanceof ProductDraftImageDeliveryRequestError
      ) {
        this.logger.error("administrator_moderation_read_failed", {
          operation,
          exceptionClass: error.constructor.name,
        });
        throw administratorModerationUnavailable();
      }
      throw error;
    }
  }

  private queueItem(
    row: AdministratorModerationQueueRecord,
    productDeliveries: ReadonlyMap<string, ProductDraftImageDeliveryResult>,
  ): AdministratorSellerModerationQueueItem | AdministratorProductModerationQueueItem {
    const common = {
      submissionId: row.submission_id,
      seller: { sellerId: row.seller_id, name: row.seller_name },
      revision: row.revision,
      submittedAt: row.submitted_at,
      reviewStatus: row.review_status,
      sellerVisibleReason: row.seller_visible_reason,
    };

    if (row.submission_type === "new_seller" || row.submission_type === "seller_update") {
      assertSellerQueueShape(row);
      return {
        ...common,
        submissionType: row.submission_type,
        product: null,
        activation: null,
        preview: sellerQueuePreview(row),
      };
    }

    const snapshot = parseProductSnapshot(
      row.product_snapshot_schema_version,
      row.product_snapshot_json,
    );
    if (
      !row.product_id ||
      row.seller_preview_kind !== null ||
      row.seller_preview_asset_id !== null ||
      row.seller_preview_durable_status !== null ||
      row.seller_preview_error_code !== null ||
      snapshot.productId !== row.product_id ||
      snapshot.sellerId !== row.seller_id ||
      snapshot.coverImageId !== row.product_cover_image_id
    ) {
      throw administratorModerationUnavailable();
    }
    const activation = mapActivation(queueActivation(row));
    assertReviewActivation(row.review_status, activation);
    const delivery = row.product_cover_image_id
      ? productDeliveries.get(pairKey(row.product_id, row.product_cover_image_id))
      : undefined;

    return {
      ...common,
      submissionType: row.submission_type,
      product: {
        productId: row.product_id,
        title: snapshot.title,
        productCode: snapshot.productCode,
      },
      activation,
      preview: productQueuePreview(row.product_cover_image_id, delivery),
    };
  }

  private sellerDetail(
    record: AdministratorSellerModerationDetailRecord,
  ): AdministratorSellerModerationDetail {
    const proposed = parseSellerSnapshot(record.proposed.snapshot, {
      sellerId: record.sellerId,
      revision: record.revision,
    });
    if (record.sellerName !== proposed.name) throw administratorModerationUnavailable();
    const expectedType = proposed.submissionKind === "initial" ? "new_seller" : "seller_update";
    const proposedAssets = sellerAssets(proposed, record.proposed);
    const baselineSnapshot = record.comparisonBaseline
      ? parseSellerSnapshot(record.comparisonBaseline.snapshot, {
          sellerId: record.sellerId,
          revision: record.comparisonBaseline.revision,
        })
      : null;
    if ((expectedType === "new_seller") !== (baselineSnapshot === null)) {
      throw administratorModerationUnavailable();
    }
    const comparisonBaseline =
      record.comparisonBaseline && baselineSnapshot
        ? {
            submissionId: record.comparisonBaseline.submissionId,
            revision: record.comparisonBaseline.revision,
            snapshot: baselineSnapshot,
            assets: sellerAssets(baselineSnapshot, record.comparisonBaseline),
          }
        : null;

    return {
      kind: "seller",
      request: {
        submissionType: expectedType,
        submissionId: record.submissionId,
        seller: { sellerId: record.sellerId, name: record.sellerName },
        revision: record.revision,
        submittedAt: record.submittedAt,
        reviewStatus: record.reviewStatus,
        sellerVisibleReason: record.sellerVisibleReason,
        product: null,
        activation: null,
        preview: sellerDetailPreview(proposed, proposedAssets),
      },
      decision: decision(record),
      proposed: { snapshot: proposed, assets: proposedAssets },
      comparisonBaseline,
      currentApprovedReference: record.currentApprovedReference,
      changedFields: comparisonBaseline
        ? sellerChangedFields(proposed, comparisonBaseline.snapshot)
        : [],
      actions: { canDecide: record.canDecide },
    };
  }

  private async productDetail(
    record: AdministratorProductModerationDetailRecord,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<AdministratorProductModerationDetail> {
    const proposedSnapshot = parseProductSnapshot(
      record.proposed.snapshotSchemaVersion,
      record.proposed.snapshot,
    );
    assertProductRevision(record, proposedSnapshot, record.proposed.images, record.revision);
    const baselineSnapshot = record.comparisonBaseline
      ? parseProductSnapshot(
          record.comparisonBaseline.snapshotSchemaVersion,
          record.comparisonBaseline.snapshot,
        )
      : null;
    if (record.comparisonBaseline && baselineSnapshot) {
      assertProductRevision(
        record,
        baselineSnapshot,
        record.comparisonBaseline.images,
        record.comparisonBaseline.revision,
      );
    }
    if ((record.submissionKind === "initial_publication") !== (baselineSnapshot === null)) {
      throw administratorModerationUnavailable();
    }

    const delivery = await this.resolveProductDetailImages(record, authorization);
    const proposedImages = deliveredImages(record.productId, record.proposed.images, delivery);
    const comparisonBaseline =
      record.comparisonBaseline && baselineSnapshot
        ? {
            submissionId: record.comparisonBaseline.submissionId,
            revision: record.comparisonBaseline.revision,
            snapshotSchemaVersion: 1 as const,
            snapshot: baselineSnapshot,
            images: deliveredImages(record.productId, record.comparisonBaseline.images, delivery),
          }
        : null;
    const activation = mapActivation(record.activation);
    assertReviewActivation(record.reviewStatus, activation);
    const coverDelivery = proposedSnapshot.coverImageId
      ? delivery.get(pairKey(record.productId, proposedSnapshot.coverImageId))
      : undefined;

    return {
      kind: "product",
      request: {
        submissionType:
          record.submissionKind === "initial_publication" ? "initial_product" : "product_update",
        submissionId: record.submissionId,
        seller: { sellerId: record.sellerId, name: record.sellerName },
        revision: record.revision,
        submittedAt: record.submittedAt,
        reviewStatus: record.reviewStatus,
        sellerVisibleReason: record.sellerVisibleReason,
        product: {
          productId: record.productId,
          title: proposedSnapshot.title,
          productCode: proposedSnapshot.productCode,
        },
        activation,
        preview: productQueuePreview(proposedSnapshot.coverImageId, coverDelivery),
      },
      decision: decision(record),
      proposed: {
        snapshotSchemaVersion: 1,
        snapshot: proposedSnapshot,
        images: proposedImages,
      },
      comparisonBaseline,
      currentApprovedReference: record.currentApprovedReference,
      changedFields: baselineSnapshot
        ? productChangedFields(proposedSnapshot, baselineSnapshot)
        : [],
      actions: {
        canDecide: record.canDecide,
        canRetryDispatch: record.canRetryDispatch,
        canRetryActivation: record.canRetryActivation,
        canRetryPostSwitchCleanup: record.canRetryPostSwitchCleanup,
      },
    };
  }

  private async resolveQueueProductPreviews(
    rows: AdministratorModerationQueueRecord[],
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<Map<string, ProductDraftImageDeliveryResult>> {
    const entries = rows.flatMap((row) =>
      row.product_id && row.product_cover_image_id
        ? [{ productDraftId: row.product_id, imageIds: [row.product_cover_image_id] }]
        : [],
    );
    return this.resolveProductImages(groupDeliveryEntries(entries), authorization);
  }

  private async resolveProductDetailImages(
    record: AdministratorProductModerationDetailRecord,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<Map<string, ProductDraftImageDeliveryResult>> {
    const imageIds = new Set(record.proposed.images.map((image) => image.productDraftImageId));
    for (const image of record.comparisonBaseline?.images ?? []) {
      imageIds.add(image.productDraftImageId);
    }
    return this.resolveProductImages(
      imageIds.size ? [{ productDraftId: record.productId, imageIds: [...imageIds] }] : [],
      authorization,
    );
  }

  private async resolveProductImages(
    entries: Array<{ productDraftId: string; imageIds: string[] }>,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<Map<string, ProductDraftImageDeliveryResult>> {
    const result = new Map<string, ProductDraftImageDeliveryResult>();
    const chunks = chunkDeliveryEntries(entries);
    for (const chunk of chunks) {
      const response = await this.imageDelivery.resolve(chunk, authorization);
      for (const entry of response.entries) {
        for (const image of entry.images) {
          result.set(pairKey(entry.productDraftId, image.imageId), image);
        }
      }
    }
    return result;
  }
}

function normalizedFilters(
  request: AdministratorModerationRequest,
): AdministratorModerationFilters {
  return {
    submissionType: request.submissionType,
    reviewStatus: request.reviewStatus,
    activationStatus: request.activationStatus,
    sellerId: request.sellerId,
    limit: request.limit,
  };
}

function assertSellerQueueShape(row: AdministratorModerationQueueRecord): void {
  if (
    row.product_id !== null ||
    row.product_snapshot_schema_version !== null ||
    row.product_snapshot_json !== null ||
    row.product_cover_image_id !== null ||
    queueActivation(row) !== null
  ) {
    throw administratorModerationUnavailable();
  }
}

function sellerQueuePreview(
  row: AdministratorModerationQueueRecord,
): AdministratorModerationPreview {
  if (!row.seller_preview_asset_id) {
    if (
      row.seller_preview_kind !== null ||
      row.seller_preview_durable_status !== null ||
      row.seller_preview_error_code !== null
    ) {
      throw administratorModerationUnavailable();
    }
    return missingPreview();
  }
  if (!row.seller_preview_kind || !row.seller_preview_durable_status) {
    throw administratorModerationUnavailable();
  }
  const asset = sellerAssetDelivery({
    assetId: row.seller_preview_asset_id,
    kind: row.seller_preview_kind === "seller_logo" ? "logo" : "cover",
    durableStatus: row.seller_preview_durable_status,
    errorCode: row.seller_preview_error_code,
  });
  return {
    kind: row.seller_preview_kind,
    deliveryStatus: asset.deliveryStatus,
    deliveryErrorCode: asset.deliveryErrorCode,
    url: asset.url,
    expiresAt: null,
  };
}

function sellerDetailPreview(
  snapshot: SellerSubmissionSnapshot,
  assets: {
    logo: AdministratorSellerAssetDelivery | null;
    cover: AdministratorSellerAssetDelivery | null;
  },
): AdministratorModerationPreview {
  const selected = snapshot.logoAssetId
    ? { kind: "seller_logo" as const, asset: assets.logo }
    : snapshot.coverAssetId
      ? { kind: "seller_cover" as const, asset: assets.cover }
      : null;
  if (!selected) return missingPreview();
  if (!selected.asset) throw administratorModerationUnavailable();
  return {
    kind: selected.kind,
    deliveryStatus: selected.asset.deliveryStatus,
    deliveryErrorCode: selected.asset.deliveryErrorCode,
    url: selected.asset.url,
    expiresAt: null,
  };
}

function productQueuePreview(
  coverImageId: string | null,
  delivery: ProductDraftImageDeliveryResult | undefined,
): AdministratorModerationPreview {
  if (!coverImageId) return missingPreview();
  if (!delivery || delivery.imageId !== coverImageId) throw administratorModerationUnavailable();
  return {
    kind: "product_cover",
    deliveryStatus: normalizePreviewStatus(delivery.deliveryStatus),
    deliveryErrorCode: delivery.deliveryErrorCode,
    url: delivery.url,
    expiresAt: delivery.expiresAt,
  };
}

function missingPreview(): AdministratorModerationPreview {
  return {
    kind: "none",
    deliveryStatus: "missing",
    deliveryErrorCode: null,
    url: null,
    expiresAt: null,
  };
}

function normalizePreviewStatus(
  status: ProductDraftImageDeliveryResult["deliveryStatus"],
): AdministratorModerationPreview["deliveryStatus"] {
  return status === "deleting" ? "unavailable" : status;
}

function sellerAssets(
  snapshot: SellerSubmissionSnapshot,
  record: {
    logoAsset: AdministratorSellerAssetRecord | null;
    coverAsset: AdministratorSellerAssetRecord | null;
  },
): {
  logo: AdministratorSellerAssetDelivery | null;
  cover: AdministratorSellerAssetDelivery | null;
} {
  return {
    logo: checkedSellerAsset(snapshot.logoAssetId, "logo", record.logoAsset),
    cover: checkedSellerAsset(snapshot.coverAssetId, "cover", record.coverAsset),
  };
}

function checkedSellerAsset(
  assetId: string | null,
  kind: "logo" | "cover",
  record: AdministratorSellerAssetRecord | null,
): AdministratorSellerAssetDelivery | null {
  if (!assetId) {
    if (record) throw administratorModerationUnavailable();
    return null;
  }
  if (!record || record.assetId !== assetId || record.kind !== kind) {
    throw administratorModerationUnavailable();
  }
  return sellerAssetDelivery(record);
}

function sellerAssetDelivery(
  record: AdministratorSellerAssetRecord,
): AdministratorSellerAssetDelivery {
  const deliveryStatus =
    record.durableStatus === "available"
      ? "available"
      : record.durableStatus === "pending"
        ? "pending"
        : record.durableStatus === "failed"
          ? "failed"
          : record.durableStatus === "deleted"
            ? "missing"
            : "unavailable";
  return {
    assetId: record.assetId,
    kind: record.kind,
    deliveryStatus,
    deliveryErrorCode: record.errorCode,
    url: deliveryStatus === "available" ? `/v1/seller-profile-assets/${record.assetId}` : null,
  };
}

function parseSellerSnapshot(
  input: unknown,
  expected: { sellerId: string; revision: number },
): SellerSubmissionSnapshot {
  const parsed = sellerSubmissionSnapshotSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.sellerId !== expected.sellerId ||
    parsed.data.revision !== expected.revision
  ) {
    throw administratorModerationUnavailable();
  }
  return parsed.data;
}

function parseProductSnapshot(schemaVersion: number | null, input: unknown) {
  if (schemaVersion !== 1) throw administratorModerationUnavailable();
  const parsed = productModerationSnapshotSchema.safeParse(input);
  if (!parsed.success) throw administratorModerationUnavailable();
  assertUniqueDescriptions(parsed.data.descriptions);
  if (
    (parsed.data.productCodeInput !== null &&
      !isAdministratorModerationJson(parsed.data.productCodeInput)) ||
    (parsed.data.facts && !isAdministratorModerationJson(parsed.data.facts.facts))
  ) {
    throw administratorModerationUnavailable();
  }
  return parsed.data as AdministratorProductModerationSnapshot;
}

function assertProductRevision(
  record: Pick<AdministratorProductModerationDetailRecord, "productId" | "sellerId">,
  snapshot: ReturnType<typeof parseProductSnapshot>,
  images: AdministratorProductSubmissionImageRecord[],
  revision: number,
): void {
  if (
    snapshot.productId !== record.productId ||
    snapshot.sellerId !== record.sellerId ||
    revision < 1 ||
    !snapshotMatchesImages(snapshot.imageIds, snapshot.coverImageId, images)
  ) {
    throw administratorModerationUnavailable();
  }
}

function snapshotMatchesImages(
  imageIds: string[],
  coverImageId: string | null,
  images: AdministratorProductSubmissionImageRecord[],
): boolean {
  const ordered = [...images].sort((left, right) =>
    left.position === right.position
      ? left.productDraftImageId.localeCompare(right.productDraftImageId)
      : left.position - right.position,
  );
  if (
    new Set(ordered.map((image) => image.position)).size !== ordered.length ||
    imageIds.length !== ordered.length ||
    imageIds.some((id, index) => id !== ordered[index]?.productDraftImageId)
  ) {
    return false;
  }
  const covers = ordered.filter((image) => image.isCover);
  return covers.length <= 1 && (covers[0]?.productDraftImageId ?? null) === coverImageId;
}

function queueActivation(
  row: AdministratorModerationQueueRecord,
): AdministratorModerationActivationRecord | null {
  if (!row.activation_run_id) {
    if (
      row.activation_phase !== null ||
      row.activation_status !== null ||
      row.activation_dispatch_status !== null ||
      row.activation_dispatch_generation !== null ||
      row.activation_dispatch_error_code !== null ||
      row.activation_error_code !== null
    ) {
      throw administratorModerationUnavailable();
    }
    return null;
  }
  if (
    !row.activation_phase ||
    !row.activation_status ||
    !row.activation_dispatch_status ||
    !row.activation_dispatch_generation
  ) {
    throw administratorModerationUnavailable();
  }
  return {
    runId: row.activation_run_id,
    phase: row.activation_phase,
    status: row.activation_status,
    dispatchStatus: row.activation_dispatch_status,
    dispatchGeneration: row.activation_dispatch_generation,
    dispatchErrorCode: row.activation_dispatch_error_code,
    errorCode: row.activation_error_code,
  };
}

function mapActivation(record: AdministratorModerationActivationRecord | null) {
  return mapProductActivationStatus({
    activation_run_id: record?.runId ?? null,
    activation_phase: record?.phase ?? null,
    activation_status: record?.status ?? null,
    activation_dispatch_status: record?.dispatchStatus ?? null,
    activation_dispatch_generation: record?.dispatchGeneration ?? null,
    activation_dispatch_error_code: record?.dispatchErrorCode ?? null,
    activation_error_code: record?.errorCode ?? null,
  });
}

function assertReviewActivation(
  reviewStatus: AdministratorModerationQueueRecord["review_status"],
  activation: ReturnType<typeof mapActivation>,
): void {
  if ((reviewStatus === "approved") !== (activation !== null)) {
    throw administratorModerationUnavailable();
  }
}

function decision(record: {
  reviewStatus: AdministratorModerationQueueRecord["review_status"];
  administratorUserId: string | null;
  decisionRequestId: string | null;
  decidedAt: string | null;
  sellerVisibleReason: string | null;
}): AdministratorModerationDecision | null {
  if (record.reviewStatus === "pending" || record.reviewStatus === "withdrawn") {
    if (record.administratorUserId || record.decisionRequestId || record.decidedAt) {
      throw administratorModerationUnavailable();
    }
    return null;
  }
  if (!record.administratorUserId || !record.decisionRequestId || !record.decidedAt) {
    throw administratorModerationUnavailable();
  }
  return {
    administratorUserId: record.administratorUserId,
    decisionRequestId: record.decisionRequestId,
    decidedAt: record.decidedAt,
    sellerVisibleReason: record.sellerVisibleReason,
  };
}

function deliveredImages(
  productId: string,
  images: AdministratorProductSubmissionImageRecord[],
  delivery: ReadonlyMap<string, ProductDraftImageDeliveryResult>,
): AdministratorProductSubmissionImageDelivery[] {
  return images.map((image) => {
    const delivered = delivery.get(pairKey(productId, image.productDraftImageId));
    if (!delivered) throw administratorModerationUnavailable();
    return {
      ...image,
      deliveryStatus: delivered.deliveryStatus,
      deliveryErrorCode: delivered.deliveryErrorCode,
      url: delivered.url,
      expiresAt: delivered.expiresAt,
    };
  });
}

function groupDeliveryEntries(
  entries: Array<{ productDraftId: string; imageIds: string[] }>,
): Array<{ productDraftId: string; imageIds: string[] }> {
  const byProduct = new Map<string, Set<string>>();
  for (const entry of entries) {
    const imageIds = byProduct.get(entry.productDraftId) ?? new Set<string>();
    for (const imageId of entry.imageIds) imageIds.add(imageId);
    byProduct.set(entry.productDraftId, imageIds);
  }
  return [...byProduct].map(([productDraftId, imageIds]) => ({
    productDraftId,
    imageIds: [...imageIds],
  }));
}

function chunkDeliveryEntries(
  entries: Array<{ productDraftId: string; imageIds: string[] }>,
): Array<Array<{ productDraftId: string; imageIds: string[] }>> {
  const chunks: Array<Array<{ productDraftId: string; imageIds: string[] }>> = [];
  let current: Array<{ productDraftId: string; imageIds: string[] }> = [];
  let pairCount = 0;
  for (const entry of entries) {
    for (let offset = 0; offset < entry.imageIds.length;) {
      const remaining = PRODUCT_DRAFT_IMAGE_DELIVERY_MAX_PAIRS - pairCount;
      if (remaining === 0) {
        chunks.push(current);
        current = [];
        pairCount = 0;
        continue;
      }
      const imageIds = entry.imageIds.slice(offset, offset + remaining);
      current.push({ productDraftId: entry.productDraftId, imageIds });
      pairCount += imageIds.length;
      offset += imageIds.length;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function sellerChangedFields(
  proposed: SellerSubmissionSnapshot,
  baseline: SellerSubmissionSnapshot,
): string[] {
  const fields: Array<[string, unknown, unknown]> = [
    ["name", proposed.name, baseline.name],
    ["slug", proposed.slug, baseline.slug],
    ["city", proposed.city, baseline.city],
    ["country", proposed.country, baseline.country],
    ["whatsapp", proposed.whatsapp, baseline.whatsapp],
    ["email", proposed.email, baseline.email],
    ["about", proposed.about, baseline.about],
    ["logo", proposed.logoAssetId, baseline.logoAssetId],
    ["cover", proposed.coverAssetId, baseline.coverAssetId],
    ["establishedYear", proposed.establishedYear, baseline.establishedYear],
  ];
  return fields.filter(([, left, right]) => left !== right).map(([field]) => field);
}

function productChangedFields(
  proposed: ReturnType<typeof parseProductSnapshot>,
  baseline: ReturnType<typeof parseProductSnapshot>,
): string[] {
  const fields: Array<[string, unknown, unknown]> = [
    ["title", proposed.title, baseline.title],
    ["titleSource", proposed.titleSource, baseline.titleSource],
    ["productCode", proposed.productCode, baseline.productCode],
    ["category", proposed.categoryId, baseline.categoryId],
    ["audiences", sortedSet(proposed.audiences), sortedSet(baseline.audiences)],
    ["descriptions", descriptionMap(proposed.descriptions), descriptionMap(baseline.descriptions)],
    ["facts", proposed.facts?.facts ?? null, baseline.facts?.facts ?? null],
    ["price", proposed.price, baseline.price],
    ["currency", proposed.currency, baseline.currency],
    ["stock", proposed.stock, baseline.stock],
    ["images", proposed.imageIds, baseline.imageIds],
    ["coverImage", proposed.coverImageId, baseline.coverImageId],
  ];
  return fields
    .filter(([, left, right]) => canonicalJson(left) !== canonicalJson(right))
    .map(([field]) => field);
}

function sortedSet(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function descriptionMap(
  descriptions: Array<{ language: string; descriptionText: string }>,
): Record<string, string> {
  return Object.fromEntries(
    [...descriptions]
      .sort((left, right) => left.language.localeCompare(right.language))
      .map((description) => [description.language, description.descriptionText]),
  );
}

function assertUniqueDescriptions(descriptions: Array<{ language: string }>): void {
  if (
    new Set(descriptions.map((description) => description.language)).size !== descriptions.length
  ) {
    throw administratorModerationUnavailable();
  }
}

function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalValue(value));
  if (serialized === undefined) throw administratorModerationUnavailable();
  return serialized;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

function isAdministratorModerationJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isAdministratorModerationJson);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isAdministratorModerationJson);
}

function pairKey(productId: string, imageId: string): string {
  return `${productId}:${imageId}`;
}
