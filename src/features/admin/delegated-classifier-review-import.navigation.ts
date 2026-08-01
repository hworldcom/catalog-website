import { z } from "zod";

import { languages } from "@/lib/i18n";
import { SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE } from "@/features/seller-classifier/seller-classifier-import.navigation";

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

export function parseDelegatedClassifierReviewSearch(input: unknown) {
  return reviewSearchSchema.parse(input ?? {});
}

export function parseDelegatedClassifierImportSearch(input: unknown) {
  return importSearchSchema.parse(input ?? {});
}
