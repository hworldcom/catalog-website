import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  HumanProductDraftTitleWrite,
  ProductDraftTitleCreateResult,
  ProductDraftTitleRecord,
  ProductDraftTitleRepository,
  ProductDraftTitleUpdateResult,
  SellerProductFields,
} from "../product-draft-title.repository";
import { parseStoredProductDraftTitleSource } from "../product-draft-title.types";

type AdminClient = SupabaseClient<Database>;

const titleFields = "id,title,title_source,status" as const;

export class SupabaseProductDraftTitleRepository implements ProductDraftTitleRepository {
  constructor(private readonly database: AdminClient) {}

  async get(
    productDraftId: string,
    expectedSellerId: string | null,
  ): Promise<ProductDraftTitleRecord | null> {
    let query = this.database.from("products").select(titleFields).eq("id", productDraftId);
    if (expectedSellerId) query = query.eq("seller_id", expectedSellerId);

    const response = await query.maybeSingle();
    if (response.error) throwDatabaseError(response.error);
    return response.data ? record(response.data) : null;
  }

  async update(
    productDraftId: string,
    expectedSellerId: string,
    titleWrite: HumanProductDraftTitleWrite | null,
    productFields: SellerProductFields,
  ): Promise<ProductDraftTitleUpdateResult> {
    const result = await this.saveSellerProduct(
      productDraftId,
      expectedSellerId,
      titleWrite,
      productFields,
    );
    if (result.result === "not_found") return result;
    if (result.result === "not_editable") return result;
    if (result.result === "title_required" || result.result === "title_invalid") return result;
    if (
      result.result === "product_publication_category_required" ||
      result.result === "product_category_not_supported" ||
      result.result === "product_code_company_unconfigured" ||
      result.result === "product_code_category_unconfigured" ||
      result.result === "product_code_allocation_failed"
    ) {
      return result;
    }
    if (result.result === "facts_missing") {
      throw new Error("ProductDraft facts record is missing.");
    }
    return result.result === "updated" ? result : { result: "invalid" };
  }

  async updateTitle(
    productDraftId: string,
    expectedSellerId: string | null,
    titleWrite: HumanProductDraftTitleWrite,
  ): Promise<ProductDraftTitleUpdateResult> {
    return this.applyTitleUpdate(productDraftId, expectedSellerId, titleWrite);
  }

  async create(
    sellerId: string,
    titleWrite: HumanProductDraftTitleWrite | null,
    productFields: SellerProductFields,
  ): Promise<ProductDraftTitleCreateResult> {
    const response = await this.database.rpc("create_seller_product_with_description", {
      p_seller_id: sellerId,
      p_title_patch_present: titleWrite !== null,
      p_title: titleWrite?.title ?? null,
      p_description_patch_present: hasDescriptionPatch(productFields),
      p_description: productFields.description ?? null,
      p_category_id: productFields.category_id ?? null,
      p_moq: productFields.moq ?? null,
      p_pack_size: productFields.pack_size ?? null,
      p_price: productFields.price ?? null,
      p_currency: productFields.currency ?? "USD",
      p_stock: productFields.stock ?? "in_stock",
      p_cover_image_url_patch_present: hasCoverImageUrlPatch(productFields),
      p_cover_image_url: productFields.cover_image_url ?? null,
      p_trending: productFields.trending ?? false,
      p_status: productFields.status ?? "draft",
    });
    if (response.error) {
      if (isTitleInvalid(response.error)) return { result: "invalid" };
      throwDatabaseError(response.error);
    }

    const row = response.data?.[0];
    if (!row) throw new Error("Seller ProductDraft creation returned no result.");
    if (
      row.result === "title_required" ||
      row.result === "title_invalid" ||
      row.result === "product_category_required" ||
      row.result === "product_publication_category_required" ||
      row.result === "product_category_not_supported" ||
      row.result === "product_code_company_unconfigured" ||
      row.result === "product_code_category_unconfigured" ||
      row.result === "product_code_allocation_failed"
    ) {
      return { result: row.result };
    }
    if (
      row.result !== "created" ||
      !row.product_draft_id ||
      row.title === null ||
      !row.product_status
    ) {
      return { result: "invalid" };
    }
    const result: ProductDraftTitleCreateResult = {
      result: "created",
      productDraftId: row.product_draft_id,
      title: row.title,
      titleSource: parseStoredProductDraftTitleSource(row.title_source),
      productStatus: row.product_status,
    };
    return result;
  }

  private async saveSellerProduct(
    productDraftId: string | null,
    expectedSellerId: string,
    titleWrite: HumanProductDraftTitleWrite | null,
    productFields: Partial<SellerProductFields>,
  ): Promise<
    | ({ result: "created" } & ProductDraftTitleRecord)
    | ({ result: "updated" } & ProductDraftTitleRecord)
    | { result: "not_found" }
    | {
        result: "not_editable";
        productDraftId: string;
        productStatus: "draft" | "published" | "archived";
      }
    | { result: "facts_missing" }
    | { result: "title_required" }
    | { result: "title_invalid" }
    | {
        result:
          | "product_publication_category_required"
          | "product_category_not_supported"
          | "product_code_company_unconfigured"
          | "product_code_category_unconfigured"
          | "product_code_allocation_failed";
      }
    | { result: "invalid" }
  > {
    const response = await this.database.rpc("save_seller_product_with_description", {
      p_product_draft_id: productDraftId,
      p_seller_id: expectedSellerId,
      p_title_patch_present: titleWrite !== null,
      p_title: titleWrite?.title ?? null,
      p_description_patch_present: hasDescriptionPatch(productFields),
      p_description: productFields.description ?? null,
      p_category_id: productFields.category_id ?? null,
      p_moq: productFields.moq ?? null,
      p_pack_size: productFields.pack_size ?? null,
      p_price: productFields.price ?? null,
      p_currency: productFields.currency ?? "USD",
      p_stock: productFields.stock ?? "in_stock",
      p_cover_image_url_patch_present: hasCoverImageUrlPatch(productFields),
      p_cover_image_url: productFields.cover_image_url ?? null,
      p_trending: productFields.trending ?? false,
      p_status: productFields.status ?? "draft",
    });
    if (response.error) {
      if (isTitleInvalid(response.error)) return { result: "invalid" };
      throwDatabaseError(response.error);
    }

    const result = response.data?.[0];
    if (!result) throw new Error("Seller ProductDraft save returned no result.");
    if (
      result.result === "not_found" ||
      result.result === "facts_missing" ||
      result.result === "title_required" ||
      result.result === "title_invalid" ||
      result.result === "product_publication_category_required" ||
      result.result === "product_category_not_supported" ||
      result.result === "product_code_company_unconfigured" ||
      result.result === "product_code_category_unconfigured" ||
      result.result === "product_code_allocation_failed"
    ) {
      return { result: result.result };
    }
    if (result.result === "not_editable") {
      if (!result.product_draft_id || !result.product_status) {
        throw new Error("Seller ProductDraft save returned an incomplete not-editable result.");
      }
      return {
        result: "not_editable",
        productDraftId: result.product_draft_id,
        productStatus: result.product_status,
      };
    }
    if (
      (result.result !== "created" && result.result !== "updated") ||
      !result.product_draft_id ||
      result.title === null ||
      !result.product_status
    ) {
      return { result: "invalid" };
    }
    return {
      result: result.result,
      productDraftId: result.product_draft_id,
      title: result.title,
      titleSource: parseStoredProductDraftTitleSource(result.title_source),
      productStatus: result.product_status,
    };
  }

  private async applyTitleUpdate(
    productDraftId: string,
    expectedSellerId: string | null,
    titleWrite: HumanProductDraftTitleWrite,
  ): Promise<ProductDraftTitleUpdateResult> {
    const payload: Database["public"]["Tables"]["products"]["Update"] = {
      title: titleWrite.title,
      title_source: titleWrite.titleSource,
    };

    let query = this.database.from("products").update(payload).eq("id", productDraftId);
    if (expectedSellerId) query = query.eq("seller_id", expectedSellerId);
    query = query.eq("status", "draft");

    const response = await query.select(titleFields).maybeSingle();
    if (response.error) {
      if (isTitleInvalid(response.error)) return { result: "invalid" };
      if (isTitleNotEditable(response.error)) {
        const current = await this.get(productDraftId, expectedSellerId);
        return current
          ? {
              result: "not_editable",
              productDraftId: current.productDraftId,
              productStatus: current.productStatus,
            }
          : { result: "not_found" };
      }
      throwDatabaseError(response.error);
    }
    if (response.data) return { result: "updated", ...record(response.data) };

    const current = await this.get(productDraftId, expectedSellerId);
    if (!current) return { result: "not_found" };
    if (titleWrite && current.productStatus !== "draft") {
      return {
        result: "not_editable",
        productDraftId: current.productDraftId,
        productStatus: current.productStatus,
      };
    }
    throw new Error("ProductDraft title update returned no result.");
  }
}

function hasDescriptionPatch(productFields: Partial<SellerProductFields>): boolean {
  return Object.prototype.hasOwnProperty.call(productFields, "description");
}

function hasCoverImageUrlPatch(productFields: Partial<SellerProductFields>): boolean {
  return Object.prototype.hasOwnProperty.call(productFields, "cover_image_url");
}

function record(value: {
  id: string;
  title: string;
  title_source: string | null;
  status: "draft" | "published" | "archived";
}): ProductDraftTitleRecord {
  return {
    productDraftId: value.id,
    title: value.title,
    titleSource: parseStoredProductDraftTitleSource(value.title_source),
    productStatus: value.status,
  };
}

function isTitleInvalid(error: { message: string }): boolean {
  return error.message.includes("product_draft_title_invalid");
}

function isTitleNotEditable(error: { message: string }): boolean {
  return error.message.includes("product_draft_title_not_editable");
}

function throwDatabaseError(error: { message: string }): never {
  console.error("[ProductDraft title] Database operation failed.", error);
  throw new Error("ProductDraft title database operation failed.");
}
