import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseDelegatedClassifierUploadRepository } from "./supabase-delegated-classifier-upload.repository";

describe("SupabaseDelegatedClassifierUploadRepository", () => {
  it("uses the bounded database seller search contract", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          seller_id: uuid(10),
          name: "Kesar Textiles",
          slug: "kesar-textiles",
          published: true,
        },
      ],
      error: null,
    }));
    const repository = new SupabaseDelegatedClassifierUploadRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.searchSellers({ query: "kesar", limit: 20 })).resolves.toEqual([
      {
        sellerId: uuid(10),
        name: "Kesar Textiles",
        slug: "kesar-textiles",
        published: true,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("search_delegated_upload_sellers", {
      p_query: "kesar",
      p_limit: 20,
    });
  });

  it("loads a workflow without accepting browser seller ownership", async () => {
    const workflowQuery = query({ data: workflowRow(), error: null });
    const repository = new SupabaseDelegatedClassifierUploadRepository({
      from: vi.fn(() => workflowQuery),
    } as unknown as SupabaseClient<Database>);

    const result = await repository.findWorkflow(uuid(1));

    expect(workflowQuery.eq).toHaveBeenCalledTimes(1);
    expect(workflowQuery.eq).toHaveBeenCalledWith("id", uuid(1));
    expect(result).toMatchObject({
      id: uuid(1),
      sellerId: uuid(10),
      initiatorKind: "administrator",
    });
  });
});

function query(result: { data: unknown; error: { message: string } | null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

function workflowRow() {
  return {
    id: uuid(1),
    seller_id: uuid(10),
    client_request_id: uuid(20),
    classifier_organization_id: uuid(40),
    classifier_batch_id: uuid(50),
    max_files: 20,
    max_file_size_bytes: 20 * 1024 * 1024,
    provisioning_status: "ready",
    last_known_stage: "upload",
    original_file_count: 0,
    processed_file_count: 0,
    group_count: 0,
    product_draft_count: 0,
    error_code: null,
    retryable: false,
    initiated_by_user_id: uuid(30),
    initiator_kind: "administrator",
    created_at: "2026-07-30T10:00:00.000Z",
    updated_at: "2026-07-30T10:01:00.000Z",
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
