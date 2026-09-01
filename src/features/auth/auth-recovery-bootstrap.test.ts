import { describe, expect, it, vi } from "vitest";

import { bootstrapAuthAwareBrowserApplication } from "./auth-recovery-bootstrap";

describe("bootstrapAuthAwareBrowserApplication", () => {
  it("registers recovery after runtime configuration and before hydration", async () => {
    const order: string[] = [];

    await bootstrapAuthAwareBrowserApplication({
      initializeRuntimeConfig: vi.fn(async () => {
        order.push("runtime-config");
      }),
      initializeRecoveryCoordinator: vi.fn(async () => {
        order.push("recovery-coordinator");
      }),
      hydrate: vi.fn(() => {
        order.push("hydrate");
      }),
    });

    expect(order).toEqual(["runtime-config", "recovery-coordinator", "hydrate"]);
  });

  it("does not hydrate when recovery initialization fails", async () => {
    const hydrate = vi.fn();

    await expect(
      bootstrapAuthAwareBrowserApplication({
        initializeRuntimeConfig: vi.fn().mockResolvedValue(undefined),
        initializeRecoveryCoordinator: vi.fn().mockRejectedValue(new Error("failed")),
        hydrate,
      }),
    ).rejects.toThrow("failed");
    expect(hydrate).not.toHaveBeenCalled();
  });
});
