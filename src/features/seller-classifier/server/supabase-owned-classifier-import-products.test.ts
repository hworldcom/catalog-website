import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import {
  listOwnedClassifierImportProducts,
  OwnedClassifierImportProductsError,
} from "./supabase-owned-classifier-import-products";

describe("listOwnedClassifierImportProducts", () => {
  it("deduplicates imports and maps the source-resolved rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          classifier_import_run_id: uuid(1),
          seller_classifier_workflow_id: uuid(2),
          product_draft_id: uuid(3),
          classifier_group_id: uuid(4),
          source_group_position: 7,
          title: null,
          product_status: "archived",
        },
      ],
      error: null,
    });

    const products = await listOwnedClassifierImportProducts(
      { rpc } as unknown as SupabaseClient<Database>,
      uuid(9),
      [uuid(1), uuid(1)],
    );

    expect(rpc).toHaveBeenCalledWith("list_owned_classifier_import_product_drafts", {
      p_seller_id: uuid(9),
      p_import_ids: [uuid(1)],
    });
    expect(products).toEqual([
      {
        importId: uuid(1),
        workflowId: uuid(2),
        productDraftId: uuid(3),
        classifierGroupId: uuid(4),
        sourceGroupPosition: 7,
        title: "",
        status: "archived",
      },
    ]);
  });

  it("returns no products without calling the database for an empty import list", async () => {
    const rpc = vi.fn();

    await expect(
      listOwnedClassifierImportProducts(
        { rpc } as unknown as SupabaseClient<Database>,
        uuid(9),
        [],
      ),
    ).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects reads larger than the bounded history request", async () => {
    const rpc = vi.fn();

    await expect(
      listOwnedClassifierImportProducts(
        { rpc } as unknown as SupabaseClient<Database>,
        uuid(9),
        Array.from({ length: 102 }, (_, index) => uuid(index + 1)),
      ),
    ).rejects.toBeInstanceOf(OwnedClassifierImportProductsError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects incomplete database rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          classifier_import_run_id: uuid(1),
          seller_classifier_workflow_id: uuid(2),
          product_draft_id: null,
          classifier_group_id: uuid(4),
          source_group_position: null,
          title: "Draft",
          product_status: "draft",
        },
      ],
      error: null,
    });

    await expect(
      listOwnedClassifierImportProducts({ rpc } as unknown as SupabaseClient<Database>, uuid(9), [
        uuid(1),
      ]),
    ).rejects.toBeInstanceOf(OwnedClassifierImportProductsError);
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
