import { describe, expect, it } from "vitest";

import {
  buildAuthRecoveryMarkerKey,
  markerMatchesValidatedSession,
  parseAuthRecoveryMarker,
  serializeAuthRecoveryMarker,
} from "./auth-recovery-marker";

describe("auth recovery marker", () => {
  it("scopes storage to the configured Supabase host and nondefault port", () => {
    expect(buildAuthRecoveryMarkerKey("https://Project.Example:8443/path")).toBe(
      "bazoria.auth.recovery.v1:project.example:8443",
    );
  });

  it("serializes only the version, user identifier, and expiry", () => {
    const serialized = serializeAuthRecoveryMarker({
      version: 1,
      userId: "user-1",
      expiresAt: 2_000,
    });

    expect(JSON.parse(serialized)).toEqual({ version: 1, userId: "user-1", expiresAt: 2_000 });
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("email");
  });

  it("rejects malformed, incomplete, and extended marker values", () => {
    expect(parseAuthRecoveryMarker("not-json")).toBeNull();
    expect(parseAuthRecoveryMarker('{"version":1,"userId":"user-1"}')).toBeNull();
    expect(
      parseAuthRecoveryMarker(
        '{"version":1,"userId":"user-1","expiresAt":2000,"accessToken":"secret"}',
      ),
    ).toBeNull();
  });

  it("requires exact user and expiry matches and a future expiry", () => {
    const marker = { version: 1 as const, userId: "user-1", expiresAt: 2_000 };

    expect(
      markerMatchesValidatedSession({
        marker,
        session: { userId: "user-1", expiresAt: 2_000 },
        nowEpochSeconds: 1_000,
      }),
    ).toBe(true);
    expect(
      markerMatchesValidatedSession({
        marker,
        session: { userId: "user-1", expiresAt: 2_001 },
        nowEpochSeconds: 1_000,
      }),
    ).toBe(false);
    expect(
      markerMatchesValidatedSession({
        marker,
        session: { userId: "user-2", expiresAt: 2_000 },
        nowEpochSeconds: 1_000,
      }),
    ).toBe(false);
    expect(
      markerMatchesValidatedSession({
        marker,
        session: { userId: "user-1", expiresAt: 2_000 },
        nowEpochSeconds: 2_000,
      }),
    ).toBe(false);
  });
});
