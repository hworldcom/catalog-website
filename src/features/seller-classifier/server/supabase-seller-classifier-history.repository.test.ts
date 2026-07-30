import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseSellerClassifierHistoryRepository } from "./supabase-seller-classifier-history.repository";

describe("SupabaseSellerClassifierHistoryRepository", () => {
  it("scopes both bounded reads to the seller and applies the tuple boundary", async () => {
    const workflowQuery = query({
      data: [workflowRow(1), workflowRow(2)],
      error: null,
    });
    const importQuery = query({
      data: [
        {
          seller_classifier_workflow_id: uuid(1),
          status: "completed",
          error_code: null,
          retryable: false,
        },
      ],
      error: null,
    });
    const from = vi.fn().mockReturnValueOnce(workflowQuery).mockReturnValueOnce(importQuery);
    const repository = new SupabaseSellerClassifierHistoryRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    const records = await repository.listOwned({
      sellerId: uuid(900),
      limit: 26,
      before: {
        version: 1,
        createdAt: "2026-07-28T09:00:00.000Z",
        workflowId: uuid(20),
      },
    });

    expect(records).toHaveLength(2);
    expect(workflowQuery.eq).toHaveBeenCalledWith("seller_id", uuid(900));
    expect(workflowQuery.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: false,
    });
    expect(workflowQuery.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: false,
    });
    expect(workflowQuery.limit).toHaveBeenCalledWith(26);
    expect(workflowQuery.or).toHaveBeenCalledWith(
      `created_at.lt."2026-07-28T09:00:00.000Z",and(created_at.eq."2026-07-28T09:00:00.000Z",id.lt.${uuid(20)})`,
    );
    expect(importQuery.eq).toHaveBeenCalledWith("seller_id", uuid(900));
    expect(importQuery.in).toHaveBeenCalledWith("seller_classifier_workflow_id", [
      uuid(1),
      uuid(2),
    ]);
    expect(records[0]?.import?.status).toBe("completed");
    expect(records[0]?.initiatorKind).toBe("seller");
    expect(records[1]?.import).toBeNull();
  });
});

function query(result: { data: unknown[]; error: { message: string } | null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  return builder;
}

function workflowRow(value: number) {
  return {
    id: uuid(value),
    initiator_kind: "seller",
    provisioning_status: "ready",
    last_known_stage: "upload",
    original_file_count: 1,
    processed_file_count: 0,
    group_count: 0,
    product_draft_count: 0,
    error_code: null,
    retryable: false,
    created_at: "2026-07-28T10:00:00.000Z",
    updated_at: "2026-07-28T10:01:00.000Z",
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
