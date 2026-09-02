import { describe, expect, it, vi } from "vitest";

import {
  reconciliationHealthFields,
  runProductActivationReconciliationCycle,
} from "./product-activation-reconciliation.command";

const emptySummary = {
  selected: 0,
  confirmedDispatched: 0,
  alreadyExisting: 0,
  stillPending: 0,
  stale: 0,
  failed: 0,
  durationMs: 20,
};

describe("runProductActivationReconciliationCycle", () => {
  it("reads complete durable health after bounded reconciliation succeeds", async () => {
    const calls: string[] = [];
    const write = vi.fn();
    const service = {
      run: vi.fn(async () => {
        calls.push("reconcile");
        return { ...emptySummary, selected: 100, confirmedDispatched: 100 };
      }),
    };
    const repository = {
      readDispatchHealth: vi.fn(async () => {
        calls.push("health");
        return {
          pendingCount: 2,
          oldestPendingCreatedAt: "2026-09-02T10:00:00.000Z",
        };
      }),
    };

    await expect(
      runProductActivationReconciliationCycle(service, repository, {
        now: () => Date.parse("2026-09-02T10:06:00.000Z"),
        write,
      }),
    ).resolves.toBe(0);

    expect(calls).toEqual(["reconcile", "health"]);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "product_activation_reconciliation_finished",
        severity: "info",
        pendingCount: 2,
        oldestPendingAgeMs: 360_000,
      }),
    );
  });

  it("emits a healthy zero snapshot only after the durable queue is empty", async () => {
    const write = vi.fn();

    await expect(
      runProductActivationReconciliationCycle(
        { run: vi.fn(async () => emptySummary) },
        {
          readDispatchHealth: vi.fn(async () => ({
            pendingCount: 0,
            oldestPendingCreatedAt: null,
          })),
        },
        { now: () => 1, write },
      ),
    ).resolves.toBe(0);

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        pendingCount: 0,
        oldestPendingAgeMs: 0,
      }),
    );
  });
});

describe("reconciliationHealthFields", () => {
  it("clamps clock skew without producing a negative age", () => {
    expect(
      reconciliationHealthFields(
        { pendingCount: 1, oldestPendingCreatedAt: "2026-09-02T10:00:01.000Z" },
        Date.parse("2026-09-02T10:00:00.000Z"),
      ),
    ).toEqual({ pendingCount: 1, oldestPendingAgeMs: 0 });
  });

  it.each([
    { pendingCount: 0, oldestPendingCreatedAt: "2026-09-02T10:00:00.000Z" },
    { pendingCount: 1, oldestPendingCreatedAt: null },
    { pendingCount: 1, oldestPendingCreatedAt: "not-a-timestamp" },
  ])("rejects malformed durable health: %s", (health) => {
    expect(() => reconciliationHealthFields(health, Date.now())).toThrow(
      "product_activation_dispatch_health_invalid",
    );
  });
});
