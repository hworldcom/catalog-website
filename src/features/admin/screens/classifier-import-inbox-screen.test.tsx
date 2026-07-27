import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ClassifierImportRequestError,
  type ClassifierBatchInboxItem,
  type ClassifierBatchInboxPage,
  type ClassifierImportClient,
} from "../classifier-import.api";
import { ClassifierImportInboxScreen } from "./classifier-import-inbox-screen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params?: { importId?: string };
  }) => <a href={to.replace("$importId", params?.importId ?? "")}>{children}</a>,
}));

const batchId = "00000000-0000-0000-0000-000000000020";
const secondBatchId = "00000000-0000-0000-0000-000000000021";
const importId = "00000000-0000-0000-0000-000000000010";
const sellerId = "00000000-0000-0000-0000-000000000030";
const destination = {
  destinationSeller: { id: sellerId, name: "Kesar Textiles" },
  source: "prototype_default" as const,
};

function batch(overrides: Partial<ClassifierBatchInboxItem> = {}): ClassifierBatchInboxItem {
  return {
    batchId,
    organizationId: "00000000-0000-0000-0000-000000000001",
    pipelineVersion: "2026-06-01",
    createdAt: "2026-07-22T10:00:00Z",
    finalizedAt: "2026-07-22T10:05:00Z",
    originalFileCount: 8,
    processedFileCount: 8,
    groupCount: 3,
    imports: [],
    ...overrides,
  };
}

function page(
  items: ClassifierBatchInboxItem[] = [batch()],
  nextCursor: string | null = null,
): ClassifierBatchInboxPage {
  return { items, nextCursor };
}

function client(overrides: Partial<ClassifierImportClient> = {}): ClassifierImportClient {
  return {
    listBatches: vi.fn().mockResolvedValue(page()),
    getDestination: vi.fn().mockResolvedValue(destination),
    start: vi.fn(),
    getStatus: vi.fn(),
    retry: vi.fn(),
    reconcile: vi.fn(),
    dispatch: vi.fn(),
    ...overrides,
  };
}

describe("ClassifierImportInboxScreen", () => {
  it("loads approved batches and displays the prototype destination read-only", async () => {
    render(<ClassifierImportInboxScreen client={client()} onOpenImport={vi.fn()} />);

    expect(screen.getByText("Loading approved batches…")).toBeVisible();
    expect(await screen.findByText(batchId)).toBeVisible();
    expect(screen.getByText("Kesar Textiles")).toBeVisible();
    expect(screen.getByText(sellerId)).toBeVisible();
    expect(screen.getByText("Ready for authorization")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve and import" })).toBeEnabled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders an empty inbox without authorizing any import", async () => {
    const start = vi.fn();
    render(
      <ClassifierImportInboxScreen
        client={client({ listBatches: vi.fn().mockResolvedValue(page([])), start })}
        onOpenImport={vi.fn()}
      />,
    );

    expect(await screen.findByText("No approved batches")).toBeVisible();
    expect(start).not.toHaveBeenCalled();
  });

  it("uses opaque cursor history for next and previous navigation", async () => {
    const listBatches = vi.fn(
      async ({ cursor }: Parameters<ClassifierImportClient["listBatches"]>[0]) =>
        cursor ? page([batch({ batchId: secondBatchId })]) : page([batch()], "opaque-next-cursor"),
    );
    render(<ClassifierImportInboxScreen client={client({ listBatches })} onOpenImport={vi.fn()} />);

    expect(await screen.findByText(batchId)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(secondBatchId)).toBeVisible();
    expect(listBatches).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "opaque-next-cursor", limit: 20 }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText(batchId)).toBeVisible();
    expect(listBatches).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: undefined, limit: 20 }),
    );
  });

  it("keeps the last successful page visible when the next page fails", async () => {
    const listBatches = vi
      .fn()
      .mockResolvedValueOnce(page([batch()], "next-page"))
      .mockRejectedValueOnce(new Error("Inbox service unavailable."));
    render(<ClassifierImportInboxScreen client={client({ listBatches })} onOpenImport={vi.fn()} />);

    expect(await screen.findByText(batchId)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Inbox service unavailable.");
    expect(screen.getByText(batchId)).toBeVisible();
    expect(screen.getByText("Page 1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("confirms the immutable destination and prevents duplicate authorization", async () => {
    let resolveStart!: (value: Awaited<ReturnType<ClassifierImportClient["start"]>>) => void;
    const start = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ClassifierImportClient["start"]>>>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const onOpenImport = vi.fn();
    render(<ClassifierImportInboxScreen client={client({ start })} onOpenImport={onOpenImport} />);

    await userEvent.click(await screen.findByRole("button", { name: "Approve and import" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(batchId);
    expect(dialog).toHaveTextContent("Kesar Textiles");
    expect(dialog).toHaveTextContent(sellerId);

    await userEvent.click(screen.getByRole("button", { name: "Approve and import" }));
    expect(screen.getByRole("button", { name: "Authorizing…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Authorizing…" }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(batchId);

    resolveStart({
      importId,
      classifierBatchId: batchId,
      destinationSeller: destination.destinationSeller,
      status: "pending",
      dispatchStatus: "accepted",
    });
    await waitFor(() => expect(onOpenImport).toHaveBeenCalledWith(importId));
  });

  it("disables authorization when the default destination cannot be loaded", async () => {
    render(
      <ClassifierImportInboxScreen
        client={client({
          getDestination: vi.fn().mockRejectedValue(new Error("Default store unavailable.")),
        })}
        onOpenImport={vi.fn()}
      />,
    );

    expect(await screen.findByText(batchId)).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent("Default store unavailable.");
    expect(screen.getByRole("button", { name: "Approve and import" })).toBeDisabled();
  });

  it("shows stored attribution and status for an existing import", async () => {
    const importedBatch = batch({
      imports: [
        {
          importId,
          destinationSeller: { id: sellerId, name: "Stored Kesar Textiles" },
          status: "failed",
          operationKind: "import",
          errorCode: "source_unavailable",
          createdAt: "2026-07-22T11:00:00Z",
          updatedAt: "2026-07-22T11:05:00Z",
        },
      ],
    });
    render(
      <ClassifierImportInboxScreen
        client={client({ listBatches: vi.fn().mockResolvedValue(page([importedBatch])) })}
        onOpenImport={vi.fn()}
      />,
    );

    expect(await screen.findByText("Stored Kesar Textiles")).toBeVisible();
    expect(screen.getByText("Failed")).toBeVisible();
    expect(screen.getByText("source_unavailable")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open import details" })).toHaveAttribute(
      "href",
      `/admin/classifier-imports/${importId}`,
    );
    expect(screen.queryByRole("button", { name: "Approve and import" })).not.toBeInTheDocument();
  });

  it("opens an existing import returned by retry-required authorization", async () => {
    const onOpenImport = vi.fn();
    render(
      <ClassifierImportInboxScreen
        client={client({
          start: vi
            .fn()
            .mockRejectedValue(
              new ClassifierImportRequestError(
                409,
                "classifier_import_retry_required",
                "The import requires an explicit retry.",
                importId,
              ),
            ),
        })}
        onOpenImport={onOpenImport}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Approve and import" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve and import" }));

    await waitFor(() => expect(onOpenImport).toHaveBeenCalledWith(importId));
  });
});
