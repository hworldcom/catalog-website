import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ClassifierImportClient, ClassifierImportSnapshot } from "../classifier-import.api";
import { ClassifierImportDetailScreen } from "./classifier-import-detail-screen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to,
    );
    return <a href={href}>{children}</a>;
  },
}));

const importId = "00000000-0000-0000-0000-000000000010";
const sellerId = "00000000-0000-0000-0000-000000000030";
const productDraftId = "00000000-0000-0000-0000-000000000040";

function snapshot(overrides: Partial<ClassifierImportSnapshot> = {}): ClassifierImportSnapshot {
  return {
    importId,
    classifierBatchId: "00000000-0000-0000-0000-000000000020",
    destinationSeller: { id: sellerId, name: "Kesar Textiles" },
    status: "completed",
    operationKind: "import",
    errorCode: null,
    pendingGroupCount: 0,
    processingGroupCount: 0,
    completeGroupCount: 1,
    failedGroupCount: 0,
    actions: {
      canDispatch: false,
      canRetryTemporary: false,
      canRetryAll: false,
      canReconcile: false,
    },
    groups: [
      {
        classifierGroupId: "00000000-0000-0000-0000-000000000050",
        productDraftId,
        status: "complete",
        errorCode: null,
      },
    ],
    ...overrides,
  };
}

function client(overrides: Partial<ClassifierImportClient> = {}): ClassifierImportClient {
  return {
    listBatches: vi.fn(),
    getDestination: vi.fn(),
    start: vi.fn(),
    getStatus: vi.fn().mockResolvedValue(snapshot()),
    retry: vi.fn(),
    reconcile: vi.fn(),
    dispatch: vi.fn(),
    ...overrides,
  };
}

describe("ClassifierImportDetailScreen", () => {
  it("loads durable status and links ProductDrafts owned by the current seller", async () => {
    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={sellerId}
        client={client()}
      />,
    );

    expect(screen.getByText("Loading import status…")).toBeVisible();
    expect(await screen.findByText("Kesar Textiles")).toBeVisible();
    expect(screen.getByRole("link", { name: productDraftId })).toHaveAttribute(
      "href",
      `/seller/products/${productDraftId}`,
    );
    expect(screen.getByRole("link", { name: "Review draft" })).toHaveAttribute(
      "href",
      `/admin/product-drafts/${productDraftId}`,
    );
  });

  it("keeps cross-seller ProductDraft identifiers read-only", async () => {
    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId="00000000-0000-0000-0000-000000000099"
        client={client()}
      />,
    );

    expect(await screen.findByText("Kesar Textiles")).toBeVisible();
    expect(screen.getByText(productDraftId)).toBeVisible();
    expect(screen.queryByRole("link", { name: productDraftId })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review draft" })).toHaveAttribute(
      "href",
      `/admin/product-drafts/${productDraftId}`,
    );
  });

  it("shows an unavailable seller without hiding its durable identifier", async () => {
    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={null}
        client={client({
          getStatus: vi
            .fn()
            .mockResolvedValue(snapshot({ destinationSeller: { id: sellerId, name: null } })),
        })}
      />,
    );

    expect(await screen.findByText("Seller unavailable")).toBeVisible();
    expect(screen.getByText(sellerId)).toBeVisible();
  });

  it("replaces the snapshot immediately after a temporary retry", async () => {
    const failed = snapshot({
      status: "completed_with_errors",
      completeGroupCount: 0,
      failedGroupCount: 1,
      actions: {
        canDispatch: false,
        canRetryTemporary: true,
        canRetryAll: true,
        canReconcile: false,
      },
      groups: [
        {
          classifierGroupId: "00000000-0000-0000-0000-000000000050",
          productDraftId: null,
          status: "failed",
          errorCode: "temporary_storage_error",
        },
      ],
    });
    const pending = snapshot({
      status: "pending",
      pendingGroupCount: 1,
      completeGroupCount: 0,
      groups: [],
    });
    const retry = vi.fn().mockResolvedValue(pending);
    const testClient = client({
      getStatus: vi.fn().mockResolvedValue(failed),
      retry,
    });

    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={sellerId}
        client={testClient}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Retry temporary failures" }));

    expect(retry).toHaveBeenCalledWith(importId, false);
    expect(
      await screen.findByText(
        "Processing is queued. Bazoria will start this import automatically.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Retry temporary failures" }),
    ).not.toBeInTheDocument();
  });

  it("confirms an all-failure retry and sends the non-retryable override", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const retry = vi.fn().mockResolvedValue(snapshot({ status: "pending", groups: [] }));
    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={sellerId}
        client={client({
          getStatus: vi.fn().mockResolvedValue(
            snapshot({
              status: "failed",
              actions: {
                canDispatch: false,
                canRetryTemporary: false,
                canRetryAll: true,
                canReconcile: false,
              },
            }),
          ),
          retry,
        })}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Retry all failures" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith(importId, true);
    confirm.mockRestore();
  });

  it("uses the reconciliation response and labels the running operation", async () => {
    const reconcileSnapshot = snapshot({
      status: "running",
      operationKind: "reconcile",
      actions: {
        canDispatch: false,
        canRetryTemporary: false,
        canRetryAll: false,
        canReconcile: false,
      },
    });
    const reconcile = vi.fn().mockResolvedValue(reconcileSnapshot);
    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={sellerId}
        client={client({
          getStatus: vi.fn().mockResolvedValue(
            snapshot({
              actions: {
                canDispatch: false,
                canRetryTemporary: false,
                canRetryAll: false,
                canReconcile: true,
              },
            }),
          ),
          reconcile,
        })}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Reconcile promoted images" }));

    expect(reconcile).toHaveBeenCalledWith(importId);
    expect(await screen.findByText("Reconciliation is running.")).toBeVisible();
  });

  it("keeps status visible when an action fails", async () => {
    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={sellerId}
        client={client({
          getStatus: vi.fn().mockResolvedValue(
            snapshot({
              status: "failed",
              actions: {
                canDispatch: false,
                canRetryTemporary: true,
                canRetryAll: false,
                canReconcile: false,
              },
            }),
          ),
          retry: vi.fn().mockRejectedValue(new Error("Retry is not allowed.")),
        })}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Retry temporary failures" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Retry is not allowed.");
    expect(screen.getByText("Kesar Textiles")).toBeVisible();
  });

  it("shows an initial load error and supports a manual retry", async () => {
    const getStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("Status service unavailable."))
      .mockResolvedValueOnce(snapshot());
    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={sellerId}
        client={client({ getStatus })}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Status service unavailable.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Kesar Textiles")).toBeVisible();
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["pending", "Processing is queued. Bazoria will start this import automatically."],
    [
      "running",
      "The import is starting. Group outcomes will appear as approved groups are prepared.",
    ],
    [
      "failed",
      "The import stopped before any group outcomes were created. Review the stable error above and use an available retry action.",
    ],
    [
      "completed_with_errors",
      "The import completed with errors, but no group outcomes were returned.",
    ],
    ["completed", "The import completed without group outcomes."],
  ] as const)("explains an empty %s import", async (status, message) => {
    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={sellerId}
        client={client({
          getStatus: vi.fn().mockResolvedValue(
            snapshot({
              status,
              errorCode: status === "failed" ? "source_unavailable" : null,
              completeGroupCount: 0,
              groups: [],
            }),
          ),
        })}
      />,
    );

    expect(await screen.findByText(message)).toBeVisible();
    if (status === "failed") expect(screen.getByText("source_unavailable")).toBeVisible();
  });

  it("dispatches pending recovery work from the server-derived action", async () => {
    const pending = snapshot({
      status: "pending",
      completeGroupCount: 0,
      actions: {
        canDispatch: true,
        canRetryTemporary: false,
        canRetryAll: false,
        canReconcile: false,
      },
      groups: [],
    });
    const running = snapshot({
      status: "running",
      completeGroupCount: 0,
      groups: [],
    });
    const dispatch = vi.fn().mockResolvedValue(running);

    render(
      <ClassifierImportDetailScreen
        importId={importId}
        currentSellerId={sellerId}
        client={client({
          getStatus: vi.fn().mockResolvedValue(pending),
          dispatch,
        })}
      />,
    );

    expect(
      await screen.findByText(
        "Processing has not started. Retry processing to dispatch this import again.",
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry processing" }));

    expect(dispatch).toHaveBeenCalledWith(importId);
    expect(
      await screen.findByText(
        "The import is starting. Group outcomes will appear as approved groups are prepared.",
      ),
    ).toBeVisible();
  });
});
