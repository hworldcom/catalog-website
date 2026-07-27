import { describe, expect, it, vi } from "vitest";

import {
  getCurrentSellerId,
  requireCurrentSellerId,
  type SellerLookupSupabase,
} from "./current-seller.service";

function createSupabase(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  const maybeSingle = vi.fn(async () => result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    supabase: { from } as unknown as SellerLookupSupabase,
    from,
    select,
    eq,
    maybeSingle,
  };
}

describe("getCurrentSellerId", () => {
  it("returns a seller id when the lookup succeeds", async () => {
    const { supabase, from, select, eq } = createSupabase({
      data: { id: "seller-1" },
      error: null,
    });

    await expect(getCurrentSellerId({ supabase, userId: "user-1" })).resolves.toBe("seller-1");
    expect(from).toHaveBeenCalledWith("sellers");
    expect(select).toHaveBeenCalledWith("id");
    expect(eq).toHaveBeenCalledWith("owner_id", "user-1");
  });

  it("returns null when no seller exists", async () => {
    const { supabase } = createSupabase({ data: null, error: null });

    await expect(getCurrentSellerId({ supabase, userId: "user-1" })).resolves.toBeNull();
  });

  it("throws the Supabase error message when the lookup errors", async () => {
    const { supabase } = createSupabase({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(getCurrentSellerId({ supabase, userId: "user-1" })).rejects.toThrow(
      "database unavailable",
    );
  });
});

describe("requireCurrentSellerId", () => {
  it("returns a seller id when the lookup succeeds", async () => {
    const { supabase } = createSupabase({ data: { id: "seller-1" }, error: null });

    await expect(requireCurrentSellerId({ supabase, userId: "user-1" })).resolves.toBe("seller-1");
  });

  it("throws storefront setup copy when no seller exists", async () => {
    const { supabase } = createSupabase({ data: null, error: null });

    await expect(requireCurrentSellerId({ supabase, userId: "user-1" })).rejects.toThrow(
      "Create your storefront first",
    );
  });
});
