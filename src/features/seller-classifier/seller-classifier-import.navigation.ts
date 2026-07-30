import { z } from "zod";

import { languages } from "@/lib/i18n";

export const SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE = "groups-not-approved" as const;

const langSchema = z.enum(languages);

const reviewSearchSchema = z
  .object({
    lang: langSchema.optional(),
    notice: z.literal(SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE).optional(),
  })
  .strict();

const importSearchSchema = z
  .object({
    lang: langSchema.optional(),
  })
  .strict();

export function parseSellerClassifierReviewSearch(input: unknown) {
  return reviewSearchSchema.parse(input ?? {});
}

export function parseSellerClassifierImportSearch(input: unknown) {
  return importSearchSchema.parse(input ?? {});
}
