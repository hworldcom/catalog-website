import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SellerClassifierDraftImportSnapshot } from "../seller-classifier-import.types";
import {
  SellerClassifierImportScreenView,
  type SellerClassifierImportClient,
} from "./seller-classifier-import-screen";

describe("SellerClassifierImportScreenView", () => {
  it("shows continuation without polling an approved workflow that has no import", async () => {
    const client = importClient(approvedSnapshot());
    const user = userEvent.setup();
    renderImport(client, { pollIntervalMs: 5 });

    expect(await screen.findByRole("button", { name: "Continue import" })).toBeEnabled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.getImport).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Continue import" }));

    expect(client.continueImport).toHaveBeenCalledWith(workflowId);
    expect(screen.queryByRole("button", { name: "Continue import" })).not.toBeInTheDocument();
  });

  it("does not overlap polling reads and stops browser work after unmount", async () => {
    const client = importClient(pendingSnapshot());
    let resolvePoll!: (value: SellerClassifierDraftImportSnapshot) => void;
    client.getImport.mockResolvedValueOnce(pendingSnapshot()).mockImplementationOnce(
      () =>
        new Promise<SellerClassifierDraftImportSnapshot>((resolve) => {
          resolvePoll = resolve;
        }),
    );
    const view = renderImport(client, { pollIntervalMs: 5 });

    await screen.findByRole("heading", { name: "Creating product drafts" });
    await waitFor(() => expect(client.getImport).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.getImport).toHaveBeenCalledTimes(2);

    view.unmount();
    resolvePoll(readySnapshot());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.continueImport).not.toHaveBeenCalled();
    expect(client.retryImport).not.toHaveBeenCalled();
  });

  it("renders terminal drafts with deterministic title fallback and language-preserving links", async () => {
    const client = importClient(readySnapshot());
    renderImport(client, { lang: "DE" });

    const heading = await screen.findByRole("heading", { name: "Creating product drafts" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("Product drafts are ready")).toBeVisible();
    expect(screen.getByText("Untitled product draft 1")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open draft" })).toHaveAttribute(
      "href",
      `/seller/products/${productDraftId}?lang=DE`,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getImport).toHaveBeenCalledTimes(1);
  });

  it("preserves partial success, maps durable errors safely, and retries the owned import", async () => {
    const client = importClient(partialSnapshot());
    const user = userEvent.setup();
    renderImport(client, { pollIntervalMs: 100_000 });

    expect(await screen.findByText(/Some product drafts were created/)).toBeVisible();
    expect(screen.getByText(/Some product drafts are ready/)).toBeVisible();
    expect(screen.queryByText("seller_classifier_import_incomplete")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open draft" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Retry import" }));

    expect(client.retryImport).toHaveBeenCalledWith(workflowId);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Retry import" })).not.toBeInTheDocument(),
    );
  });

  it("returns to review when continuation discovers stale group approval", async () => {
    const client = importClient(approvedSnapshot());
    const onReviewRequired = vi.fn();
    client.continueImport.mockRejectedValueOnce(
      codedError("seller_classifier_groups_not_approved"),
    );
    const user = userEvent.setup();
    renderImport(client, { onReviewRequired });

    await user.click(await screen.findByRole("button", { name: "Continue import" }));

    expect(onReviewRequired).toHaveBeenCalledTimes(1);
    expect(client.getImport).toHaveBeenCalledTimes(1);
  });

  it("preserves the last complete snapshot after a polling error and retries only the read", async () => {
    const client = importClient(pendingSnapshot({ withDraft: true }));
    client.getImport
      .mockResolvedValueOnce(pendingSnapshot({ withDraft: true }))
      .mockRejectedValueOnce(codedError("seller_classifier_import_unavailable"))
      .mockResolvedValueOnce(readySnapshot());
    const user = userEvent.setup();
    renderImport(client, { pollIntervalMs: 5 });

    expect(await screen.findByRole("link", { name: "Open draft" })).toBeVisible();
    const retryRead = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByRole("link", { name: "Open draft" })).toBeVisible();

    await user.click(retryRead);

    expect(await screen.findByText("Product drafts are ready")).toBeVisible();
    expect(client.getImport).toHaveBeenCalledTimes(3);
    expect(client.continueImport).not.toHaveBeenCalled();
    expect(client.retryImport).not.toHaveBeenCalled();
  });

  it("confirms a mismatched completed response once and then stops automatic reads", async () => {
    const mismatch = {
      ...pendingSnapshot(),
      importStatus: "completed" as const,
    };
    const client = importClient(mismatch);
    renderImport(client, { pollIntervalMs: 5 });

    expect(await screen.findByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByText(/final workflow state is temporarily unavailable/)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.getImport).toHaveBeenCalledTimes(2);
  });

  it("makes another seller's workflow indistinguishable from an unknown workflow", async () => {
    const client = importClient(approvedSnapshot());
    client.getImport.mockRejectedValueOnce(codedError("seller_classifier_batch_not_found"));
    renderImport(client);

    expect(await screen.findByText("This classifier workflow was not found.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

function renderImport(
  client: ReturnType<typeof importClient>,
  options: {
    lang?: "EN" | "PL" | "DE" | "VI";
    onReviewRequired?: () => void;
    pollIntervalMs?: number;
  } = {},
) {
  return render(
    <SellerClassifierImportScreenView
      workflowId={workflowId}
      lang={options.lang ?? "EN"}
      client={client}
      onReviewRequired={options.onReviewRequired}
      pollIntervalMs={options.pollIntervalMs}
    />,
  );
}

function importClient(initial: SellerClassifierDraftImportSnapshot) {
  return {
    getImport: vi.fn(async () => initial),
    continueImport: vi.fn(async () => pendingSnapshot()),
    retryImport: vi.fn(async () => pendingSnapshot()),
  } satisfies SellerClassifierImportClient;
}

function approvedSnapshot(): SellerClassifierDraftImportSnapshot {
  return {
    workflowId,
    stage: "approved",
    importStatus: null,
    continuationAllowed: true,
    retryAllowed: false,
    errorCode: null,
    pendingGroupCount: 2,
    processingGroupCount: 0,
    completeGroupCount: 0,
    failedGroupCount: 0,
    productDrafts: [],
  };
}

function pendingSnapshot({
  withDraft = false,
}: {
  withDraft?: boolean;
} = {}): SellerClassifierDraftImportSnapshot {
  return {
    workflowId,
    stage: "importing",
    importStatus: "pending",
    continuationAllowed: false,
    retryAllowed: false,
    errorCode: null,
    pendingGroupCount: withDraft ? 1 : 2,
    processingGroupCount: 0,
    completeGroupCount: withDraft ? 1 : 0,
    failedGroupCount: 0,
    productDrafts: withDraft
      ? [
          {
            productDraftId,
            title: "Cotton shirt",
            status: "draft",
            imageStatus: "pending",
          },
        ]
      : [],
  };
}

function readySnapshot(): SellerClassifierDraftImportSnapshot {
  return {
    workflowId,
    stage: "drafts_ready",
    importStatus: "completed",
    continuationAllowed: false,
    retryAllowed: false,
    errorCode: null,
    pendingGroupCount: 0,
    processingGroupCount: 0,
    completeGroupCount: 1,
    failedGroupCount: 0,
    productDrafts: [
      {
        productDraftId,
        title: null,
        status: "draft",
        imageStatus: "available",
      },
    ],
  };
}

function partialSnapshot(): SellerClassifierDraftImportSnapshot {
  return {
    workflowId,
    stage: "failed",
    importStatus: "completed_with_errors",
    continuationAllowed: false,
    retryAllowed: true,
    errorCode: "seller_classifier_import_incomplete",
    pendingGroupCount: 0,
    processingGroupCount: 0,
    completeGroupCount: 1,
    failedGroupCount: 1,
    productDrafts: [
      {
        productDraftId,
        title: "Cotton shirt",
        status: "draft",
        imageStatus: "partially_available",
      },
    ],
  };
}

function codedError(code: string): Error {
  return Object.assign(new Error("Internal details must not be shown."), { code });
}

const workflowId = uuid(1);
const productDraftId = uuid(2);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
