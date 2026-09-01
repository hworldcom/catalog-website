export type UatFixtureActivationRun = {
  claimStartedAt: string | null;
  dispatchGeneration: number;
  dispatchStatus: "pending" | "dispatched" | "failed";
  errorCode: string | null;
  id: string;
  phase: "activation" | "post_switch_cleanup";
  status: "pending" | "running" | "failed" | "cleanup_required" | "completed" | "abandoned";
};

export interface UatFixtureActivationBackend {
  dispatch(run: UatFixtureActivationRun): Promise<void>;
  isRetryable(errorCode: string): Promise<boolean>;
  readRun(submissionId: string): Promise<UatFixtureActivationRun | null>;
  recover(): Promise<void>;
  retryActivation(run: UatFixtureActivationRun, requestId: string): Promise<void>;
  retryDispatch(run: UatFixtureActivationRun, requestId: string): Promise<void>;
}

const POLL_INTERVAL_MS = 500;
const COMPLETION_DEADLINE_MS = 300_000;

export class UatMarketplaceFixtureActivationCoordinator {
  constructor(
    private readonly backend: UatFixtureActivationBackend,
    private readonly claimTimeoutSeconds: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (milliseconds: number) => Promise<void> = delay,
  ) {}

  async complete(input: {
    submissionId: string;
    retryActivationRequestId: string;
    retryDispatchRequestId: string;
  }): Promise<UatFixtureActivationRun> {
    let run = await this.requireRun(input.submissionId);
    let deadline = this.deadlineFor(run);

    while (true) {
      if (run.status === "completed") return run;
      if (run.status === "abandoned" || run.status === "cleanup_required") throw activationFailed();

      if (run.status === "failed") {
        if (!run.errorCode || !(await this.backend.isRetryable(run.errorCode))) {
          throw activationFailed();
        }
        await this.backend.retryActivation(run, input.retryActivationRequestId);
        deadline = this.now() + COMPLETION_DEADLINE_MS;
      } else if (run.status === "pending" && run.dispatchStatus === "failed") {
        await this.backend.retryDispatch(run, input.retryDispatchRequestId);
        deadline = this.now() + COMPLETION_DEADLINE_MS;
      } else if (run.status === "pending" && run.dispatchStatus === "pending") {
        await this.backend.dispatch(run);
      } else if (run.status !== "running" || this.claimExpired(run)) {
        await this.backend.recover();
      }

      if (this.now() >= deadline) throw activationFailed();
      await this.sleep(POLL_INTERVAL_MS);
      run = await this.requireRun(input.submissionId);
    }
  }

  private async requireRun(submissionId: string): Promise<UatFixtureActivationRun> {
    const run = await this.backend.readRun(submissionId);
    if (!run) throw activationFailed();
    return run;
  }

  private deadlineFor(run: UatFixtureActivationRun): number {
    if (run.status !== "running" || !run.claimStartedAt) {
      return this.now() + COMPLETION_DEADLINE_MS;
    }
    const claimExpiresAt = Date.parse(run.claimStartedAt) + this.claimTimeoutSeconds * 1_000;
    return Math.max(this.now(), claimExpiresAt) + COMPLETION_DEADLINE_MS;
  }

  private claimExpired(run: UatFixtureActivationRun): boolean {
    return (
      !run.claimStartedAt ||
      Date.parse(run.claimStartedAt) + this.claimTimeoutSeconds * 1_000 <= this.now()
    );
  }
}

function activationFailed(): Error {
  return new Error("uat_marketplace_fixture_activation_failed");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
