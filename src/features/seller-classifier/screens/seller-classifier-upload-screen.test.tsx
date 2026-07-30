import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getBatch: vi.fn(),
  getUploads: vi.fn(),
  register: vi.fn(),
  retry: vi.fn(),
  finalize: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (operation: unknown) => operation,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../seller-classifier-batch.functions", () => ({
  getMyClassifierBatch: mocks.getBatch,
  getMyClassifierUploads: mocks.getUploads,
  registerMyClassifierUploads: mocks.register,
  retryMyClassifierUploads: mocks.retry,
  finalizeMyClassifierUploads: mocks.finalize,
  startMyClassifierProcessing: mocks.start,
}));

import { SellerClassifierUploadScreen } from "./seller-classifier-upload-screen";

describe("SellerClassifierUploadScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBatch.mockResolvedValue(readyWorkflow());
    mocks.getUploads.mockResolvedValue(uploadSnapshot("pending"));
    mocks.finalize.mockResolvedValue({
      upload: uploadSnapshot("failed"),
      processing: null,
    });
  });

  it("reconstructs registered rows after reload without mutating until continued", async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(await screen.findByText("front.jpg")).toBeInTheDocument();
    expect(mocks.finalize).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Check uploads and continue" }));

    expect(mocks.finalize).toHaveBeenCalledWith({ data: { workflowId: uuid(1) } });
    expect(await screen.findByText("object_missing")).toBeInTheDocument();
    expect(screen.getByText("Select the original file")).toBeInTheDocument();
  });
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerClassifierUploadScreen workflowId={uuid(1)} />
    </QueryClientProvider>,
  );
}

function readyWorkflow() {
  return {
    workflowId: uuid(1),
    provisioningStatus: "ready",
    stage: "upload",
    errorCode: null,
    retryAllowed: false,
    maxFiles: 20,
    maxFileSizeBytes: 10 * 1024 * 1024,
    createdAt: "2026-07-27T10:00:00Z",
    updatedAt: "2026-07-27T10:00:00Z",
  };
}

function uploadSnapshot(status: "pending" | "failed") {
  return {
    workflowId: uuid(1),
    status: "uploading",
    stage: "upload",
    originalFileCount: 1,
    processedFileCount: 0,
    finalizedAt: null,
    images: [
      {
        imageId: uuid(2),
        uploadOrder: 0,
        originalFilename: "front.jpg",
        status,
        errorCode: status === "failed" ? "object_missing" : null,
        retryAllowed: status === "failed",
      },
    ],
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
