import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AdministratorProductModerationDetail,
  AdministratorSellerModerationDetail,
} from "../administrator-moderation.types";
import {
  administratorProductRefreshDescriptor,
  administratorSellerRefreshDescriptor,
} from "../administrator-moderation-review.refresh";
import { shouldPollReadOnlyModeration } from "@/features/moderation/read-only-moderation-refresh";
import {
  AdministratorModerationReviewScreenView,
  type AdministratorModerationReviewClient,
} from "./administrator-moderation-review-screen";

const browserMocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: browserMocks.getSession } },
}));

const sellerId = uuid(1);
const submissionId = uuid(2);
const baselineSubmissionId = uuid(3);
const productId = uuid(4);
const imageId = uuid(5);
const categoryId = uuid(6);
const requestId = uuid(10);

describe("AdministratorModerationReviewScreenView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    browserMocks.getSession.mockReset();
  });

  it("compares seller revisions and sends a normalized seller-visible reason", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(requestId);
    const detail = sellerDetail();
    const decideSeller = vi.fn().mockResolvedValue({ detail, dispatch: null });
    renderReview("seller_update", client({ seller: detail, decideSeller }));

    expect((await screen.findAllByText("Submitted Seller")).length).toBeGreaterThan(0);
    expect(screen.getByText("Approved Seller")).toBeVisible();
    expect(screen.getByText("name")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Seller-visible reason" }),
      "  Add   a clearer logo ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(decideSeller).toHaveBeenCalledWith({
        sellerId,
        submissionId,
        expectedRevision: 2,
        decision: "request_changes",
        reason: "Add a clearer logo",
        requestId,
      }),
    );
  });

  it("loads private seller logo and cover previews with the administrator token", async () => {
    const logoAssetId = uuid(20);
    const coverAssetId = uuid(21);
    const detail = sellerDetail();
    detail.proposed = {
      snapshot: { ...detail.proposed.snapshot, logoAssetId, coverAssetId },
      assets: {
        logo: sellerAsset(logoAssetId, "logo"),
        cover: sellerAsset(coverAssetId, "cover"),
      },
    };
    browserMocks.getSession.mockResolvedValue({
      data: { session: { access_token: "administrator-access-token" } },
    });
    const fetchImage = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
    );
    vi.stubGlobal("fetch", fetchImage);
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:administrator-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReview("seller_update", client({ seller: detail }));

    await waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("img", { name: "Logo" })).toHaveAttribute(
      "src",
      "blob:administrator-preview",
    );
    expect(await screen.findByRole("img", { name: "Cover" })).toHaveAttribute(
      "src",
      "blob:administrator-preview",
    );
    for (const assetId of [logoAssetId, coverAssetId]) {
      expect(fetchImage).toHaveBeenCalledWith(
        `/v1/seller-profile-assets/${assetId}`,
        expect.objectContaining({
          headers: { Authorization: "Bearer administrator-access-token" },
          cache: "no-store",
        }),
      );
    }
  });

  it("requires a bounded seller-visible reason before rejection", async () => {
    const detail = sellerDetail();
    const decideSeller = vi.fn().mockResolvedValue({ detail, dispatch: null });
    renderReview("seller_update", client({ seller: detail, decideSeller }));

    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(screen.getByRole("textbox", { name: "Seller-visible reason" })).toHaveAttribute(
      "maxlength",
      "1000",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.getByText("Enter a reason before continuing.")).toBeVisible();
    expect(decideSeller).not.toHaveBeenCalled();
  });

  it("retains and replays the exact product action after an unknown outcome", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(requestId);
    const pending = productDetail();
    const approved = productDetail({ reviewStatus: "approved", canDecide: false });
    const decideProduct = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("offline"), { code: "moderation_unavailable" }),
      )
      .mockResolvedValueOnce({ detail: approved, dispatch: null });
    renderReview("initial_product", client({ product: pending, decideProduct }));

    await userEvent.click(
      await screen.findByRole("button", { name: "Approve and start activation" }),
    );
    expect(screen.getByText(/Cotton trousers · Seller One/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Action outcome is not confirmed")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry exact request" }));
    await waitFor(() => expect(decideProduct).toHaveBeenCalledTimes(2));
    expect(decideProduct.mock.calls[1]?.[0]).toBe(decideProduct.mock.calls[0]?.[0]);
    expect(decideProduct).toHaveBeenLastCalledWith({
      submissionId,
      expectedRevision: 2,
      decision: "approve",
      reason: null,
      requestId,
    });
  });

  it("discards an uncertain action only after reloading authoritative detail", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(requestId);
    const detail = productDetail();
    const getProduct = vi.fn().mockResolvedValue(detail);
    const decideProduct = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("offline"), { code: "moderation_unavailable" }));
    renderReview("initial_product", client({ product: detail, getProduct, decideProduct }));

    await userEvent.click(
      await screen.findByRole("button", { name: "Approve and start activation" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await userEvent.click(await screen.findByRole("button", { name: "Discard and refresh" }));

    await waitFor(() => expect(getProduct).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("button", { name: "Approve and start activation" }),
    ).toBeEnabled();
  });

  it("keeps product review usable when taxonomy and one image credential are unavailable", async () => {
    const detail = productDetail();
    const reviewClient = client({ product: detail });
    reviewClient.listCategories = vi.fn().mockResolvedValue([]);
    renderReview("initial_product", reviewClient);

    expect(await screen.findByText(categoryId)).toBeVisible();
    expect(
      screen.getByText(
        "The current category label could not be loaded. The immutable identifier is shown instead.",
      ),
    ).toBeVisible();
    const image = screen.getByRole("img");
    fireEvent.error(image);
    expect(await screen.findByText("Image unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve and start activation" })).toBeEnabled();
  });

  it("refreshes stale action conflicts and exposes only backend-authorized recovery", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(requestId);
    const initial = productDetail({ canDecide: false, canRetryActivation: true });
    const refreshed = productDetail({ canDecide: false, canRetryActivation: false });
    const getProduct = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed);
    const retryActivation = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("stale"), { code: "product_moderation_revision_conflict" }),
      );
    renderReview("initial_product", client({ product: initial, getProduct, retryActivation }));

    await userEvent.click(await screen.findByRole("button", { name: "Retry activation" }));
    expect(await screen.findByText("Request changed elsewhere")).toBeVisible();
    await waitFor(() => expect(getProduct).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Retry activation" })).not.toBeInTheDocument();
  });
});

describe("administrator moderation refresh adapters", () => {
  it.each([
    ["waiting_for_dispatch", true],
    ["publishing", true],
    ["abandonment_cleanup", true],
    ["public_cleanup", true],
    ["dispatch_failed", false],
    ["activation_failed", false],
    ["abandonment_cleanup_required", false],
    ["public_cleanup_required", false],
    ["completed", false],
    ["abandoned", false],
  ] as const)("maps administrator activation state %s to polling %s", (displayState, expected) => {
    const detail = productDetail();
    if (!detail.request.activation) throw new Error("Expected activation fixture.");
    detail.request.activation.displayState = displayState;
    expect(shouldPollReadOnlyModeration(administratorProductRefreshDescriptor(detail))).toBe(
      expected,
    );
  });

  it("does not interval-poll seller review and retains the product credential owner", () => {
    expect(shouldPollReadOnlyModeration(administratorSellerRefreshDescriptor(sellerDetail()))).toBe(
      false,
    );
    expect(administratorProductRefreshDescriptor(productDetail()).imageCredentials).toMatchObject([
      { submissionId, image: { productDraftImageId: imageId } },
    ]);
  });
});

function renderReview(
  submissionType: "seller_update" | "initial_product",
  reviewClient: AdministratorModerationReviewClient,
) {
  return render(
    <AdministratorModerationReviewScreenView
      routeState={{
        valid: true,
        submissionType,
        submissionId,
        family: submissionType === "seller_update" ? "seller" : "product",
        lang: "EN",
        backHref: "/admin/moderation?reviewStatus=pending&limit=25&lang=EN",
        returnRequest: {
          submissionType: null,
          reviewStatus: "pending",
          activationStatus: null,
          sellerId: null,
          limit: 25,
          cursor: null,
        },
        returnStateValid: true,
      }}
      client={reviewClient}
    />,
  );
}

function client(
  overrides: {
    seller?: AdministratorSellerModerationDetail;
    product?: AdministratorProductModerationDetail;
    getProduct?: AdministratorModerationReviewClient["getProduct"];
    decideSeller?: AdministratorModerationReviewClient["decideSeller"];
    decideProduct?: AdministratorModerationReviewClient["decideProduct"];
    retryActivation?: AdministratorModerationReviewClient["retryActivation"];
  } = {},
): AdministratorModerationReviewClient {
  return {
    getSeller: vi.fn().mockResolvedValue(overrides.seller ?? sellerDetail()),
    getProduct:
      overrides.getProduct ?? vi.fn().mockResolvedValue(overrides.product ?? productDetail()),
    listCategories: vi
      .fn()
      .mockResolvedValue([{ id: categoryId, slug: "trousers", name: "Trousers" }]),
    decideSeller:
      overrides.decideSeller ??
      vi.fn().mockResolvedValue({ detail: overrides.seller ?? sellerDetail(), dispatch: null }),
    decideProduct:
      overrides.decideProduct ??
      vi.fn().mockResolvedValue({ detail: overrides.product ?? productDetail(), dispatch: null }),
    retryDispatch: vi.fn().mockResolvedValue({
      detail: overrides.product ?? productDetail(),
      dispatch: null,
    }),
    retryActivation:
      overrides.retryActivation ??
      vi.fn().mockResolvedValue({ detail: overrides.product ?? productDetail(), dispatch: null }),
    retryPostSwitchCleanup: vi.fn().mockResolvedValue({
      detail: overrides.product ?? productDetail(),
      dispatch: null,
    }),
  };
}

function sellerDetail(): AdministratorSellerModerationDetail {
  return {
    kind: "seller",
    request: {
      submissionType: "seller_update",
      submissionId,
      seller: { sellerId, name: "Submitted Seller" },
      revision: 2,
      submittedAt: "2026-08-18T12:00:00.000Z",
      reviewStatus: "pending",
      sellerVisibleReason: null,
      preview: {
        kind: "none",
        deliveryStatus: "missing",
        deliveryErrorCode: null,
        url: null,
        expiresAt: null,
      },
      product: null,
      activation: null,
    },
    decision: null,
    proposed: {
      snapshot: sellerSnapshot("Submitted Seller", 2),
      assets: { logo: null, cover: null },
    },
    comparisonBaseline: {
      submissionId: baselineSubmissionId,
      revision: 1,
      snapshot: sellerSnapshot("Approved Seller", 1),
      assets: { logo: null, cover: null },
    },
    currentApprovedReference: { submissionId: baselineSubmissionId, revision: 1 },
    changedFields: ["name"],
    actions: { canDecide: true },
  };
}

function sellerSnapshot(name: string, revision: number) {
  return {
    sellerId,
    revision,
    submissionKind: "update" as const,
    name,
    slug: "submitted-seller",
    city: "Berlin",
    country: "Germany",
    whatsapp: null,
    email: "seller@example.test",
    about: "Wholesale clothing",
    logoAssetId: null,
    coverAssetId: null,
    establishedYear: 2020,
  };
}

function sellerAsset(assetId: string, kind: "logo" | "cover") {
  return {
    assetId,
    kind,
    deliveryStatus: "available" as const,
    deliveryErrorCode: null,
    url: `/v1/seller-profile-assets/${assetId}`,
  };
}

function productDetail(
  overrides: Partial<{
    reviewStatus: "pending" | "approved";
    canDecide: boolean;
    canRetryActivation: boolean;
  }> = {},
): AdministratorProductModerationDetail {
  const reviewStatus = overrides.reviewStatus ?? "pending";
  return {
    kind: "product",
    request: {
      submissionType: "initial_product",
      submissionId,
      seller: { sellerId, name: "Seller One" },
      revision: 2,
      submittedAt: "2026-08-18T12:00:00.000Z",
      reviewStatus,
      sellerVisibleReason: null,
      preview: {
        kind: "product_cover",
        deliveryStatus: "available",
        deliveryErrorCode: null,
        url: "https://signed.example.test/cover.jpg",
        expiresAt: "2099-08-18T13:00:00.000Z",
      },
      product: { productId, title: "Cotton trousers", productCode: "SEL-FTR-1234" },
      activation: {
        runId: uuid(7),
        phase: "activation",
        status: reviewStatus === "approved" ? "running" : "pending",
        dispatchStatus: "pending",
        dispatchGeneration: 1,
        dispatchErrorCode: null,
        errorCode: null,
        displayState: "waiting_for_dispatch",
      },
    },
    decision: null,
    proposed: {
      snapshotSchemaVersion: 1,
      snapshot: {
        schemaVersion: 1,
        productId,
        sellerId,
        productCode: "SEL-FTR-1234",
        productCodeInput: null,
        title: "Cotton trousers",
        titleSource: "human",
        categoryId,
        audiences: ["women"],
        descriptions: [
          {
            language: "en",
            descriptionText: "Black cotton trousers.",
            source: "human",
            factsRevision: 1,
            provider: null,
            model: null,
            pipelineVersion: null,
            generatedAt: null,
            updatedAt: "2026-08-18T11:00:00.000Z",
          },
        ],
        facts: {
          factsRevision: 1,
          facts: { colors: ["black"], materialComposition: "cotton" },
        },
        minimumOrder: 2,
        packSize: "2 pieces",
        price: 24.5,
        currency: "EUR",
        stock: "in_stock",
        imageIds: [imageId],
        coverImageId: imageId,
      },
      images: [
        {
          productDraftImageId: imageId,
          position: 0,
          isCover: true,
          deliveryStatus: "available",
          deliveryErrorCode: null,
          url: "https://signed.example.test/cover.jpg",
          expiresAt: "2099-08-18T13:00:00.000Z",
        },
      ],
    },
    comparisonBaseline: null,
    currentApprovedReference: null,
    changedFields: [],
    actions: {
      canDecide: overrides.canDecide ?? true,
      canRetryDispatch: false,
      canRetryActivation: overrides.canRetryActivation ?? false,
      canRetryPostSwitchCleanup: false,
    },
  };
}

function uuid(seed: number): string {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}
