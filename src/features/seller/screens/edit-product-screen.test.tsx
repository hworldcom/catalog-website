import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductModerationStatusDetail } from "../product-moderation-status.types";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getPrivate: vi.fn(),
  begin: vi.fn(),
  submit: vi.fn(),
  withdraw: vi.fn(),
  abandon: vi.fn(),
  retryCleanup: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  listCategories: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/features/seller/products.functions", () => ({
  getMyProductModerationStatus: mocks.getStatus,
  getMyProduct: mocks.getPrivate,
  archiveMyProduct: mocks.archive,
  restoreMyProduct: mocks.restore,
}));

vi.mock("@/features/seller/product-moderation.functions", () => ({
  beginMyProductEditing: mocks.begin,
  submitMyProductForModeration: mocks.submit,
  withdrawMyProductModerationSubmission: mocks.withdraw,
  abandonMyFailedProductActivation: mocks.abandon,
  retryMyProductAbandonmentCleanup: mocks.retryCleanup,
}));

vi.mock("@/features/seller/categories.functions", () => ({
  listProductCategories: mocks.listCategories,
}));

vi.mock("../components/product-editor", () => ({
  ProductEditor: ({
    disabled,
    onStateChange,
  }: {
    disabled?: boolean;
    onStateChange?(state: { dirty: boolean; saving: boolean; publicationActive: boolean }): void;
  }) => (
    <div data-testid="private-product-editor" data-disabled={disabled ? "true" : "false"}>
      Private product fields
      <button
        type="button"
        disabled={disabled}
        onClick={() => onStateChange?.({ dirty: true, saving: false, publicationActive: false })}
      >
        Mark product dirty
      </button>
    </div>
  ),
}));

vi.mock("../components/product-draft-image-gallery", () => ({
  ProductDraftImageGallery: () => <div data-testid="private-gallery">Private gallery</div>,
}));

vi.mock("@/features/product-draft-facts/components/product-draft-facts-editor", () => ({
  ProductDraftFactsEditor: () => <div>Private facts</div>,
}));

vi.mock(
  "@/features/product-draft-descriptions/components/seller-product-draft-description-section",
  () => ({
    SellerProductDraftDescriptionSection: () => <div>Private descriptions</div>,
  }),
);

vi.mock("../components/product-moderation-status-view", () => ({
  ProductModerationAxes: () => <div data-testid="moderation-axes">Moderation axes</div>,
  ProductModerationFeedback: ({ reason }: { reason: string }) => <div>{reason}</div>,
  ProductModerationSubmittedRevisionView: () => (
    <div data-testid="submitted-revision">Submitted revision</div>
  ),
  PublishedProductLink: () => <a href="/public-product">View published product</a>,
}));

import { EditProductScreen } from "./edit-product-screen";

const productId = uuid(1);

describe("EditProductScreen moderation modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCategories.mockResolvedValue({ categories: [] });
    mocks.getPrivate.mockResolvedValue(privateSnapshot());
    mocks.begin.mockResolvedValue({ productId, moderationRevision: 4, editSource: "working_copy" });
    mocks.archive.mockResolvedValue({ result: "archived" });
    mocks.restore.mockResolvedValue({ result: "restoration_draft" });
  });

  it("loads pending review status without reading mutable private state", async () => {
    mocks.getStatus.mockResolvedValue(status({ review: review("pending"), canWithdraw: true }));

    renderScreen();

    expect(await screen.findByTestId("moderation-axes")).toBeVisible();
    expect(screen.getByTestId("submitted-revision")).toBeVisible();
    expect(screen.getByRole("button", { name: "Withdraw submission" })).toBeVisible();
    expect(screen.queryByTestId("private-product-editor")).not.toBeInTheDocument();
    expect(mocks.getPrivate).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it("uses the returned withdrawal status before loading the retained private draft", async () => {
    const pending = status({ review: review("pending"), canWithdraw: true });
    const withdrawn = status({
      review: review("withdrawn"),
      canEdit: true,
      canSubmit: true,
      hasWorkingCopy: true,
    });
    mocks.getStatus.mockResolvedValue(pending);
    mocks.withdraw.mockResolvedValue({ moderationStatus: withdrawn });

    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Withdraw submission" }));

    await waitFor(() => expect(mocks.withdraw).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("private-product-editor")).toBeVisible();
    expect(mocks.getStatus).toHaveBeenCalledTimes(1);
  });

  it("begins a published private edit and rereads status before mounting the editor", async () => {
    const published = status({ publicState: "published", canEdit: true });
    const editable = status({
      publicState: "published",
      canEdit: true,
      canSubmit: true,
      hasWorkingCopy: true,
      actionRevision: 4,
    });
    mocks.getStatus.mockResolvedValueOnce(published).mockResolvedValueOnce(editable);

    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Edit private draft" }));

    await waitFor(() => expect(mocks.begin).toHaveBeenCalledWith({ data: { productId } }));
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("private-product-editor")).toBeVisible();
    expect(mocks.getPrivate.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.getStatus.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it("loads a never-approved private draft and submits only its saved revision", async () => {
    const draft = status({ canEdit: true, canSubmit: true, actionRevision: 6 });
    const pending = status({
      actionRevision: 6,
      review: review("pending"),
      canWithdraw: true,
    });
    mocks.getStatus.mockResolvedValue(draft);
    mocks.submit.mockResolvedValue({ moderationStatus: pending });

    renderScreen();

    expect(await screen.findByTestId("private-product-editor")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0]?.[0].data).toMatchObject({
      productId,
      expectedModerationRevision: 6,
    });
    expect(screen.getByTestId("submitted-revision")).toBeVisible();
  });

  it("shows feedback above the retained private editor for requested changes", async () => {
    mocks.getStatus.mockResolvedValue(
      status({
        review: { ...review("changes_requested"), sellerVisibleReason: "Add material details." },
        canEdit: true,
        canSubmit: true,
        hasWorkingCopy: true,
      }),
    );

    renderScreen();

    expect(await screen.findByText("Add material details.")).toBeVisible();
    expect(screen.getByTestId("submitted-revision")).toBeVisible();
    expect(await screen.findByTestId("private-product-editor")).toBeVisible();
  });

  it("restores an archived working copy only after the authoritative reread", async () => {
    const archived = status({ publicState: "archived", canRestore: true });
    const restored = status({
      publicState: "archived",
      canEdit: true,
      canSubmit: true,
      hasWorkingCopy: true,
      actionRevision: 9,
    });
    mocks.getStatus.mockResolvedValueOnce(archived).mockResolvedValueOnce(restored);

    renderScreen();
    expect(await screen.findByRole("button", { name: "Restore" })).toBeVisible();
    expect(mocks.getPrivate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("private-product-editor")).toBeVisible();
    expect(mocks.getPrivate.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.getStatus.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it("renders only backend-authorized activation recovery controls", async () => {
    mocks.getStatus.mockResolvedValue(
      status({
        review: { ...review("approved"), kind: "update" },
        activation: activation("activation_failed"),
        canAbandonFailedActivation: true,
      }),
    );

    renderScreen();

    expect(await screen.findByRole("button", { name: "Abandon failed update" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry cleanup" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("private-product-editor")).not.toBeInTheDocument();
  });

  it("preserves and disables a dirty editor when a status refresh advances elsewhere", async () => {
    const draft = status({ canEdit: true, canSubmit: true, actionRevision: 3 });
    const pending = status({
      actionRevision: 4,
      review: review("pending"),
      canWithdraw: true,
    });
    mocks.getStatus.mockResolvedValueOnce(draft).mockResolvedValueOnce(pending);

    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Mark product dirty" }));
    await waitFor(() =>
      expect(screen.getByText(/save all changes and finish image operations/i)).toBeVisible(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Refresh status" }));

    expect(await screen.findByText("Unsaved changes are out of date")).toBeVisible();
    expect(screen.getByTestId("private-product-editor")).toHaveAttribute("data-disabled", "true");
    expect(screen.getByRole("button", { name: "Mark product dirty" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reload and discard unsaved changes" }),
    ).toBeVisible();
  });

  it.each([
    ["a never-approved draft", status({ canEdit: true, canArchive: true }), "cannot be restored"],
    [
      "a pending review",
      status({ review: review("pending"), canWithdraw: true, canArchive: true }),
      "pending submission will be withdrawn",
    ],
    [
      "an unsent working copy",
      status({ publicState: "published", hasWorkingCopy: true, canEdit: true, canArchive: true }),
      "unsent private changes",
    ],
    [
      "a currently public product",
      status({ publicState: "published", canEdit: true, canArchive: true }),
      "current public version",
    ],
  ])("explains the consequence before archiving %s", async (_label, current, warning) => {
    mocks.getStatus
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(status({ publicState: "archived" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

    await waitFor(() => expect(mocks.archive).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining(warning));
    confirm.mockRestore();
  });
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditProductScreen productId={productId} />
    </QueryClientProvider>,
  );
}

function status(
  options: {
    publicState?: "draft" | "published" | "archived";
    actionRevision?: number;
    hasWorkingCopy?: boolean;
    review?: ProductModerationStatusDetail["review"];
    activation?: ProductModerationStatusDetail["activation"];
    canEdit?: boolean;
    canSubmit?: boolean;
    canWithdraw?: boolean;
    canAbandonFailedActivation?: boolean;
    canRetryAbandonmentCleanup?: boolean;
    canArchive?: boolean;
    canRestore?: boolean;
  } = {},
): ProductModerationStatusDetail {
  return {
    productId,
    publicState: options.publicState ?? "draft",
    actionRevision: options.actionRevision ?? 3,
    hasWorkingCopy: options.hasWorkingCopy ?? false,
    review: options.review ?? null,
    activation: options.activation ?? null,
    actions: {
      canEdit: options.canEdit ?? false,
      canSubmit: options.canSubmit ?? false,
      canWithdraw: options.canWithdraw ?? false,
      canAbandonFailedActivation: options.canAbandonFailedActivation ?? false,
      canRetryAbandonmentCleanup: options.canRetryAbandonmentCleanup ?? false,
      canArchive: options.canArchive ?? false,
      canRestore: options.canRestore ?? false,
    },
    submittedRevision: options.review ? submittedRevision(options.review.submissionId) : null,
  };
}

function review(statusValue: NonNullable<ProductModerationStatusDetail["review"]>["status"]) {
  return {
    submissionId: uuid(2),
    kind: "initial_publication" as const,
    revision: 3,
    status: statusValue,
    submittedAt: "2026-08-16T10:00:00.000Z",
    decidedAt: statusValue === "pending" ? null : "2026-08-16T10:05:00.000Z",
    sellerVisibleReason: null,
  };
}

function activation(
  displayState: "activation_failed",
): NonNullable<ProductModerationStatusDetail["activation"]> {
  return {
    runId: uuid(3),
    phase: "activation",
    status: "failed",
    dispatchStatus: "dispatched",
    dispatchGeneration: 1,
    dispatchErrorCode: null,
    errorCode: "product_activation_failed",
    displayState,
  };
}

function submittedRevision(
  submissionId: string,
): NonNullable<ProductModerationStatusDetail["submittedRevision"]> {
  return {
    submissionId,
    snapshotSchemaVersion: 1,
    snapshot: {
      schemaVersion: 1,
      productId,
      sellerId: uuid(10),
      productCode: null,
      productCodeInput: null,
      title: "Submitted shirt",
      titleSource: "human",
      categoryId: null,
      audiences: ["women"],
      descriptions: [],
      facts: null,
      minimumOrder: null,
      packSize: null,
      price: null,
      currency: "EUR",
      stock: "in_stock",
      imageIds: [],
      coverImageId: null,
    },
    images: [],
  };
}

function privateSnapshot() {
  return {
    product: {
      id: productId,
      moderation_revision: 3,
      moderation_editable: true,
      title: "Private shirt",
      product_code: null,
      title_source: "human",
      description: null,
      audiences: ["women"],
      category_id: null,
      moq: null,
      pack_size: null,
      price: null,
      currency: "EUR",
      stock: "in_stock",
      cover_image_url: null,
      trending: false,
      status: "draft",
    },
    gallery: null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
