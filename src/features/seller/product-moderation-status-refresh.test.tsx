import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ProductActivationDisplayState,
  ProductModerationReviewStatus,
  ProductModerationStatusDetail,
} from "./product-moderation-status.types";
import {
  PRODUCT_MODERATION_IMAGE_REFRESH_MARGIN_MS,
  PRODUCT_MODERATION_POLL_INTERVAL_MS,
  shouldPollProductModerationStatus,
  useProductModerationStatusRefresh,
} from "./product-moderation-status-refresh";

const productId = uuid(1);
const submissionId = uuid(2);
const imageId = uuid(3);
let visibility: DocumentVisibilityState;
let originalVisibilityDescriptor: PropertyDescriptor | undefined;

describe("product moderation status refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
    } else {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it.each([
    "waiting_for_dispatch",
    "publishing",
    "abandonment_cleanup",
    "public_cleanup",
  ] satisfies ProductActivationDisplayState[])(
    "polls while activation is %s",
    async (displayState) => {
      const current = status({ activationState: displayState });
      const readStatus = vi.fn().mockResolvedValue(current);
      render(<Harness initialStatus={current} readStatus={readStatus} />);

      await act(() => vi.advanceTimersByTimeAsync(PRODUCT_MODERATION_POLL_INTERVAL_MS - 1));
      expect(readStatus).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(readStatus).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    null,
    "dispatch_failed",
    "activation_failed",
    "abandonment_cleanup_required",
    "public_cleanup_required",
    "completed",
    "abandoned",
  ] satisfies Array<ProductActivationDisplayState | null>)(
    "does not poll while activation is %s",
    async (displayState) => {
      const current = status({ activationState: displayState });
      const readStatus = vi.fn().mockResolvedValue(current);
      render(<Harness initialStatus={current} readStatus={readStatus} />);

      await act(() => vi.advanceTimersByTimeAsync(PRODUCT_MODERATION_POLL_INTERVAL_MS * 2));
      expect(readStatus).not.toHaveBeenCalled();
    },
  );

  it("refreshes pending review on focus without interval polling", async () => {
    const current = status({ reviewStatus: "pending" });
    const readStatus = vi.fn().mockResolvedValue(current);
    render(<Harness initialStatus={current} readStatus={readStatus} />);

    await act(() => vi.advanceTimersByTimeAsync(PRODUCT_MODERATION_POLL_INTERVAL_MS * 2));
    expect(readStatus).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("focus"));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(readStatus).toHaveBeenCalledTimes(1);
  });

  it("pauses while hidden and coalesces visibility and focus on return", async () => {
    const current = status({ activationState: "publishing" });
    const readStatus = vi.fn().mockResolvedValue(current);
    render(<Harness initialStatus={current} readStatus={readStatus} />);

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await act(() => vi.advanceTimersByTimeAsync(PRODUCT_MODERATION_POLL_INTERVAL_MS * 2));
    expect(readStatus).not.toHaveBeenCalled();

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(readStatus).toHaveBeenCalledTimes(1);
  });

  it("joins concurrent manual reads to one request", async () => {
    const current = status();
    const pending = deferred<ProductModerationStatusDetail>();
    const readStatus = vi.fn().mockReturnValue(pending.promise);
    render(<Harness initialStatus={current} readStatus={readStatus} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh twice" }));
    await act(() => Promise.resolve());
    expect(readStatus).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(current));
  });

  it("refreshes an available credential fifteen seconds before expiry", async () => {
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    const expiresAt = new Date(
      Date.now() + PRODUCT_MODERATION_IMAGE_REFRESH_MARGIN_MS + 5_000,
    ).toISOString();
    const current = status({ reviewStatus: "pending", expiresAt });
    const readStatus = vi.fn().mockResolvedValue(current);
    render(<Harness initialStatus={current} readStatus={readStatus} />);

    await act(() => vi.advanceTimersByTimeAsync(4_999));
    expect(readStatus).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(readStatus).toHaveBeenCalledTimes(1);
  });

  it("allows one automatic image-error refresh for the same credential", async () => {
    const current = status({
      reviewStatus: "pending",
      expiresAt: "2026-08-16T13:00:00.000Z",
    });
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    const readStatus = vi.fn().mockResolvedValue(current);
    render(<Harness initialStatus={current} readStatus={readStatus} />);

    fireEvent.click(screen.getByRole("button", { name: "Fail image twice" }));
    await act(() => Promise.resolve());
    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("failed-credentials")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "Fail image twice" }));
    await act(() => Promise.resolve());
    expect(readStatus).toHaveBeenCalledTimes(1);
  });

  it("preserves the last snapshot on failure and clears the warning after success", async () => {
    const current = status();
    const readStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(current);
    render(<Harness initialStatus={current} readStatus={readStatus} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("warning")).toBeVisible();
    expect(screen.getByTestId("product-id")).toHaveTextContent(productId);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
  });
});

describe("shouldPollProductModerationStatus", () => {
  it("uses an allowlist rather than treating unknown stopped states as active", () => {
    expect(shouldPollProductModerationStatus(status({ activationState: "publishing" }))).toBe(true);
    expect(shouldPollProductModerationStatus(status({ activationState: "completed" }))).toBe(false);
    expect(shouldPollProductModerationStatus(status())).toBe(false);
  });
});

function Harness({
  initialStatus,
  readStatus,
}: {
  initialStatus: ProductModerationStatusDetail;
  readStatus(): Promise<ProductModerationStatusDetail>;
}) {
  const [current, setCurrent] = useState(initialStatus);
  const refresh = useProductModerationStatusRefresh({
    status: current,
    readStatus,
    onStatus: setCurrent,
  });
  const image = current.submittedRevision?.images[0];
  const submission = current.submittedRevision?.submissionId;
  return (
    <div>
      <div data-testid="product-id">{current.productId}</div>
      {refresh.readWarning ? <div>warning</div> : null}
      <div data-testid="failed-credentials">{refresh.failedCredentialIdentities.size}</div>
      <button type="button" onClick={() => void refresh.refreshStatus().catch(() => undefined)}>
        Refresh
      </button>
      <button
        type="button"
        onClick={() => {
          void refresh.refreshStatus().catch(() => undefined);
          void refresh.refreshStatus().catch(() => undefined);
        }}
      >
        Refresh twice
      </button>
      <button
        type="button"
        onClick={() => {
          if (!submission || !image) return;
          refresh.handleImageError(submission, image);
          refresh.handleImageError(submission, image);
        }}
      >
        Fail image twice
      </button>
    </div>
  );
}

function status(
  options: {
    activationState?: ProductActivationDisplayState | null;
    reviewStatus?: ProductModerationReviewStatus;
    expiresAt?: string;
  } = {},
): ProductModerationStatusDetail {
  const reviewStatus = options.reviewStatus;
  const hasImage = Boolean(options.expiresAt);
  return {
    productId,
    publicState: "draft",
    actionRevision: 1,
    hasWorkingCopy: false,
    review: reviewStatus
      ? {
          submissionId,
          kind: "initial_publication",
          revision: 1,
          status: reviewStatus,
          submittedAt: "2026-08-16T11:00:00.000Z",
          decidedAt: reviewStatus === "pending" ? null : "2026-08-16T11:05:00.000Z",
          sellerVisibleReason: null,
        }
      : null,
    activation:
      options.activationState === undefined || options.activationState === null
        ? null
        : activation(options.activationState),
    actions: {
      canEdit: !reviewStatus,
      canSubmit: !reviewStatus,
      canWithdraw: reviewStatus === "pending",
      canAbandonFailedActivation: false,
      canRetryAbandonmentCleanup: false,
      canArchive: false,
      canRestore: false,
    },
    submittedRevision: reviewStatus
      ? {
          submissionId,
          snapshotSchemaVersion: 1,
          snapshot: {
            schemaVersion: 1,
            productId,
            sellerId: uuid(4),
            productCode: null,
            productCodeInput: null,
            title: "Submitted product",
            titleSource: "human",
            categoryId: null,
            audiences: ["women"],
            descriptions: [],
            facts: null,
            minimumOrder: null,
            packSize: null,
            price: null,
            currency: "EUR",
            stock: "in_stock",
            imageIds: hasImage ? [imageId] : [],
            coverImageId: hasImage ? imageId : null,
          },
          images: hasImage
            ? [
                {
                  productDraftImageId: imageId,
                  position: 0,
                  isCover: true,
                  deliveryStatus: "available",
                  deliveryErrorCode: null,
                  url: "https://storage.example.test/submitted.jpg?token=secret",
                  expiresAt: options.expiresAt ?? null,
                },
              ]
            : [],
        }
      : null,
  };
}

function activation(displayState: ProductActivationDisplayState) {
  const phase = displayState.startsWith("abandonment")
    ? ("pre_switch_cleanup" as const)
    : displayState.startsWith("public_cleanup")
      ? ("post_switch_cleanup" as const)
      : ("activation" as const);
  const statusValue =
    displayState === "completed" || displayState === "abandoned"
      ? displayState
      : displayState.endsWith("required")
        ? ("cleanup_required" as const)
        : displayState.endsWith("failed")
          ? ("failed" as const)
          : ("running" as const);
  return {
    runId: uuid(5),
    phase,
    status: statusValue,
    dispatchStatus:
      displayState === "dispatch_failed"
        ? ("failed" as const)
        : displayState === "waiting_for_dispatch"
          ? ("pending" as const)
          : ("dispatched" as const),
    dispatchGeneration: 1,
    dispatchErrorCode: null,
    errorCode: null,
    displayState,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function uuid(seed: number) {
  return `00000000-0000-4000-8000-${seed.toString().padStart(12, "0")}`;
}
