import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("seller product list pagination migration", () => {
  it("adds the composite seller and descending tuple index", async () => {
    const migration = await readFile(
      resolve(
        process.cwd(),
        "supabase/migrations/20260727090000_seller_product_list_pagination.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /CREATE INDEX products_seller_created_id_idx\s+ON public\.products \(seller_id, created_at DESC, id DESC\);/,
    );
  });
});
