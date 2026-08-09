import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (operation: unknown) => operation,
}));

vi.mock("../seller-classifier-batch.functions", () => ({
  getMyClassifierProcessing: mocks.get,
  startMyClassifierProcessing: mocks.start,
}));

import { SellerClassifierProcessingScreen } from "./seller-classifier-processing-screen";

describe("SellerClassifierProcessingScreen", () => {
  it("polls read-only state and links to review when grouping is ready", async () => {
    mocks.get.mockResolvedValueOnce({
      workflowId: uuid(1),
      status: "review_required",
      stage: "review",
      originalFileCount: 1,
      processedFileCount: 1,
      pipelineVersion: "2026-06-01",
      retryAllowed: false,
      images: [
        {
          imageId: uuid(2),
          uploadOrder: 0,
          originalFilename: "front.jpg",
          imageStatus: "processed",
          processJobStatus: "completed",
          processError: null,
          classifyJobStatus: "completed",
          classifyError: null,
          categorySlug: "t-shirts",
          confidence: 0.95,
          hasHashes: true,
          hasEmbedding: true,
        },
      ],
    });

    renderScreen();

    expect(await screen.findByText("Product groups are ready for review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review groups" })).toHaveAttribute(
      "href",
      `/seller/classifier-batches/${uuid(1)}/review`,
    );
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("offers manual ingestion when processing state is unavailable from the classifier", async () => {
    mocks.get.mockRejectedValueOnce(
      Object.assign(new Error("The classifier is temporarily unavailable."), {
        code: "seller_classifier_unavailable",
      }),
    );

    renderScreen();

    expect(await screen.findByRole("link", { name: "Add product manually" })).toHaveAttribute(
      "href",
      "/seller/products/new",
    );
  });
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerClassifierProcessingScreen workflowId={uuid(1)} />
    </QueryClientProvider>,
  );
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
