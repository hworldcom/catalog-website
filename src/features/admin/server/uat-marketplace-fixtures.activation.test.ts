import { describe, expect, it, vi } from "vitest";

import {
  UatMarketplaceFixtureActivationCoordinator,
  type UatFixtureActivationBackend,
  type UatFixtureActivationRun,
} from "./uat-marketplace-fixtures.activation";

const baseRun: UatFixtureActivationRun = {
  claimStartedAt: null,
  dispatchGeneration: 1,
  dispatchStatus: "pending",
  errorCode: null,
  id: "00000000-0000-4000-8000-000000000101",
  phase: "activation",
  status: "pending",
};

function backend(runs: UatFixtureActivationRun[]) {
  let index = 0;
  return {
    dispatch: vi.fn().mockResolvedValue(undefined),
    isRetryable: vi.fn().mockResolvedValue(true),
    readRun: vi.fn(async () => runs[Math.min(index++, runs.length - 1)] ?? null),
    recover: vi.fn().mockResolvedValue(undefined),
    retryActivation: vi.fn().mockResolvedValue(undefined),
    retryDispatch: vi.fn().mockResolvedValue(undefined),
  } satisfies UatFixtureActivationBackend;
}

const input = {
  submissionId: "00000000-0000-4000-8000-000000000201",
  retryActivationRequestId: "00000000-0000-4000-8000-000000000202",
  retryDispatchRequestId: "00000000-0000-4000-8000-000000000203",
};

describe("UatMarketplaceFixtureActivationCoordinator", () => {
  it("dispatches pending work and waits for asynchronous completion", async () => {
    const fake = backend([
      baseRun,
      { ...baseRun, status: "completed", dispatchStatus: "dispatched" },
    ]);
    const coordinator = new UatMarketplaceFixtureActivationCoordinator(
      fake,
      360,
      () => 1_000,
      vi.fn().mockResolvedValue(undefined),
    );
    await expect(coordinator.complete(input)).resolves.toMatchObject({ status: "completed" });
    expect(fake.dispatch).toHaveBeenCalledOnce();
  });

  it("retries retryable activation and dispatch failures", async () => {
    const fake = backend([
      { ...baseRun, status: "failed", dispatchStatus: "dispatched", errorCode: "retryable" },
      { ...baseRun, dispatchStatus: "failed", dispatchGeneration: 2 },
      { ...baseRun, status: "completed", dispatchStatus: "dispatched", dispatchGeneration: 3 },
    ]);
    const coordinator = new UatMarketplaceFixtureActivationCoordinator(
      fake,
      360,
      () => 1_000,
      vi.fn().mockResolvedValue(undefined),
    );
    await coordinator.complete(input);
    expect(fake.retryActivation).toHaveBeenCalledOnce();
    expect(fake.retryDispatch).toHaveBeenCalledOnce();
  });

  it("refuses non-retryable and completed replay states correctly", async () => {
    const failed = backend([
      { ...baseRun, status: "failed", dispatchStatus: "dispatched", errorCode: "fatal" },
    ]);
    failed.isRetryable.mockResolvedValue(false);
    await expect(
      new UatMarketplaceFixtureActivationCoordinator(failed, 360).complete(input),
    ).rejects.toThrow("uat_marketplace_fixture_activation_failed");

    const completed = backend([{ ...baseRun, status: "completed", dispatchStatus: "dispatched" }]);
    await new UatMarketplaceFixtureActivationCoordinator(completed, 360).complete(input);
    expect(completed.dispatch).not.toHaveBeenCalled();
    expect(completed.recover).not.toHaveBeenCalled();
  });

  it("lets an existing claim expire before enforcing the completion bound", async () => {
    let now = 1_000;
    const fake = backend([
      {
        ...baseRun,
        status: "running",
        dispatchStatus: "dispatched",
        claimStartedAt: new Date(now).toISOString(),
      },
      {
        ...baseRun,
        status: "running",
        dispatchStatus: "dispatched",
        claimStartedAt: new Date(now).toISOString(),
      },
      { ...baseRun, status: "completed", dispatchStatus: "dispatched" },
    ]);
    const coordinator = new UatMarketplaceFixtureActivationCoordinator(
      fake,
      360,
      () => now,
      vi.fn(async () => {
        now += 360_000;
      }),
    );
    await expect(coordinator.complete(input)).resolves.toMatchObject({ status: "completed" });
    expect(fake.recover).toHaveBeenCalledOnce();
  });

  it("fails when pending work exceeds the bounded completion deadline", async () => {
    let now = 0;
    const fake = backend([baseRun, baseRun]);
    const coordinator = new UatMarketplaceFixtureActivationCoordinator(
      fake,
      360,
      () => now,
      vi.fn(async () => {
        now = 300_001;
      }),
    );
    await expect(coordinator.complete(input)).rejects.toThrow(
      "uat_marketplace_fixture_activation_failed",
    );
  });
});
