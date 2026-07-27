import type { ClassifierImportSnapshot } from "./classifier-import.api";

export const CLASSIFIER_IMPORT_POLL_INTERVAL_MS = 5_000;

type PollerClient = {
  getStatus(importId: string, signal?: AbortSignal): Promise<ClassifierImportSnapshot>;
};

type ClassifierImportPollerOptions = {
  importId: string;
  client: PollerClient;
  onSnapshot: (snapshot: ClassifierImportSnapshot) => void;
  onError: (error: unknown, initial: boolean) => void;
  intervalMs?: number;
};

export class ClassifierImportPoller {
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private abortController: AbortController | undefined;
  private generation = 0;
  private snapshot: ClassifierImportSnapshot | undefined;
  private stopped = false;
  private paused = false;
  private requestActive = false;

  constructor(private readonly options: ClassifierImportPollerOptions) {
    this.intervalMs = options.intervalMs ?? CLASSIFIER_IMPORT_POLL_INTERVAL_MS;
  }

  start(): void {
    this.stopped = false;
    this.paused = false;
    void this.refresh();
  }

  retryNow(): void {
    if (this.stopped) return;
    this.paused = false;
    this.clearTimer();
    void this.refresh();
  }

  pause(): void {
    this.paused = true;
    this.invalidateActiveRequest();
    this.clearTimer();
  }

  resume(): void {
    if (this.stopped) return;
    this.paused = false;
    if (this.snapshot && isActiveStatus(this.snapshot.status)) {
      this.schedule();
    }
  }

  replace(snapshot: ClassifierImportSnapshot): void {
    if (this.stopped) return;
    this.invalidateActiveRequest();
    this.clearTimer();
    this.paused = false;
    this.snapshot = snapshot;
    this.options.onSnapshot(snapshot);
    if (isActiveStatus(snapshot.status)) this.schedule();
  }

  stop(): void {
    this.stopped = true;
    this.paused = true;
    this.invalidateActiveRequest();
    this.clearTimer();
  }

  private async refresh(): Promise<void> {
    if (this.stopped || this.paused || this.requestActive) return;

    this.clearTimer();
    const generation = ++this.generation;
    const initial = this.snapshot === undefined;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.requestActive = true;

    try {
      const snapshot = await this.options.client.getStatus(
        this.options.importId,
        abortController.signal,
      );
      if (!this.owns(generation)) return;
      this.snapshot = snapshot;
      this.options.onSnapshot(snapshot);
    } catch (error) {
      if (!this.owns(generation) || abortController.signal.aborted) return;
      this.options.onError(error, initial);
    } finally {
      if (this.owns(generation)) {
        this.requestActive = false;
        this.abortController = undefined;
        if (this.snapshot && isActiveStatus(this.snapshot.status)) this.schedule();
      }
    }
  }

  private schedule(): void {
    if (this.stopped || this.paused || this.timer || this.requestActive) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, this.intervalMs);
  }

  private owns(generation: number): boolean {
    return !this.stopped && !this.paused && this.generation === generation;
  }

  private invalidateActiveRequest(): void {
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = undefined;
    this.requestActive = false;
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

export function isActiveStatus(status: ClassifierImportSnapshot["status"]): boolean {
  return status === "pending" || status === "running";
}
