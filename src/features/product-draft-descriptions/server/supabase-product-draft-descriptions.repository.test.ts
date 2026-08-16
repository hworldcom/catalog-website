import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseProductDraftDescriptionRepository } from "./supabase-product-draft-descriptions.repository";

const productDraftId = "00000000-0000-4000-8000-000000000001";

describe("SupabaseProductDraftDescriptionRepository", () => {
  it("applies only submitted languages through one atomic database function", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "applied",
          moderation_revision: 4,
          snapshot: {
            productDraftId,
            productStatus: "draft",
            categoryId: null,
            currentFactsRevision: 2,
            descriptions: [
              missing("pl"),
              entry("en", "Updated English"),
              missing("de"),
              missing("vi"),
            ],
          },
        },
      ],
      error: null,
    }));
    const repository = new SupabaseProductDraftDescriptionRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const result = await repository.applyPatch(
      productDraftId,
      { en: "Updated English" },
      uuid(2),
      3,
    );

    expect(rpc).toHaveBeenCalledWith("apply_initial_product_draft_description_patch", {
      p_product_draft_id: productDraftId,
      p_expected_seller_id: uuid(2),
      p_expected_moderation_revision: 3,
      p_pl_patch_present: false,
      p_pl_description: null,
      p_en_patch_present: true,
      p_en_description: "Updated English",
      p_de_patch_present: false,
      p_de_description: null,
      p_vi_patch_present: false,
      p_vi_description: null,
    });
    expect(result).toMatchObject({
      result: "applied",
      snapshot: { moderationRevision: 4, currentFactsRevision: 2 },
    });
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function entry(language: "en", text: string) {
  return {
    language,
    text,
    source: "human",
    factsRevision: 2,
    provider: null,
    model: null,
    pipelineVersion: null,
    generatedAt: null,
    updatedAt: "2026-07-25T12:00:00+00:00",
    outdated: false,
  };
}

function missing(language: "pl" | "de" | "vi") {
  return {
    language,
    text: null,
    source: null,
    factsRevision: null,
    provider: null,
    model: null,
    pipelineVersion: null,
    generatedAt: null,
    updatedAt: null,
    outdated: null,
  };
}
