import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContext: vi.fn(),
  retryProvisioning: vi.fn(),
  getUploads: vi.fn(),
  registerUploads: vi.fn(),
  retryUploads: vi.fn(),
  finalizeUploads: vi.fn(),
  startProcessing: vi.fn(),
  getProcessing: vi.fn(),
  getDraftImport: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (operation: unknown) => operation,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("../delegated-classifier-upload.functions", () => ({
  getDelegatedClassifierBatch: mocks.getContext,
  retryDelegatedClassifierBatchProvisioning: mocks.retryProvisioning,
  getDelegatedClassifierUploads: mocks.getUploads,
  registerDelegatedClassifierUploads: mocks.registerUploads,
  retryDelegatedClassifierUploads: mocks.retryUploads,
  finalizeDelegatedClassifierUploads: mocks.finalizeUploads,
  startDelegatedClassifierProcessing: mocks.startProcessing,
  getDelegatedClassifierProcessing: mocks.getProcessing,
}));

vi.mock("../delegated-classifier-review-import.functions", () => ({
  getDelegatedClassifierDraftImport: mocks.getDraftImport,
}));

vi.mock("@/features/seller-classifier/seller-classifier-batch.functions", () => ({
  getMyClassifierBatch: vi.fn(),
  getMyClassifierUploads: vi.fn(),
  registerMyClassifierUploads: vi.fn(),
  retryMyClassifierUploads: vi.fn(),
  finalizeMyClassifierUploads: vi.fn(),
  startMyClassifierProcessing: vi.fn(),
  getMyClassifierProcessing: vi.fn(),
}));

import { DelegatedClassifierUploadWorkflowScreen } from "./delegated-classifier-upload-workflow-screen";

describe("DelegatedClassifierUploadWorkflowScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores seller context and offers administrator review", async () => {
    mocks.getContext.mockResolvedValue(context("review"));

    renderScreen();

    expect(await screen.findByText("Kesar Textiles")).toBeInTheDocument();
    expect(screen.getByText(uuid(10))).toBeInTheDocument();
    expect(screen.getByText("Ready for administrator review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue review for seller" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("does not trust browser seller state when restoring the workflow", async () => {
    mocks.getContext.mockResolvedValue(context("review"));

    renderScreen();

    await screen.findByText("Ready for administrator review");
    expect(mocks.getContext).toHaveBeenCalledWith({
      data: { workflowId: uuid(1) },
    });
  });

  it("switches to the durable handoff state when processing reaches review", async () => {
    mocks.getContext
      .mockResolvedValueOnce(context("processing"))
      .mockResolvedValue(context("review"));
    mocks.getProcessing.mockResolvedValue(processingSnapshot());

    renderScreen();

    expect(await screen.findByText("Ready for administrator review")).toBeInTheDocument();
    expect(mocks.getContext).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Classifier processing")).not.toBeInTheDocument();
  });

  it("routes a failed workflow with a durable import to import recovery", async () => {
    mocks.getContext.mockResolvedValue(context("failed"));
    mocks.getDraftImport.mockResolvedValue({
      seller: seller(),
      draftImport: {
        workflowId: uuid(1),
        stage: "failed",
        importStatus: "completed_with_errors",
        continuationAllowed: false,
        retryAllowed: true,
        errorCode: "seller_classifier_import_incomplete",
        pendingGroupCount: 0,
        processingGroupCount: 0,
        completeGroupCount: 1,
        failedGroupCount: 1,
        productDrafts: [],
      },
    });

    renderScreen();

    expect(await screen.findByRole("link", { name: "Open seller draft import" })).toBeVisible();
    expect(screen.queryByText("Classifier processing")).not.toBeInTheDocument();
  });

  it("keeps a processing failure in processing recovery", async () => {
    mocks.getContext.mockResolvedValue({
      ...context("failed"),
      workflow: {
        ...context("failed").workflow,
        errorCode: "seller_classifier_processing_failed",
      },
    });
    mocks.getDraftImport.mockRejectedValue(codedError("delegated_review_not_allowed"));
    mocks.getProcessing.mockResolvedValue({
      ...processingSnapshot(),
      status: "failed",
      stage: "failed",
    });

    renderScreen();

    expect(await screen.findByText("Classifier processing")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Open seller draft import" }),
    ).not.toBeInTheDocument();
  });
});

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DelegatedClassifierUploadWorkflowScreen workflowId={uuid(1)} />
    </QueryClientProvider>,
  );
}

function context(stage: "processing" | "review" | "failed") {
  return {
    seller: seller(),
    workflow: {
      workflowId: uuid(1),
      provisioningStatus: "ready",
      stage,
      errorCode: null,
      retryAllowed: false,
      maxFiles: 20,
      maxFileSizeBytes: 20 * 1024 * 1024,
      createdAt: "2026-07-30T10:00:00.000Z",
      updatedAt: "2026-07-30T10:01:00.000Z",
    },
  };
}

function seller() {
  return {
    sellerId: uuid(10),
    name: "Kesar Textiles",
    slug: "kesar-textiles",
    published: true,
  };
}

function processingSnapshot() {
  return {
    workflowId: uuid(1),
    status: "review_required" as const,
    stage: "review" as const,
    originalFileCount: 1,
    processedFileCount: 1,
    pipelineVersion: "2026-06-01",
    retryAllowed: false,
    images: [],
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function codedError(code: string): Error {
  return Object.assign(new Error("safe"), { code });
}
