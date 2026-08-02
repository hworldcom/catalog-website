import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  PreservedIdentitySnapshot,
  ProductDataResetGateway,
  ProductDataResetStorageEntry,
  PRODUCT_DATA_RESET_BUCKETS,
} from "./product-data-reset.service";

type AdminClient = SupabaseClient<Database>;
type ProductBucket = (typeof PRODUCT_DATA_RESET_BUCKETS)[number];

export class SupabaseProductDataResetGateway implements ProductDataResetGateway {
  constructor(private readonly database: AdminClient) {}

  async listAuthUserIds(page: number, pageSize: number): Promise<string[]> {
    const response = await this.database.auth.admin.listUsers({ page, perPage: pageSize });
    if (response.error) throw response.error;
    return response.data.users.map((user) => user.id);
  }

  async listUserRoles(
    offset: number,
    pageSize: number,
  ): Promise<Array<{ user_id: string; role: string }>> {
    const response = await this.database
      .from("user_roles")
      .select("user_id,role")
      .order("user_id")
      .order("role")
      .range(offset, offset + pageSize - 1);
    if (response.error) throw response.error;
    return response.data;
  }

  async listSellers(
    offset: number,
    pageSize: number,
  ): Promise<PreservedIdentitySnapshot["sellers"]> {
    const response = await this.database
      .from("sellers")
      .select("id,owner_id,name,slug,company_code,company_code_locked_at")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (response.error) throw response.error;
    return response.data;
  }

  async listStorageEntries(
    bucket: ProductBucket,
    prefix: string,
    offset: number,
    pageSize: number,
  ): Promise<ProductDataResetStorageEntry[]> {
    const response = await this.database.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (response.error) throw response.error;
    return response.data.map((entry) => ({ name: entry.name, id: entry.id ?? null }));
  }

  async removeStorageObjects(bucket: ProductBucket, objectNames: string[]): Promise<number> {
    if (objectNames.length === 0) return 0;
    const response = await this.database.storage.from(bucket).remove(objectNames);
    if (response.error) throw response.error;
    return response.data?.length ?? 0;
  }
}
