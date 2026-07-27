import { describe, expect, it } from "vitest";

import { buildAuthCallbackUrl, safeAuthRedirect } from "./auth-redirect";

describe("safeAuthRedirect", () => {
  it("defaults to the seller dashboard", () => {
    expect(safeAuthRedirect(undefined)).toBe("/seller");
  });

  it("preserves local paths and search parameters", () => {
    expect(safeAuthRedirect("/seller/products?lang=DE")).toBe("/seller/products?lang=DE");
  });

  it("rejects external and protocol-relative destinations", () => {
    expect(safeAuthRedirect("https://attacker.example")).toBe("/seller");
    expect(safeAuthRedirect("//attacker.example")).toBe("/seller");
    expect(safeAuthRedirect("/\\attacker.example")).toBe("/seller");
  });
});

describe("buildAuthCallbackUrl", () => {
  it("returns to the auth route with the safe destination", () => {
    expect(
      buildAuthCallbackUrl({
        origin: "https://bazoria.example",
        redirect: "/seller/leads?lang=PL",
      }),
    ).toBe("https://bazoria.example/auth?redirect=%2Fseller%2Fleads%3Flang%3DPL");
  });

  it("does not include an unsafe destination", () => {
    expect(
      buildAuthCallbackUrl({
        origin: "https://bazoria.example",
        redirect: "https://attacker.example",
      }),
    ).toBe("https://bazoria.example/auth?redirect=%2Fseller");
  });
});
