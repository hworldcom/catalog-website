import { describe, expect, it, vi } from "vitest";

import { createBrowserRandomUuid } from "./browser-random-uuid";

describe("createBrowserRandomUuid", () => {
  it("uses the native secure-context implementation when available", () => {
    const nativeUuid = "12345678-1234-4234-8234-123456789abc" as const;
    const randomUUID = vi.fn(() => nativeUuid);

    expect(
      createBrowserRandomUuid({
        randomUUID,
        getRandomValues: vi.fn(),
      } as unknown as Crypto),
    ).toBe(nativeUuid);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates a valid version 4 UUID when randomUUID is unavailable", () => {
    const values = Uint8Array.from([
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0xff, 0x77, 0xff, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
      0xff,
    ]);
    const getRandomValues = vi.fn((target: Uint8Array) => {
      target.set(values);
      return target;
    });

    const result = createBrowserRandomUuid({ getRandomValues } as unknown as Crypto);

    expect(result).toBe("00112233-4455-4f77-bf99-aabbccddeeff");
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});
