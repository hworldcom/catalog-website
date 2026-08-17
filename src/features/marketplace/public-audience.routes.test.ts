import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("public audience route contract", () => {
  it("retains language and audience across public links", () => {
    const root = routeSource("__root.tsx");
    expect(root).toContain('retainSearchParams(["lang", "audience"])');
    expect(root).toContain("audience: publicAudienceSchema");
  });

  it.each([
    ["index.tsx", "marketplaceQueryOptions(deps.audience)"],
    ["join.tsx", "audienceNavigationQueryOptions(deps.audience)"],
    ["c.$category.tsx", "categoryQueryOptions(params.category, deps.audience)"],
    ["s.$sellerSlug.tsx", "sellerQueryOptions(params.sellerSlug, deps.audience)"],
    ["p.$productId.tsx", "productQueryOptions(params.productId, deps.language, deps.audience)"],
  ])("normalizes audience before loading %s", (file, expectedRequest) => {
    const route = routeSource(file);
    expect(route).toContain("normalizePublicAudience(search.audience)");
    expect(route).toContain(expectedRequest);
    expect(route).toContain("audienceNavigationQueryOptions(deps.audience)");
  });
});

function routeSource(file: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", file), "utf8");
}
