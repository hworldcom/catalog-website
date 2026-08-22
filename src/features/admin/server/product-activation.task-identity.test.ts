import { describe, expect, it, vi } from "vitest";

import {
  GoogleTaskIdentityVerifier,
  type GoogleIdentityTokenApi,
} from "./product-activation.task-identity";

describe("GoogleTaskIdentityVerifier", () => {
  it("verifies the exact configured audience and returns a verified Google email", async () => {
    const api = apiFixture({
      iss: "https://accounts.google.com",
      email: "task-caller@example.iam.gserviceaccount.com",
      email_verified: true,
    });
    const verifier = new GoogleTaskIdentityVerifier("https://activation.example.com/", api);

    await expect(verifier.verify("signed-token")).resolves.toEqual({
      email: "task-caller@example.iam.gserviceaccount.com",
    });
    expect(api.verifyIdToken).toHaveBeenCalledWith({
      idToken: "signed-token",
      audience: "https://activation.example.com/",
    });
  });

  it.each([
    [{ iss: "https://issuer.example.com", email: "caller@example.com", email_verified: true }],
    [{ iss: "accounts.google.com", email: "caller@example.com", email_verified: false }],
    [{ iss: "accounts.google.com", email_verified: true }],
  ])("rejects a token without all verified Google identity claims", async (payload) => {
    await expect(
      new GoogleTaskIdentityVerifier("https://activation.example.com/", apiFixture(payload)).verify(
        "signed-token",
      ),
    ).rejects.toThrow("invalid");
  });

  it("propagates signature or audience verification failure", async () => {
    const api = {
      verifyIdToken: vi.fn(async () => {
        throw new Error("bad signature");
      }),
    } satisfies GoogleIdentityTokenApi;

    await expect(
      new GoogleTaskIdentityVerifier("https://activation.example.com/", api).verify("bad-token"),
    ).rejects.toThrow("bad signature");
  });
});

function apiFixture(payload: {
  iss?: string;
  email?: string;
  email_verified?: boolean;
}): GoogleIdentityTokenApi {
  return {
    verifyIdToken: vi.fn(async () => ({ getPayload: () => payload })),
  };
}
