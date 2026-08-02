import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  SellerProductArchiveRepository,
  SellerProductArchiveRepositoryResult,
} from "./seller-product-archive.repository";
import { SellerProductArchiveRepositoryError } from "./seller-product-archive.repository";

type AdminClient = SupabaseClient<Database>;

export class SupabaseSellerProductArchiveRepository implements SellerProductArchiveRepository {
  constructor(private readonly database: AdminClient) {}

  async archive(
    productId: string,
    sellerId: string,
  ): Promise<SellerProductArchiveRepositoryResult> {
    const response = await this.database.rpc("archive_seller_product", {
      p_product_id: productId,
      p_seller_id: sellerId,
    });
    if (response.error) {
      throw new SellerProductArchiveRepositoryError("Seller product archive operation failed.");
    }

    const row = response.data?.[0];
    if (!row) {
      throw new SellerProductArchiveRepositoryError("Seller product archive returned no result.");
    }
    if (row.result === "product_not_found") return { result: row.result };
    if (row.result === "product_archive_not_allowed") return { result: row.result };
    if (row.result !== "archived" || !row.product_id || row.product_status !== "archived") {
      throw new SellerProductArchiveRepositoryError(
        "Seller product archive returned an invalid result.",
      );
    }
    return {
      result: "archived",
      productId: row.product_id,
      productStatus: row.product_status,
    };
  }
}
