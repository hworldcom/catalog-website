import type { Database } from "@/lib/supabase/types";

import { PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION } from "./legacy-product-draft-image-cutover.types";

export const ADMIN_PRODUCT_DRAFTS_NOT_ENABLED = "admin_product_drafts_not_enabled";

export class AdminProductDraftGateError extends Error {
  readonly statusCode = 503;
  readonly code = ADMIN_PRODUCT_DRAFTS_NOT_ENABLED;

  constructor() {
    super("Administrator ProductDraft review is not enabled.");
    this.name = "AdminProductDraftGateError";
  }
}

export interface ProductDraftImageCutoverStatusReader {
  getStatus(
    version: string,
  ): Promise<Database["public"]["Enums"]["product_draft_image_storage_cutover_status"] | null>;
}

export class ProductDraftAdminGate {
  private completedCacheExpiresAt = 0;

  constructor(
    private readonly reader: ProductDraftImageCutoverStatusReader,
    private readonly environmentEnabled: boolean,
    private readonly now: () => number = Date.now,
  ) {}

  async assertEnabled(): Promise<void> {
    if (!this.environmentEnabled) throw new AdminProductDraftGateError();
    if (this.completedCacheExpiresAt > this.now()) return;

    let status;
    try {
      status = await this.reader.getStatus(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION);
    } catch (error) {
      console.error("[ProductDraft admin gate] Cutover state could not be read.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      throw new AdminProductDraftGateError();
    }
    if (status !== "completed") throw new AdminProductDraftGateError();
    this.completedCacheExpiresAt = this.now() + 30_000;
  }
}

export function readAdminProductDraftsEnabled(
  value = process.env.BAZORIA_ADMIN_PRODUCT_DRAFTS_ENABLED,
): boolean {
  return value === "true";
}
