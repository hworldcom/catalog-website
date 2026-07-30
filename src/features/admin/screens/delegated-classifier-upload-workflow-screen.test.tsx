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

  it("restores seller context and stops at the seller-review handoff", async () => {
    mocks.getContext.mockResolvedValue(context("review"));

    renderScreen();

    expect(await screen.findByText("Kesar Textiles")).toBeInTheDocument();
    expect(screen.getByText(uuid(10))).toBeInTheDocument();
    expect(screen.getByText("Ready for seller review")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review groups" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("does not trust browser seller state when restoring the workflow", async () => {
    mocks.getContext.mockResolvedValue(context("review"));

    renderScreen();

    await screen.findByText("Ready for seller review");
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

    expect(await screen.findByText("Ready for seller review")).toBeInTheDocument();
    expect(mocks.getContext).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Classifier processing")).not.toBeInTheDocument();
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

function context(stage: "processing" | "review") {
  return {
    seller: {
      sellerId: uuid(10),
      name: "Kesar Textiles",
      slug: "kesar-textiles",
      published: true,
    },
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
