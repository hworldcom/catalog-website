import { afterEach, describe, expect, it, vi } from "vitest";

import {
  delegatedClassifierUnavailable,
  delegatedReviewNotAllowed,
} from "../delegated-classifier-review-import.types";
import type {
  DelegatedAdministratorActionClaimResult,
  DelegatedAdministratorActionRepository,
} from "./delegated-administrator-action.repository";
import { DelegatedAdministratorActionRepositoryError } from "./delegated-administrator-action.repository";
import {
  createDelegatedActionFingerprint,
  DelegatedAdministratorActionService,
} from "./delegated-administrator-action.service";

describe("DelegatedAdministratorActionService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a stable canonical fingerprint independent of object key order", () => {
    const first = createDelegatedActionFingerprint({
      actionType: "approve_group",
      targetId: groupId,
      payload: { beta: 2, alpha: { value: true } },
    });
    const second = createDelegatedActionFingerprint({
      actionType: "approve_group",
      targetId: groupId,
      payload: { alpha: { value: true }, beta: 2 },
    });

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(
      createDelegatedActionFingerprint({
        actionType: "approve_group",
        targetId: groupId.toUpperCase(),
        payload: { alpha: { value: true }, beta: 2 },
      }),
    ).toBe(first);
  });

  it("reconciles an already-completed remote command and token-fences success", async () => {
    const { execute, readTerminal, reconcile, repository, service } = setup();
    reconcile.mockResolvedValueOnce("reconciled");

    await expect(service.run(input({ execute, readTerminal, reconcile }))).resolves.toBe(
      "reconciled",
    );
    expect(execute).not.toHaveBeenCalled();
    expect(repository.finalizeSuccess).toHaveBeenCalledWith(requestId, attemptToken);
  });

  it("replays a terminal success without reconciling or executing", async () => {
    const subject = setup({
      claim: claim({ operation: "succeeded", status: "succeeded", attemptToken: null }),
    });
    subject.readTerminal.mockResolvedValueOnce("terminal");

    await expect(
      subject.service.run(
        input({
          execute: subject.execute,
          readTerminal: subject.readTerminal,
          reconcile: subject.reconcile,
        }),
      ),
    ).resolves.toBe("terminal");
    expect(subject.reconcile).not.toHaveBeenCalled();
    expect(subject.execute).not.toHaveBeenCalled();
    expect(subject.repository.finalizeSuccess).not.toHaveBeenCalled();
  });

  it("records only deterministic business failures as terminal failures", async () => {
    const subject = setup();
    subject.reconcile.mockRejectedValueOnce(delegatedReviewNotAllowed());

    await expect(
      subject.service.run(
        input({
          execute: subject.execute,
          readTerminal: subject.readTerminal,
          reconcile: subject.reconcile,
        }),
      ),
    ).rejects.toMatchObject({
      code: "delegated_review_not_allowed",
    });
    expect(subject.repository.finalizeFailure).toHaveBeenCalledWith(
      requestId,
      attemptToken,
      "delegated_review_not_allowed",
    );
  });

  it("uses caller-defined terminal error classification and restoration", async () => {
    const subject = setup();
    const terminalError = Object.assign(new Error("category required"), {
      code: "product_publication_category_required",
    });
    subject.execute.mockRejectedValueOnce(terminalError);

    await expect(
      subject.service.run({
        ...input({
          execute: subject.execute,
          readTerminal: subject.readTerminal,
          reconcile: subject.reconcile,
        }),
        terminalErrorCode: (error) => (error === terminalError ? terminalError.code : null),
        restoreTerminalError: (code) => Object.assign(new Error("restored"), { code }),
      }),
    ).rejects.toBe(terminalError);
    expect(subject.repository.finalizeFailure).toHaveBeenCalledWith(
      requestId,
      attemptToken,
      "product_publication_category_required",
    );

    const replay = setup({
      claim: claim({
        operation: "failed",
        status: "failed",
        attemptToken: null,
        errorCode: terminalError.code,
      }),
    });
    await expect(
      replay.service.run({
        ...input({
          execute: replay.execute,
          readTerminal: replay.readTerminal,
          reconcile: replay.reconcile,
        }),
        restoreTerminalError: (code) => Object.assign(new Error("restored"), { code }),
      }),
    ).rejects.toMatchObject({ code: terminalError.code });
  });

  it("leaves unknown remote failures reclaimable", async () => {
    const subject = setup();
    subject.reconcile.mockRejectedValueOnce(delegatedClassifierUnavailable());

    await expect(
      subject.service.run(
        input({
          execute: subject.execute,
          readTerminal: subject.readTerminal,
          reconcile: subject.reconcile,
        }),
      ),
    ).rejects.toMatchObject({
      code: "delegated_classifier_unavailable",
    });
    expect(subject.repository.finalizeFailure).not.toHaveBeenCalled();
    expect(subject.repository.finalizeSuccess).not.toHaveBeenCalled();
  });

  it("returns in-progress when the local timeout expires without finalizing", async () => {
    vi.useFakeTimers();
    const subject = setup({ actionTimeoutMs: 10 });
    subject.reconcile.mockReturnValueOnce(new Promise<string | null>(() => undefined));

    const result = subject.service.run(
      input({
        execute: subject.execute,
        readTerminal: subject.readTerminal,
        reconcile: subject.reconcile,
      }),
    );
    const expectation = expect(result).rejects.toMatchObject({
      code: "delegated_action_in_progress",
    });
    await vi.advanceTimersByTimeAsync(10);

    await expectation;
    expect(subject.repository.finalizeFailure).not.toHaveBeenCalled();
    expect(subject.repository.finalizeSuccess).not.toHaveBeenCalled();
  });

  it("shares one timeout across reconciliation and command execution", async () => {
    vi.useFakeTimers();
    const subject = setup({ actionTimeoutMs: 10 });
    subject.reconcile.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 6)),
    );
    subject.execute.mockReturnValueOnce(new Promise<string>(() => undefined));

    const result = subject.service.run(
      input({
        execute: subject.execute,
        readTerminal: subject.readTerminal,
        reconcile: subject.reconcile,
      }),
    );
    const expectation = expect(result).rejects.toMatchObject({
      code: "delegated_action_in_progress",
    });
    await vi.advanceTimersByTimeAsync(10);

    await expectation;
    expect(subject.execute).toHaveBeenCalledOnce();
    expect(subject.repository.finalizeSuccess).not.toHaveBeenCalled();
  });

  it("fails closed when the audit repository is unavailable", async () => {
    const subject = setup();
    subject.repository.claim.mockRejectedValueOnce(
      new DelegatedAdministratorActionRepositoryError("database unavailable"),
    );

    await expect(
      subject.service.run(
        input({
          execute: subject.execute,
          readTerminal: subject.readTerminal,
          reconcile: subject.reconcile,
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "delegated_action_audit_unavailable",
    });
    expect(subject.execute).not.toHaveBeenCalled();
  });

  it.each([
    { operation: "in_progress", code: "delegated_action_in_progress" },
    { operation: "request_conflict", code: "delegated_action_request_conflict" },
    { operation: "workflow_not_found", code: "delegated_upload_workflow_not_found" },
  ] as const)("maps $operation without running the command", async ({ operation, code }) => {
    const subject = setup({
      claim: claim({
        operation,
        status: operation === "in_progress" ? "running" : null,
        attemptToken: operation === "in_progress" ? attemptToken : null,
      }),
    });

    await expect(
      subject.service.run(
        input({
          execute: subject.execute,
          readTerminal: subject.readTerminal,
          reconcile: subject.reconcile,
        }),
      ),
    ).rejects.toMatchObject({ code });
    expect(subject.execute).not.toHaveBeenCalled();
  });
});

function setup(
  options: {
    actionTimeoutMs?: number;
    claim?: DelegatedAdministratorActionClaimResult;
  } = {},
) {
  const repository = {
    claim: vi.fn(async () => options.claim ?? claim()),
    finalizeSuccess: vi.fn(async () => true),
    finalizeFailure: vi.fn(async () => true),
    findImportRunId: vi.fn(async () => importRunId),
  } satisfies DelegatedAdministratorActionRepository;
  const reconcile = vi.fn(async (): Promise<string | null> => null);
  const execute = vi.fn(async () => "executed");
  const readTerminal = vi.fn(async () => "terminal");
  return {
    repository,
    reconcile,
    execute,
    readTerminal,
    service: new DelegatedAdministratorActionService(repository, {
      actionTimeoutMs: options.actionTimeoutMs ?? 1_000,
      leaseTimeoutSeconds: 120,
    }),
  };
}

function input(callbacks: {
  readTerminal: () => Promise<string>;
  reconcile: () => Promise<string | null>;
  execute: () => Promise<string>;
}) {
  return {
    requestId,
    workflowId,
    expectedSellerId: sellerId,
    administratorUserId,
    actionType: "approve_group" as const,
    targetId: groupId,
    payload: {},
    ...callbacks,
  };
}

function claim(
  overrides: Partial<DelegatedAdministratorActionClaimResult> = {},
): DelegatedAdministratorActionClaimResult {
  return {
    operation: "claimed",
    sellerId,
    targetId: groupId,
    status: "running",
    attemptCount: 1,
    attemptToken,
    errorCode: null,
    ...overrides,
  };
}

const requestId = uuid(1);
const workflowId = uuid(2);
const sellerId = uuid(3);
const administratorUserId = uuid(4);
const groupId = uuid(5);
const attemptToken = uuid(6);
const importRunId = uuid(7);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
