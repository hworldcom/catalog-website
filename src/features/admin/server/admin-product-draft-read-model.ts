import {
  productDraftSourceInconsistent,
  type AdminProductDraftSource,
} from "../admin-product-draft-index.types";
import type { AdminProductDraftIndexSourceRecord } from "./admin-product-draft-index.repository";

export function resolveAdminProductDraftSource(
  sources: AdminProductDraftIndexSourceRecord[],
): AdminProductDraftSource | null {
  if (sources.length === 0) return null;
  const first = sources[0]!;
  if (
    sources.some(
      (source) =>
        source.classifier_organization_id !== first.classifier_organization_id ||
        source.classifier_batch_id !== first.classifier_batch_id ||
        source.classifier_group_id !== first.classifier_group_id,
    )
  ) {
    throw productDraftSourceInconsistent();
  }

  return {
    classifierOrganizationId: first.classifier_organization_id,
    classifierBatchId: first.classifier_batch_id,
    classifierGroupId: first.classifier_group_id,
  };
}

export function selectAdminProductDraftPreviewImageId(
  coverImageId: string | null,
  orderedImageIds: string[],
): string | null {
  return coverImageId ?? orderedImageIds[0] ?? null;
}
