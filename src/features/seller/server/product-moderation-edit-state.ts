import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  productModerationSnapshotSchema,
  type ProductModerationSnapshot,
} from "@/features/seller/product-moderation-snapshot.types";
import type { Database, Json } from "@/lib/supabase/types";

const editStateRowSchema = z.object({
  product_id: z.string().uuid(),
  seller_id: z.string().uuid(),
  product_status: z.enum(["draft", "published", "archived"]),
  revision: z.number().int().positive(),
  editable: z.boolean(),
  working_copy: z.boolean(),
  snapshot_json: productModerationSnapshotSchema,
});

export type ProductModerationEditState = {
  productId: string;
  sellerId: string;
  productStatus: "draft" | "published" | "archived";
  revision: number;
  editable: boolean;
  workingCopy: boolean;
  snapshot: ProductModerationSnapshot;
};

export async function readProductModerationEditState(
  database: SupabaseClient<Database>,
  productId: string,
  expectedSellerId: string | null,
): Promise<ProductModerationEditState | null> {
  const response = await database.rpc(
    "read_product_moderation_edit_state" as never,
    {
      p_product_id: productId,
      p_expected_seller_id: expectedSellerId,
    } as never,
  );
  if (response.error) {
    throw new Error(`Product moderation edit-state read failed: ${response.error.message}`);
  }
  const parsed = z.array(editStateRowSchema).safeParse(response.data as Json);
  if (!parsed.success || parsed.data.length > 1) {
    throw new Error("Product moderation edit-state read returned an invalid response.");
  }
  const row = parsed.data[0];
  if (!row) return null;
  if (
    row.snapshot_json.productId !== row.product_id ||
    row.snapshot_json.sellerId !== row.seller_id
  ) {
    throw new Error("Product moderation edit-state identity is inconsistent.");
  }
  return {
    productId: row.product_id,
    sellerId: row.seller_id,
    productStatus: row.product_status,
    revision: row.revision,
    editable: row.editable,
    workingCopy: row.working_copy,
    snapshot: row.snapshot_json,
  };
}
