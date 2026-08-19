import { z } from "zod";

import {
  ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES,
  ADMINISTRATOR_MODERATION_REVIEW_STATUSES,
  ADMINISTRATOR_MODERATION_SUBMISSION_TYPES,
  invalidAdministratorModerationRequest,
  type AdministratorModerationFilters,
} from "./administrator-moderation.types";

const CURSOR_VERSION = 1;

const cursorSchema = z
  .object({
    version: z.literal(CURSOR_VERSION),
    submittedAt: z.string().datetime({ offset: true }),
    submissionType: z.enum(ADMINISTRATOR_MODERATION_SUBMISSION_TYPES),
    submissionId: z.string().uuid(),
    filters: z
      .object({
        submissionType: z.enum(ADMINISTRATOR_MODERATION_SUBMISSION_TYPES).nullable(),
        reviewStatus: z.enum(ADMINISTRATOR_MODERATION_REVIEW_STATUSES),
        activationStatus: z.enum(ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES).nullable(),
        sellerId: z.string().uuid().nullable(),
        limit: z.number().int().min(1).max(100),
      })
      .strict(),
  })
  .strict();

export type AdministratorModerationCursor = z.infer<typeof cursorSchema>;

export function encodeAdministratorModerationCursor(
  input: Omit<AdministratorModerationCursor, "version">,
): string {
  return Buffer.from(JSON.stringify({ version: CURSOR_VERSION, ...input }), "utf8").toString(
    "base64url",
  );
}

export function decodeAdministratorModerationCursor(
  value: string,
  filters: AdministratorModerationFilters,
): AdministratorModerationCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidAdministratorModerationRequest();

  let decoded: unknown;
  try {
    const text = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(text, "utf8").toString("base64url") !== value) {
      throw invalidAdministratorModerationRequest();
    }
    decoded = JSON.parse(text);
  } catch {
    throw invalidAdministratorModerationRequest();
  }

  const parsed = cursorSchema.safeParse(decoded);
  if (!parsed.success || !sameFilters(parsed.data.filters, filters)) {
    throw invalidAdministratorModerationRequest();
  }
  return parsed.data;
}

function sameFilters(
  left: AdministratorModerationFilters,
  right: AdministratorModerationFilters,
): boolean {
  return (
    left.submissionType === right.submissionType &&
    left.reviewStatus === right.reviewStatus &&
    left.activationStatus === right.activationStatus &&
    left.sellerId === right.sellerId &&
    left.limit === right.limit
  );
}
