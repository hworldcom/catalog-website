import type { ReadOnlyModerationDescriptor } from "@/features/moderation/read-only-moderation-refresh";

import type {
  AdministratorProductModerationDetail,
  AdministratorSellerModerationDetail,
} from "./administrator-moderation.types";

export function administratorProductRefreshDescriptor(
  detail: AdministratorProductModerationDetail,
): ReadOnlyModerationDescriptor {
  return {
    activationDisplayState: detail.request.activation?.displayState ?? null,
    reviewStatus: detail.request.reviewStatus,
    imageCredentials: [
      ...detail.proposed.images.map((image) => ({
        submissionId: detail.request.submissionId,
        image,
      })),
      ...(detail.comparisonBaseline?.images.map((image) => ({
        submissionId: detail.comparisonBaseline?.submissionId ?? detail.request.submissionId,
        image,
      })) ?? []),
    ],
  };
}

export function administratorSellerRefreshDescriptor(
  detail: AdministratorSellerModerationDetail,
): ReadOnlyModerationDescriptor {
  return {
    activationDisplayState: null,
    reviewStatus: detail.request.reviewStatus,
    imageCredentials: [],
  };
}
