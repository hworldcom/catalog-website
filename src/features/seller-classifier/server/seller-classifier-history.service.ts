import {
  decodeSellerClassifierHistoryCursor,
  encodeSellerClassifierHistoryCursor,
} from "../seller-classifier-history.cursor";
import {
  sellerClassifierHistoryUnavailable,
  type SellerClassifierHistoryErrorSummaryCode,
  type SellerClassifierHistoryItem,
  type SellerClassifierHistoryPage,
  type SellerClassifierHistoryPrimaryAction,
  type SellerClassifierHistoryRequest,
} from "../seller-classifier-history.types";
import type {
  SellerClassifierHistoryRecord,
  SellerClassifierHistoryRepository,
} from "./seller-classifier-history.repository";
import { SellerClassifierHistoryRepositoryError } from "./seller-classifier-history.repository";

const PROCESSING_FAILURE = "seller_classifier_processing_failed";
const INCOMPLETE_IMPORT = "seller_classifier_import_incomplete";

export class SellerClassifierHistoryService {
  constructor(private readonly repository: SellerClassifierHistoryRepository) {}

  async list(
    sellerId: string,
    request: SellerClassifierHistoryRequest,
  ): Promise<SellerClassifierHistoryPage> {
    const before = request.cursor ? decodeSellerClassifierHistoryCursor(request.cursor) : null;

    let records: SellerClassifierHistoryRecord[];
    try {
      records = await this.repository.listOwned({
        sellerId,
        limit: request.limit + 1,
        before,
      });
    } catch (error) {
      if (error instanceof SellerClassifierHistoryRepositoryError) {
        throw sellerClassifierHistoryUnavailable();
      }
      throw error;
    }

    const hasMore = records.length > request.limit;
    const pageRecords = records.slice(0, request.limit);
    const last = pageRecords.at(-1);

    return {
      workflows: pageRecords.map(toHistoryItem),
      nextCursor:
        hasMore && last
          ? encodeSellerClassifierHistoryCursor({
              createdAt: last.createdAt,
              workflowId: last.id,
            })
          : null,
    };
  }
}

function toHistoryItem(record: SellerClassifierHistoryRecord): SellerClassifierHistoryItem {
  const importFailure = record.stage === "failed" && record.import !== null;
  const processingFailure = record.stage === "failed" && record.errorCode === PROCESSING_FAILURE;

  return {
    workflowId: record.id,
    initiatorKind: record.initiatorKind,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    stage: record.stage,
    counts: {
      originalFiles: record.stage === "provisioning" ? null : record.originalFileCount,
      processedFiles:
        isObservedProcessingStage(record.stage) || importFailure || processingFailure
          ? record.processedFileCount
          : null,
      groups: isObservedGroupStage(record.stage) || importFailure ? record.groupCount : null,
      productDrafts: record.import ? record.productDraftCount : null,
    },
    errorSummaryCode: errorSummary(record),
    supportReference: record.stage === "failed" && !isRetryable(record) ? record.id : null,
    primaryAction: primaryAction(record),
  };
}

function primaryAction(
  record: SellerClassifierHistoryRecord,
): SellerClassifierHistoryPrimaryAction {
  switch (record.stage) {
    case "provisioning":
      return "none";
    case "upload":
      return "open_upload";
    case "processing":
      return "open_processing";
    case "review":
      return "open_review";
    case "approved":
    case "importing":
    case "drafts_ready":
      return "open_import";
    case "failed":
      if (record.provisioningStatus === "failed") {
        return record.retryable ? "retry_provisioning" : "none";
      }
      if (record.import) return "open_import";
      if (record.errorCode === PROCESSING_FAILURE) return "open_processing";
      return "none";
  }
}

function errorSummary(
  record: SellerClassifierHistoryRecord,
): SellerClassifierHistoryErrorSummaryCode | null {
  if (record.stage !== "failed") return null;
  if (record.provisioningStatus === "failed") return "provisioning_failed";
  if (record.import) {
    return record.errorCode === INCOMPLETE_IMPORT || record.import.errorCode === INCOMPLETE_IMPORT
      ? "import_incomplete"
      : "import_failed";
  }
  if (record.errorCode === PROCESSING_FAILURE) return "processing_failed";
  return "unexpected_failure";
}

function isRetryable(record: SellerClassifierHistoryRecord): boolean {
  return record.retryable || record.import?.retryable === true;
}

function isObservedProcessingStage(stage: SellerClassifierHistoryRecord["stage"]): boolean {
  return (
    stage === "processing" ||
    stage === "review" ||
    stage === "approved" ||
    stage === "importing" ||
    stage === "drafts_ready"
  );
}

function isObservedGroupStage(stage: SellerClassifierHistoryRecord["stage"]): boolean {
  return (
    stage === "review" || stage === "approved" || stage === "importing" || stage === "drafts_ready"
  );
}
