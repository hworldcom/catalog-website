import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    mocks.start.mockResolvedValue(undefined);
    mocks.finalize.mockResolvedValue({
      upload: uploadSnapshot("failed"),
      processing: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers selected files, uploads them directly, finalizes, and opens processing", async () => {
    const user = userEvent.setup();
    const file = jpeg("front.jpg", 100);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.getUploads.mockResolvedValueOnce(createdUploadSnapshot());
    mocks.register.mockResolvedValueOnce(registration("front.jpg", uuid(2)));
    mocks.finalize.mockResolvedValueOnce({
      upload: processingUploadSnapshot(),
      processing: processingSnapshot(),
    });

    const view = renderScreen();
    expect(await screen.findByRole("button", { name: "Upload images" })).toBeDisabled();

    await user.upload(view.container.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(screen.getByRole("button", { name: "Upload images" }));

    await waitFor(() =>
      expect(mocks.register).toHaveBeenCalledWith({
        data: {
          workflowId: uuid(1),
          files: [
            {
              originalFilename: "front.jpg",
              mimeType: "image/jpeg",
              sizeBytes: 100,
            },
          ],
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.example.test/front",
      expect.objectContaining({ method: "PUT", body: file }),
    );
    expect(mocks.finalize).toHaveBeenCalledWith({ data: { workflowId: uuid(1) } });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/seller/classifier-batches/$workflowId/processing",
      params: { workflowId: uuid(1) },
    });
  });

  it("retries only failed rows selected with their original files", async () => {
    const user = userEvent.setup();
    const retryFile = jpeg("back.jpg", 90);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.getUploads.mockResolvedValueOnce(mixedFailureSnapshot());
    mocks.retry.mockResolvedValueOnce(registration("back.jpg", uuid(3)));
    mocks.finalize.mockResolvedValueOnce({
      upload: processingUploadSnapshot(),
      processing: processingSnapshot(),
    });

    const view = renderScreen();
    expect(await screen.findByText("back.jpg")).toBeVisible();

    await user.upload(
      view.container.querySelector('input[type="file"]') as HTMLInputElement,
      retryFile,
    );
    await user.click(screen.getByRole("button", { name: "Retry selected files (1)" }));

    await waitFor(() =>
      expect(mocks.retry).toHaveBeenCalledWith({
        data: { workflowId: uuid(1), imageIds: [uuid(3)] },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.finalize).toHaveBeenCalledWith({ data: { workflowId: uuid(1) } });
  });

  it("starts queued processing once without requiring a separate browser dispatch", async () => {
    mocks.getUploads.mockResolvedValueOnce(queuedUploadSnapshot());
    mocks.start.mockResolvedValueOnce(undefined);

    renderScreen();

    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith({ data: { workflowId: uuid(1) } }),
    );
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/seller/classifier-batches/$workflowId/processing",
      params: { workflowId: uuid(1) },
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

function createdUploadSnapshot() {
  return {
    workflowId: uuid(1),
    status: "created" as const,
    stage: "upload" as const,
    originalFileCount: 0,
    processedFileCount: 0,
    finalizedAt: null,
    images: [],
  };
}

function queuedUploadSnapshot() {
  return {
    workflowId: uuid(1),
    status: "queued" as const,
    stage: "processing" as const,
    originalFileCount: 1,
    processedFileCount: 0,
    finalizedAt: "2026-07-27T10:05:00Z",
    images: [
      {
        imageId: uuid(2),
        uploadOrder: 0,
        originalFilename: "front.jpg",
        status: "uploaded" as const,
        errorCode: null,
        retryAllowed: false,
      },
    ],
  };
}

function processingUploadSnapshot() {
  return {
    ...queuedUploadSnapshot(),
    status: "processing" as const,
  };
}

function mixedFailureSnapshot() {
  return {
    workflowId: uuid(1),
    status: "uploading" as const,
    stage: "upload" as const,
    originalFileCount: 2,
    processedFileCount: 0,
    finalizedAt: null,
    images: [
      {
        imageId: uuid(2),
        uploadOrder: 0,
        originalFilename: "front.jpg",
        status: "uploaded" as const,
        errorCode: null,
        retryAllowed: false,
      },
      {
        imageId: uuid(3),
        uploadOrder: 1,
        originalFilename: "back.jpg",
        status: "failed" as const,
        errorCode: "object_missing",
        retryAllowed: true,
      },
    ],
  };
}

function registration(originalFilename: string, imageId: string) {
  return {
    workflowId: uuid(1),
    status: "uploading" as const,
    uploads: [
      {
        imageId,
        uploadOrder: originalFilename === "front.jpg" ? 0 : 1,
        originalFilename,
        uploadUrl: `https://storage.example.test/${originalFilename.replace(".jpg", "")}`,
      },
    ],
  };
}

function processingSnapshot() {
  return {
    workflowId: uuid(1),
    status: "processing" as const,
    stage: "processing" as const,
    originalFileCount: 1,
    processedFileCount: 0,
    pipelineVersion: "product-classifier-v1",
    retryAllowed: false,
    images: [],
  };
}

function jpeg(name: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type: "image/jpeg" });
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
