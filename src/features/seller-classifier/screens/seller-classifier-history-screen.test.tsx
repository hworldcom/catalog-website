import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SellerClassifierBatchSnapshot } from "../seller-classifier-batch.types";
import type {
  SellerClassifierHistoryItem,
  SellerClassifierHistoryPage,
} from "../seller-classifier-history.types";
import {
  SellerClassifierHistoryScreenView,
  type SellerClassifierHistoryClient,
} from "./seller-classifier-history-screen";

describe("SellerClassifierHistoryScreenView", () => {
  it("loads owned history, renders known zero separately from unknown counts, and opens the server action", async () => {
    const onOpen = vi.fn();
    const client = clientMock([
      page([
        item(1, "approved", "open_import", {
          originalFiles: 5,
          processedFiles: 5,
          groups: 0,
          productDrafts: null,
        }),
      ]),
    ]);

    render(<SellerClassifierHistoryScreenView lang="EN" client={client} onOpen={onOpen} />);

    expect(await screen.findByRole("button", { name: "Continue import" })).toBeInTheDocument();
    expect(client.list).toHaveBeenCalledWith({ cursor: null, limit: 25 });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New classifier upload" })).toHaveAttribute(
      "href",
      "/seller/classifier-batches/new?lang=EN",
    );

    await userEvent.click(screen.getByRole("button", { name: "Continue import" }));
    expect(onOpen).toHaveBeenCalledWith(uuid(1), "open_import");
  });

  it("preserves loaded rows and the cursor when a next-page read fails, then deduplicates a retry", async () => {
    const first = item(1, "upload", "open_upload");
    const second = item(2, "processing", "open_processing");
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([first], "next-page"))
      .mockRejectedValueOnce(new Error("database detail"))
      .mockResolvedValueOnce(page([first, second]));
    const client: SellerClassifierHistoryClient = {
      list,
      retryProvisioning: vi.fn(),
    };

    render(<SellerClassifierHistoryScreenView lang="EN" client={client} onOpen={vi.fn()} />);
    await screen.findByRole("button", { name: "Continue upload" });

    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("More workflows could not be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue upload" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "View processing" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Continue upload" })).toHaveLength(1);
    expect(list).toHaveBeenNthCalledWith(2, { cursor: "next-page", limit: 25 });
    expect(list).toHaveBeenNthCalledWith(3, { cursor: "next-page", limit: 25 });
  });

  it("locks only the workflow being retried and opens upload when preparation becomes ready", async () => {
    const retry = deferred<SellerClassifierBatchSnapshot>();
    const retryProvisioning = vi.fn(() => retry.promise);
    const client: SellerClassifierHistoryClient = {
      list: vi.fn(async () =>
        page([
          item(1, "failed", "retry_provisioning", undefined, "provisioning_failed"),
          item(2, "failed", "retry_provisioning", undefined, "provisioning_failed"),
        ]),
      ),
      retryProvisioning,
    };
    const onOpen = vi.fn();

    render(<SellerClassifierHistoryScreenView lang="EN" client={client} onOpen={onOpen} />);
    const buttons = await screen.findAllByRole("button", { name: "Retry preparation" });
    await userEvent.click(buttons[0]!);

    expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry preparation" })).toBeEnabled();
    expect(retryProvisioning).toHaveBeenCalledWith(uuid(1));

    await act(async () => {
      retry.resolve(readySnapshot(1));
      await retry.promise;
    });

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(uuid(1), "open_upload"));
  });

  it("shows a stable seller-profile error without exposing server details", async () => {
    const client: SellerClassifierHistoryClient = {
      list: vi.fn(async () => {
        throw { code: "seller_not_found", message: "internal database detail" };
      }),
      retryProvisioning: vi.fn(),
    };

    render(<SellerClassifierHistoryScreenView lang="EN" client={client} onOpen={vi.fn()} />);

    expect(
      await screen.findByText("A seller profile is required to view classifier uploads."),
    ).toBeInTheDocument();
    expect(screen.queryByText("internal database detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("identifies administrator-created workflows without exposing administrator identity", async () => {
    const delegated = {
      ...item(1, "upload", "open_upload"),
      initiatorKind: "administrator" as const,
    };

    render(
      <SellerClassifierHistoryScreenView
        lang="EN"
        client={clientMock([page([delegated])])}
        onOpen={vi.fn()}
      />,
    );

    expect(await screen.findByText("Uploaded by administrator")).toBeInTheDocument();
    expect(screen.queryByText(/administrator@/i)).not.toBeInTheDocument();
  });
});

function clientMock(pages: SellerClassifierHistoryPage[]): SellerClassifierHistoryClient & {
  list: ReturnType<typeof vi.fn>;
} {
  return {
    list: vi.fn(async () => pages.shift() ?? page([])),
    retryProvisioning: vi.fn(),
  };
}

function page(
  workflows: SellerClassifierHistoryItem[],
  nextCursor: string | null = null,
): SellerClassifierHistoryPage {
  return { workflows, nextCursor };
}

function item(
  value: number,
  stage: SellerClassifierHistoryItem["stage"],
  primaryAction: SellerClassifierHistoryItem["primaryAction"],
  counts: SellerClassifierHistoryItem["counts"] = {
    originalFiles: null,
    processedFiles: null,
    groups: null,
    productDrafts: null,
  },
  errorSummaryCode: SellerClassifierHistoryItem["errorSummaryCode"] = null,
): SellerClassifierHistoryItem {
  return {
    workflowId: uuid(value),
    initiatorKind: "seller",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:01:00.000Z",
    stage,
    counts,
    errorSummaryCode,
    supportReference: null,
    primaryAction,
  };
}

function readySnapshot(value: number): SellerClassifierBatchSnapshot {
  return {
    workflowId: uuid(value),
    provisioningStatus: "ready",
    stage: "upload",
    errorCode: null,
    retryAllowed: false,
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:02:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
