import { normalizeLanguage, type Lang } from "@/lib/i18n";

import {
  ADMINISTRATOR_MODERATION_DEFAULT_LIMIT,
  AdministratorModerationError,
  parseAdministratorModerationRequest,
  type AdministratorModerationRequest,
  type AdministratorModerationSubmissionType,
} from "./administrator-moderation.types";

export type AdministratorModerationRouteSearch = {
  submissionType?: unknown;
  reviewStatus?: unknown;
  activationStatus?: unknown;
  sellerId?: unknown;
  limit?: unknown;
  cursor?: unknown;
  lang?: unknown;
};

export type AdministratorModerationRouteState =
  | {
      valid: true;
      request: AdministratorModerationRequest;
      lang: Lang;
    }
  | {
      valid: false;
      lang: Lang;
    };

export function parseAdministratorModerationRouteSearch(
  search: AdministratorModerationRouteSearch,
): AdministratorModerationRouteState {
  const lang = normalizeLanguage(search.lang);
  try {
    return {
      valid: true,
      lang,
      request: parseAdministratorModerationRequest({
        submissionType: optionalString(search.submissionType),
        reviewStatus: optionalString(search.reviewStatus),
        activationStatus: optionalString(search.activationStatus),
        sellerId: optionalString(search.sellerId),
        limit: parseLimit(search.limit),
        cursor: optionalString(search.cursor),
      }),
    };
  } catch (error) {
    if (
      error instanceof AdministratorModerationError &&
      error.code === "moderation_request_invalid"
    ) {
      return { valid: false, lang };
    }
    throw error;
  }
}

export function administratorModerationDefaultRequest(): AdministratorModerationRequest {
  return {
    submissionType: null,
    reviewStatus: "pending",
    activationStatus: null,
    sellerId: null,
    limit: ADMINISTRATOR_MODERATION_DEFAULT_LIMIT,
    cursor: null,
  };
}

export function administratorModerationSearchForRequest(
  request: AdministratorModerationRequest,
): Record<string, string | number | undefined> {
  return {
    submissionType: request.submissionType ?? undefined,
    reviewStatus: request.reviewStatus,
    activationStatus: request.activationStatus ?? undefined,
    sellerId: request.sellerId ?? undefined,
    limit: request.limit,
    cursor: request.cursor ?? undefined,
  };
}

export function buildAdministratorModerationDetailHref(
  submissionType: AdministratorModerationSubmissionType,
  submissionId: string,
  request: AdministratorModerationRequest,
  lang: Lang,
): string {
  const search = new URLSearchParams({
    returnReviewStatus: request.reviewStatus,
    returnLimit: String(request.limit),
    lang,
  });
  if (request.submissionType) search.set("returnSubmissionType", request.submissionType);
  if (request.activationStatus) search.set("returnActivationStatus", request.activationStatus);
  if (request.sellerId) search.set("returnSellerId", request.sellerId);
  if (request.cursor) search.set("returnCursor", request.cursor);

  return (
    `/admin/moderation/${encodeURIComponent(submissionType)}/${encodeURIComponent(submissionId)}` +
    `?${search.toString()}`
  );
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new AdministratorModerationError(
      400,
      "moderation_request_invalid",
      "The moderation request is invalid.",
    );
  }
  return value;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null) return ADMINISTRATOR_MODERATION_DEFAULT_LIMIT;
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}
