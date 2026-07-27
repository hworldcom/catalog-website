import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { ProductDraftImageCutoverStatusReader } from "./product-draft-admin-gate";

export class SupabaseProductDraftImageCutoverStatusReader implements ProductDraftImageCutoverStatusReader {
  constructor(private readonly database: SupabaseClient<Database>) {}

  async getStatus(
    version: string,
  ): Promise<Database["public"]["Enums"]["product_draft_image_storage_cutover_status"] | null> {
    const response = await this.database
      .from("product_draft_image_storage_cutovers")
      .select("status")
      .eq("version", version)
      .maybeSingle();
    if (response.error) {
      throw new Error(`ProductDraft image cutover database read failed: ${response.error.message}`);
    }
    return response.data?.status ?? null;
  }
}
