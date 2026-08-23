import { describe, expect, it } from "vitest";

import { legacyClassifierImportsRedirect } from "./classifier-import-legacy-navigation";

describe("legacy classifier import inbox navigation", () => {
  it("redirects to delegated upload and preserves the validated language", () => {
    expect(legacyClassifierImportsRedirect("DE")).toEqual({
      to: "/admin/classifier-uploads/new",
      search: { lang: "DE" },
      replace: true,
    });
  });
});
