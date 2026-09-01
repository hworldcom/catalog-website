import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { buildPasswordRecoveryCallbackUrl, requestPasswordReset } from "./password-recovery";

describe("buildPasswordRecoveryCallbackUrl", () => {
  it("uses the canonical origin and preserves a supported language and safe return path", () => {
    expect(
      buildPasswordRecoveryCallbackUrl({
        canonicalSiteOrigin: "https://uat.bazoria.example",
        lang: "PL",
        redirect: "/seller/products?lang=PL",
      }),
    ).toBe(
      "https://uat.bazoria.example/auth/recovery?lang=PL&redirect=%2Fseller%2Fproducts%3Flang%3DPL",
    );
  });

  it("normalizes language and rejects cross-origin return targets", () => {
    expect(
      buildPasswordRecoveryCallbackUrl({
        canonicalSiteOrigin: "https://bazoria.example",
        lang: "unsupported",
        redirect: "https://attacker.example/collect",
      }),
    ).toBe("https://bazoria.example/auth/recovery?lang=EN&redirect=%2Fseller");
  });
});

describe("requestPasswordReset", () => {
  it("rejects invalid email syntax without contacting Supabase", async () => {
    const resetPasswordForEmail = vi.fn();

    await expect(
      requestPasswordReset({
        auth: { resetPasswordForEmail },
        email: "not-an-email",
        canonicalSiteOrigin: "https://bazoria.example",
        lang: "EN",
      }),
    ).resolves.toEqual({ status: "invalid_email" });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["known address", null],
    ["unknown address", { name: "AuthApiError", status: 400 }],
    ["rate limit", { name: "AuthApiError", status: 429 }],
    ["provider outage response", new AuthRetryableFetchError("unavailable", 503)],
  ])("returns the same neutral result for a %s provider response", async (_label, error) => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error });

    await expect(
      requestPasswordReset({
        auth: { resetPasswordForEmail },
        email: "seller@example.com",
        canonicalSiteOrigin: "https://bazoria.example",
        lang: "DE",
        redirect: "/seller?lang=DE",
      }),
    ).resolves.toEqual({ status: "accepted" });
  });

  it("returns a retryable result only for a definite status-zero transport failure", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({
      error: new AuthRetryableFetchError("failed to fetch", 0),
    });

    await expect(
      requestPasswordReset({
        auth: { resetPasswordForEmail },
        email: "seller@example.com",
        canonicalSiteOrigin: "https://bazoria.example",
        lang: "VI",
      }),
    ).resolves.toEqual({ status: "delivery_unavailable" });
  });

  it("does not expose thrown provider responses", async () => {
    const resetPasswordForEmail = vi.fn().mockRejectedValue({
      status: 500,
      email: "seller@example.com",
      access_token: "secret",
    });

    await expect(
      requestPasswordReset({
        auth: { resetPasswordForEmail },
        email: "seller@example.com",
        canonicalSiteOrigin: "https://bazoria.example",
        lang: "EN",
      }),
    ).resolves.toEqual({ status: "accepted" });
  });
});
