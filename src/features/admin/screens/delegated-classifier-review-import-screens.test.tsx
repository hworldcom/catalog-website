import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getReview: vi.fn(),
  listCategories: vi.fn(),
  createGroup: vi.fn(),
  mergeGroups: vi.fn(),
  splitGroup: vi.fn(),
  moveImage: vi.fn(),
  setDuplicate: vi.fn(),
  selectCover: vi.fn(),
  selectCategory: vi.fn(),
  rejectImage: vi.fn(),
  restoreImage: vi.fn(),
  approveGroup: vi.fn(),
  approveAndCreate: vi.fn(),
  getImport: vi.fn(),
  retryImport: vi.fn(),
  dispatchComparison: vi.fn(),
  getComparisonStatus: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (operation: unknown) => operation,
}));

vi.mock("@/features/seller-classifier/seller-classifier-review.functions", () => ({
  getMyClassifierReview: vi.fn(),
  listSellerClassifierCategories: vi.fn(),
  createMyClassifierGroup: vi.fn(),
  mergeMyClassifierGroups: vi.fn(),
  splitMyClassifierGroup: vi.fn(),
  moveMyClassifierImage: vi.fn(),
  setMyClassifierImageDuplicate: vi.fn(),
  selectMyClassifierGroupCover: vi.fn(),
  selectMyClassifierGroupCategory: vi.fn(),
  rejectMyClassifierImage: vi.fn(),
  restoreMyClassifierImage: vi.fn(),
  approveMyClassifierGroup: vi.fn(),
}));

vi.mock("@/features/seller-classifier/seller-classifier-import.functions", () => ({
  getMyClassifierDraftImport: vi.fn(),
  approveMyClassifierBatchAndCreateDrafts: vi.fn(),
  retryMyClassifierDraftImport: vi.fn(),
}));

vi.mock("@/features/seller-classifier/seller-classifier-comparison.functions", () => ({
  dispatchMyClassifierMultimodalComparison: mocks.dispatchComparison,
  getMyClassifierMultimodalComparisonStatus: mocks.getComparisonStatus,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => <a href={to.replace("$workflowId", params?.workflowId ?? "")}>{children}</a>,
}));

vi.mock("../delegated-classifier-review-import.functions", () => ({
  getDelegatedClassifierReview: mocks.getReview,
  listDelegatedClassifierCategories: mocks.listCategories,
  createDelegatedClassifierGroup: mocks.createGroup,
  mergeDelegatedClassifierGroups: mocks.mergeGroups,
  splitDelegatedClassifierGroup: mocks.splitGroup,
  moveDelegatedClassifierImage: mocks.moveImage,
  setDelegatedClassifierImageDuplicate: mocks.setDuplicate,
  selectDelegatedClassifierGroupCover: mocks.selectCover,
  selectDelegatedClassifierGroupCategory: mocks.selectCategory,
  rejectDelegatedClassifierImage: mocks.rejectImage,
  restoreDelegatedClassifierImage: mocks.restoreImage,
  approveDelegatedClassifierGroup: mocks.approveGroup,
  approveDelegatedClassifierBatchAndCreateDrafts: mocks.approveAndCreate,
  getDelegatedClassifierDraftImport: mocks.getImport,
  retryDelegatedClassifierDraftImport: mocks.retryImport,
}));

import {
  DelegatedClassifierImportScreen,
  DelegatedClassifierReviewScreen,
} from "./delegated-classifier-review-import-screens";

describe("delegated classifier continuation screens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.getReview.mockResolvedValue(reviewContext());
    mocks.listCategories.mockResolvedValue({
      seller: seller(),
      categories: [],
    });
    mocks.approveAndCreate.mockResolvedValue(importContext(pendingImport()));
    mocks.getImport.mockResolvedValue(importContext(readyImport()));
  });

  it("keeps seller ownership visible and audits administrator batch approval", async () => {
    const user = userEvent.setup();
    render(<DelegatedClassifierReviewScreen workflowId={workflowId} />);

    expect(await screen.findByText("Kesar Textiles")).toBeVisible();
    expect(screen.getByText(/owns the workflow and all resulting products/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /multimodal comparison/i }),
    ).not.toBeInTheDocument();
    expect(mocks.getComparisonStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Approve and create drafts for seller" }));

    expect(mocks.approveAndCreate).toHaveBeenCalledWith({
      data: {
        workflowId,
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/admin/classifier-uploads/$workflowId/import",
        params: { workflowId },
        search: { lang: "EN" },
      }),
    );
  });

  it("links imported ProductDrafts through the workflow-scoped completion route", async () => {
    render(<DelegatedClassifierImportScreen workflowId={workflowId} />);

    expect(await screen.findByText(productDraftId)).toBeVisible();
    expect(screen.getByText("Kesar Textiles")).toBeVisible();
    expect(screen.getByRole("link", { name: "Edit draft" })).toHaveAttribute(
      "href",
      `/admin/classifier-uploads/${workflowId}/products/${productDraftId}?lang=EN`,
    );
    expect(screen.getByRole("link", { name: "Back to delegated workflow" })).toHaveAttribute(
      "href",
      `/admin/classifier-uploads/${workflowId}`,
    );
  });

  it("renders administrator access failures as terminal on review and import", async () => {
    mocks.getReview.mockRejectedValueOnce(codedError("prototype_administrator_required"));
    const review = render(<DelegatedClassifierReviewScreen workflowId={workflowId} />);

    expect(
      await screen.findByText("Administrator access is required for this workflow."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    review.unmount();
    mocks.getImport.mockRejectedValueOnce(codedError("prototype_administrator_required"));
    render(<DelegatedClassifierImportScreen workflowId={workflowId} />);

    expect(
      await screen.findByText("Administrator access is required for this workflow."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

function reviewContext() {
  return {
    seller: seller(),
    review: {
      workflowId,
      stage: "approved" as const,
      pipelineVersion: "product-classifier-v1",
      groups: [
        {
          groupId: uuid(20),
          status: "approved" as const,
          confidence: 1,
          coverImageId: null,
          suggestedCategorySlug: null,
          approvedCategorySlug: "t-shirts",
          possibleExistingProductId: null,
          warnings: [],
          images: [],
        },
      ],
    },
  };
}

function importContext(
  draftImport: ReturnType<typeof pendingImport> | ReturnType<typeof readyImport>,
) {
  return {
    seller: seller(),
    draftImport,
  };
}

function pendingImport() {
  return {
    workflowId,
    stage: "importing" as const,
    importStatus: "pending" as const,
    continuationAllowed: false,
    retryAllowed: false,
    errorCode: null,
    pendingGroupCount: 1,
    processingGroupCount: 0,
    completeGroupCount: 0,
    failedGroupCount: 0,
    productDrafts: [],
  };
}

function readyImport() {
  return {
    workflowId,
    stage: "drafts_ready" as const,
    importStatus: "completed" as const,
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
        title: "Cotton shirt",
        status: "draft" as const,
        imageStatus: "available" as const,
      },
    ],
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

const workflowId = uuid(1);
const productDraftId = uuid(2);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function codedError(code: string): Error {
  return Object.assign(new Error("safe"), { code });
}
