import { normalizeLanguage, type Lang } from "@/lib/i18n";

import {
  ADMINISTRATOR_MODERATION_SUBMISSION_TYPES,
  AdministratorModerationError,
  parseAdministratorModerationRequest,
  type AdministratorModerationRequest,
  type AdministratorModerationSubmissionType,
} from "./administrator-moderation.types";

export type AdministratorModerationReviewRouteSearch = {
  returnSubmissionType?: unknown;
  returnReviewStatus?: unknown;
  returnActivationStatus?: unknown;
  returnSellerId?: unknown;
  returnLimit?: unknown;
  returnCursor?: unknown;
  lang?: unknown;
};

export type AdministratorModerationReviewRouteState =
  | {
      valid: true;
      submissionType: AdministratorModerationSubmissionType;
      submissionId: string;
      family: "seller" | "product";
      lang: Lang;
      backHref: string;
      returnRequest: AdministratorModerationRequest;
      returnStateValid: boolean;
    }
  | {
      valid: false;
      lang: Lang;
      backHref: string;
    };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdministratorModerationReviewRoute(
  params: { submissionType: unknown; submissionId: unknown },
  search: AdministratorModerationReviewRouteSearch,
): AdministratorModerationReviewRouteState {
  const lang = normalizeLanguage(search.lang);
  const returnState = parseReturnState(search, lang);
  if (
    typeof params.submissionType !== "string" ||
    !isSubmissionType(params.submissionType) ||
    typeof params.submissionId !== "string" ||
    !uuidPattern.test(params.submissionId)
  ) {
    return { valid: false, lang, backHref: returnState.backHref };
  }

  return {
    valid: true,
    submissionType: params.submissionType,
    submissionId: params.submissionId,
    family:
      params.submissionType === "new_seller" || params.submissionType === "seller_update"
        ? "seller"
        : "product",
    lang,
    ...returnState,
  };
}

export function administratorModerationQueueHref(
  request: AdministratorModerationRequest,
  lang: Lang,
): string {
  const search = new URLSearchParams({
    reviewStatus: request.reviewStatus,
    limit: String(request.limit),
    lang,
  });
  if (request.submissionType) search.set("submissionType", request.submissionType);
  if (request.activationStatus) search.set("activationStatus", request.activationStatus);
  if (request.sellerId) search.set("sellerId", request.sellerId);
  if (request.cursor) search.set("cursor", request.cursor);
  return `/admin/moderation?${search.toString()}`;
}

function parseReturnState(
  search: AdministratorModerationReviewRouteSearch,
  lang: Lang,
): {
  backHref: string;
  returnRequest: AdministratorModerationRequest;
  returnStateValid: boolean;
} {
  const fallback = parseAdministratorModerationRequest({ limit: 25, reviewStatus: "pending" });
  try {
    const request = parseAdministratorModerationRequest({
      submissionType: optionalString(search.returnSubmissionType),
      reviewStatus: optionalString(search.returnReviewStatus),
      activationStatus: optionalString(search.returnActivationStatus),
      sellerId: optionalString(search.returnSellerId),
      limit: parseLimit(search.returnLimit),
      cursor: optionalString(search.returnCursor),
    });
    return {
      backHref: administratorModerationQueueHref(request, lang),
      returnRequest: request,
      returnStateValid: true,
    };
  } catch (error) {
    if (
      !(error instanceof AdministratorModerationError) ||
      error.code !== "moderation_request_invalid"
    ) {
      throw error;
    }
    return {
      backHref: administratorModerationQueueHref(fallback, lang),
      returnRequest: fallback,
      returnStateValid: false,
    };
  }
}

function isSubmissionType(value: string): value is AdministratorModerationSubmissionType {
  return (ADMINISTRATOR_MODERATION_SUBMISSION_TYPES as readonly string[]).includes(value);
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
  if (value === undefined || value === null) return 25;
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}
