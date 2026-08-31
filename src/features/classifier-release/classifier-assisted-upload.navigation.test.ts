import { describe, expect, it } from "vitest";

import {
  buildAdministratorClassifierDisabledHref,
  buildSellerClassifierDisabledHref,
  guardAdministratorClassifierRoute,
  guardSellerClassifierRoute,
} from "./classifier-assisted-upload.navigation";

describe("classifier-assisted upload route gate", () => {
  it("redirects sellers while preserving root language and audience", () => {
    expect(buildSellerClassifierDisabledHref({ lang: "DE", audience: "women" })).toBe(
      "/seller/products?notice=classifier_assisted_upload_disabled&lang=DE&audience=women",
    );
    expectRedirect(
      () => guardSellerClassifierRoute({ lang: "DE", audience: "women" }, false),
      "/seller/products?notice=classifier_assisted_upload_disabled&lang=DE&audience=women",
    );
  });

  it("redirects administrators to the stable ProductDraft index", () => {
    expect(buildAdministratorClassifierDisabledHref({ lang: "PL", audience: "kids" })).toBe(
      "/admin/product-drafts?limit=25&notice=classifier_assisted_upload_disabled&lang=PL",
    );
    expectRedirect(
      () => guardAdministratorClassifierRoute({ lang: "PL" }, false),
      "/admin/product-drafts?limit=25&notice=classifier_assisted_upload_disabled&lang=PL",
    );
  });

  it("does not redirect when the local classifier integration is enabled", () => {
    expect(guardSellerClassifierRoute({}, true)).toBeUndefined();
    expect(guardAdministratorClassifierRoute({}, true)).toBeUndefined();
  });
});

function expectRedirect(operation: () => void, href: string): void {
  try {
    operation();
    throw new Error("Expected a route redirect.");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect(error).toMatchObject({ status: 307 });
    expect((error as Response).headers.get("location")).toBe(href);
  }
}
