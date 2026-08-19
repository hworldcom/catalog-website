import {
  READ_ONLY_MODERATION_IMAGE_REFRESH_MARGIN_MS,
  READ_ONLY_MODERATION_POLL_INTERVAL_MS,
  readOnlyModerationImageCredentialIdentity,
  shouldPollReadOnlyModeration,
  useReadOnlyModerationRefresh,
  type ReadOnlyModerationDescriptor,
} from "@/features/moderation/read-only-moderation-refresh";

import type {
  ProductModerationStatusDetail,
  ProductModerationSubmittedImage,
} from "./product-moderation-status.types";

export const PRODUCT_MODERATION_POLL_INTERVAL_MS = READ_ONLY_MODERATION_POLL_INTERVAL_MS;
export const PRODUCT_MODERATION_IMAGE_REFRESH_MARGIN_MS =
  READ_ONLY_MODERATION_IMAGE_REFRESH_MARGIN_MS;

type ProductModerationStatusRefreshOptions = {
  status: ProductModerationStatusDetail;
  readStatus(): Promise<ProductModerationStatusDetail>;
  onStatus(status: ProductModerationStatusDetail): void;
};

export function useProductModerationStatusRefresh({
  status,
  readStatus,
  onStatus,
}: ProductModerationStatusRefreshOptions) {
  const refresh = useReadOnlyModerationRefresh({
    detail: status,
    readDetail: readStatus,
    onDetail: onStatus,
    describe: describeProductModerationStatus,
  });
  return {
    failedCredentialIdentities: refresh.failedCredentialIdentities,
    handleImageError: refresh.handleImageError,
    readWarning: refresh.readWarning,
    refreshStatus: refresh.refreshDetail,
    refreshing: refresh.refreshing,
  };
}

export function shouldPollProductModerationStatus(status: ProductModerationStatusDetail): boolean {
  return shouldPollReadOnlyModeration(describeProductModerationStatus(status));
}

export function productModerationImageCredentialIdentity(
  submissionId: string,
  image: ProductModerationSubmittedImage,
): string | null {
  return readOnlyModerationImageCredentialIdentity(submissionId, image);
}

function describeProductModerationStatus(
  status: ProductModerationStatusDetail,
): ReadOnlyModerationDescriptor {
  const submitted = status.submittedRevision;
  return {
    activationDisplayState: status.activation?.displayState ?? null,
    reviewStatus: status.review?.status ?? null,
    imageCredentials: submitted
      ? submitted.images.map((image) => ({
          submissionId: submitted.submissionId,
          image,
        }))
      : [],
  };
}
