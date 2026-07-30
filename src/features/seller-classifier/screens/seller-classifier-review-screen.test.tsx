import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SellerClassifierReviewGroup,
  SellerClassifierReviewSnapshot,
} from "../seller-classifier-review.types";
import type { SellerClassifierDraftImportSnapshot } from "../seller-classifier-import.types";
import {
  SellerClassifierReviewScreenView,
  type SellerClassifierReviewClient,
} from "./seller-classifier-review-screen";

describe("SellerClassifierReviewScreenView", () => {
  beforeEach(() => {
    let objectUrlId = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => `blob:review-${++objectUrlId}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("loads the seller workbench, authenticated thumbnails, and leaf-only taxonomy", async () => {
    const api = reviewClient();
    const thumbnails = thumbnailDependencies();

    renderReview(api, thumbnails);

    expect(await screen.findByRole("heading", { name: "Review product groups" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Group 1" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Group 2" })).toBeVisible();
    for (const option of screen.getAllByRole("option", { name: "Apparel" })) {
      expect(option).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Approve and create drafts" })).toBeDisabled();
    expect(screen.queryByText(/administrator/i)).not.toBeInTheDocument();

    expect((await screen.findByRole("img", { name: "front.jpg" })).getAttribute("src")).toMatch(
      /^blob:review-/,
    );
    expect(thumbnails.fetch).toHaveBeenCalledWith(
      `/v1/seller/classifier-batches/${workflowId}/images/${frontImageId}/thumbnail`,
      expect.objectContaining({
        headers: {
          Accept: "image/jpeg",
          Authorization: "Bearer seller-access-token",
        },
      }),
    );
  });

  it("serializes grouping mutations and resets transient selections after success", async () => {
    const api = reviewClient();
    let resolveCreate!: (value: SellerClassifierReviewSnapshot) => void;
    api.createGroup.mockImplementation(
      () =>
        new Promise<SellerClassifierReviewSnapshot>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = userEvent.setup();
    renderReview(api);

    await user.click(await screen.findByRole("checkbox", { name: "Select image: front.jpg" }));
    await user.click(screen.getByRole("checkbox", { name: "Select image: shoe.jpg" }));
    await user.click(screen.getByRole("button", { name: "Create group" }));

    expect(api.createGroup).toHaveBeenCalledWith({
      workflowId,
      imageIds: [frontImageId, shoeImageId],
    });
    expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "Approve group" })) {
      expect(button).toBeDisabled();
    }

    resolveCreate(reviewSnapshot());
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Select image: front.jpg" })).not.toBeChecked(),
    );

    await user.selectOptions(screen.getByLabelText("Target group"), groupOneId);
    await user.click(screen.getByRole("checkbox", { name: "Group 2" }));
    await user.click(screen.getByRole("button", { name: "Merge" }));
    expect(api.mergeGroups).toHaveBeenCalledWith({
      workflowId,
      targetGroupId: groupOneId,
      sourceGroupIds: [groupTwoId],
    });

    await user.click(screen.getByRole("checkbox", { name: "Select image: front.jpg" }));
    await user.click(enabledButton("Split into new group"));
    expect(api.splitGroup).toHaveBeenCalledWith({
      workflowId,
      groupId: groupOneId,
      imageIds: [frontImageId],
    });

    await user.selectOptions(screen.getByLabelText("Move to group: back.jpg"), groupTwoId);
    await user.click(screen.getByRole("button", { name: "Move image: back.jpg" }));
    expect(api.moveImage).toHaveBeenCalledWith({
      workflowId,
      targetGroupId: groupTwoId,
      imageId: backImageId,
    });
  });

  it("supports category, duplicate, cover, rejection, restoration, and group approval", async () => {
    const api = reviewClient();
    api.rejectImage.mockResolvedValue(rejectedSnapshot());
    const user = userEvent.setup();
    renderReview(api);

    await screen.findByRole("heading", { name: "Group 1" });
    await user.selectOptions(
      within(reviewGroup(2)).getByLabelText("Approved category"),
      "t-shirts",
    );
    await user.click(within(reviewGroup(2)).getByRole("button", { name: "Save category" }));
    expect(api.selectCategory).toHaveBeenCalledWith({
      workflowId,
      groupId: groupTwoId,
      categorySlug: "t-shirts",
    });

    await user.selectOptions(screen.getByLabelText("Duplicate of: back.jpg"), frontImageId);
    await user.click(screen.getByRole("button", { name: "Mark duplicate: back.jpg" }));
    expect(api.setDuplicate).toHaveBeenCalledWith({
      workflowId,
      groupId: groupOneId,
      imageId: backImageId,
      duplicateOfImageId: frontImageId,
    });

    await user.click(screen.getByRole("button", { name: "Clear duplicate: detail.jpg" }));
    expect(api.setDuplicate).toHaveBeenLastCalledWith({
      workflowId,
      groupId: groupOneId,
      imageId: detailImageId,
      duplicateOfImageId: null,
    });

    await user.click(screen.getByRole("button", { name: "Set as cover: back.jpg" }));
    expect(api.selectCover).toHaveBeenCalledWith({
      workflowId,
      groupId: groupOneId,
      imageId: backImageId,
    });

    await user.click(screen.getByRole("button", { name: "Exclude image: back.jpg" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("back.jpg");
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Exclude image" }),
    );
    expect(api.rejectImage).toHaveBeenCalledWith({
      workflowId,
      groupId: groupOneId,
      imageId: backImageId,
    });

    await user.click(await screen.findByRole("button", { name: "Restore image: back.jpg" }));
    expect(api.restoreImage).toHaveBeenCalledWith({
      workflowId,
      groupId: groupOneId,
      imageId: backImageId,
    });

    await user.click(within(reviewGroup(1)).getByRole("button", { name: "Approve group" }));
    expect(api.approveGroup).toHaveBeenCalledWith({
      workflowId,
      groupId: groupOneId,
    });
  });

  it("preserves selections on validation failure and recovers a stale resource once", async () => {
    const api = reviewClient();
    const validationError = codedError(
      "seller_classifier_review_invalid",
      "Choose a different set of images.",
    );
    api.createGroup.mockRejectedValueOnce(validationError);
    api.selectCover.mockRejectedValueOnce(
      codedError("seller_classifier_review_resource_not_found"),
    );
    api.getReview.mockResolvedValueOnce(reviewSnapshot()).mockResolvedValueOnce(approvedSnapshot());
    const user = userEvent.setup();
    renderReview(api);

    const selection = await screen.findByRole("checkbox", { name: "Select image: front.jpg" });
    await user.click(selection);
    await user.click(screen.getByRole("button", { name: "Create group" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a different set of images.");
    expect(selection).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Set as cover: back.jpg" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The review changed elsewhere. The latest version has been loaded.",
    );
    expect(api.getReview).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("checkbox", { name: "Select image: front.jpg" }),
    ).not.toBeInTheDocument();
  });

  it("keeps approved groups read-only and enables the batch approval action", async () => {
    const api = reviewClient({ snapshot: approvedSnapshot() });
    const thumbnails = thumbnailDependencies(
      vi.fn(async () =>
        Response.json(
          { error: { code: "seller_classifier_thumbnail_not_found" } },
          { status: 404 },
        ),
      ),
    );
    renderReview(api, thumbnails);

    expect((await screen.findAllByText("Image unavailable")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox", { name: /Select image/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve group" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Set as cover: back.jpg" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve and create drafts" })).toBeEnabled();
    expect(screen.getByText(/All groups are approved/)).toBeVisible();
  });

  it("serializes batch approval and navigates after an accepted import snapshot", async () => {
    const api = reviewClient({ snapshot: approvedSnapshot() });
    const onImportAccepted = vi.fn();
    let resolveApproval!: (value: SellerClassifierDraftImportSnapshot) => void;
    api.approveAndCreate.mockImplementation(
      () =>
        new Promise<SellerClassifierDraftImportSnapshot>((resolve) => {
          resolveApproval = resolve;
        }),
    );
    const user = userEvent.setup();
    renderReview(api, thumbnailDependencies(), { onImportAccepted });

    const action = await screen.findByRole("button", { name: "Approve and create drafts" });
    await user.click(action);
    await user.click(action);

    expect(api.approveAndCreate).toHaveBeenCalledTimes(1);
    expect(api.approveAndCreate).toHaveBeenCalledWith({ workflowId });
    expect(action).toBeDisabled();

    resolveApproval(draftImportSnapshot());
    await waitFor(() => expect(onImportAccepted).toHaveBeenCalledTimes(1));
  });

  it("reloads a stale review in place when batch approval is no longer allowed", async () => {
    const api = reviewClient({ snapshot: approvedSnapshot() });
    api.approveAndCreate.mockRejectedValueOnce(codedError("seller_classifier_groups_not_approved"));
    api.getReview.mockResolvedValueOnce(approvedSnapshot()).mockResolvedValueOnce(reviewSnapshot());
    const user = userEvent.setup();
    renderReview(api);

    await user.click(await screen.findByRole("button", { name: "Approve and create drafts" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The review changed before draft creation.",
    );
    expect(api.getReview).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Approve and create drafts" })).toBeDisabled();
  });

  it("retries only failed thumbnails after a complete snapshot replacement", async () => {
    const attempts = new Map<string, number>();
    const fetchThumbnail = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const count = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, count);
      if (url.includes(frontImageId) && count === 1) {
        return Response.json({ error: { code: "not_ready" } }, { status: 404 });
      }
      return jpegResponse();
    });
    const api = reviewClient();
    const user = userEvent.setup();
    renderReview(api, thumbnailDependencies(fetchThumbnail));

    expect((await screen.findAllByText("Image unavailable")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Set as cover: back.jpg" }));
    expect(await screen.findByRole("img", { name: "front.jpg" })).toBeVisible();

    const frontUrl = `/v1/seller/classifier-batches/${workflowId}/images/${frontImageId}/thumbnail`;
    expect(attempts.get(frontUrl)).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(attempts.get(frontUrl)).toBe(2);
  });
});

function renderReview(
  client: ReturnType<typeof reviewClient>,
  thumbnails = thumbnailDependencies(),
  options: {
    initialNotice?: "groups-not-approved";
    onImportAccepted?: () => void;
  } = {},
) {
  return render(
    <SellerClassifierReviewScreenView
      workflowId={workflowId}
      client={client}
      thumbnailDependencies={thumbnails}
      initialNotice={options.initialNotice}
      onImportAccepted={options.onImportAccepted}
    />,
  );
}

function reviewClient({
  snapshot = reviewSnapshot(),
}: {
  snapshot?: SellerClassifierReviewSnapshot;
} = {}) {
  return {
    getReview: vi.fn(async () => snapshot),
    listCategories: vi.fn(async () => categories),
    createGroup: vi.fn(async () => snapshot),
    mergeGroups: vi.fn(async () => snapshot),
    splitGroup: vi.fn(async () => snapshot),
    moveImage: vi.fn(async () => snapshot),
    setDuplicate: vi.fn(async () => snapshot),
    selectCover: vi.fn(async () => snapshot),
    selectCategory: vi.fn(async () => snapshot),
    rejectImage: vi.fn(async () => snapshot),
    restoreImage: vi.fn(async () => snapshot),
    approveGroup: vi.fn(async () => snapshot),
    approveAndCreate: vi.fn(async () => draftImportSnapshot()),
  } satisfies SellerClassifierReviewClient;
}

function thumbnailDependencies(fetchImplementation = vi.fn(async () => jpegResponse())) {
  return {
    getAccessToken: vi.fn(async () => "seller-access-token"),
    fetch: fetchImplementation as typeof fetch,
  };
}

function jpegResponse(): Response {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
}

function reviewSnapshot(): SellerClassifierReviewSnapshot {
  return {
    workflowId,
    stage: "review",
    pipelineVersion: "product-classifier-v1",
    groups: [
      group({
        groupId: groupOneId,
        approvedCategorySlug: "t-shirts",
        suggestedCategorySlug: "t-shirts",
        coverImageId: frontImageId,
        images: [
          image(frontImageId, "front.jpg", 0),
          image(backImageId, "back.jpg", 1),
          {
            ...image(detailImageId, "detail.jpg", 2),
            isDuplicate: true,
            duplicateOfImageId: frontImageId,
            membershipSource: "exact_duplicate",
          },
        ],
      }),
      group({
        groupId: groupTwoId,
        approvedCategorySlug: "shoes",
        suggestedCategorySlug: "shoes",
        coverImageId: shoeImageId,
        images: [
          {
            ...image(shoeImageId, "shoe.jpg", 3),
            membershipSource: "singleton",
            membershipConfidence: null,
          },
        ],
      }),
    ],
  };
}

function rejectedSnapshot(): SellerClassifierReviewSnapshot {
  const snapshot = reviewSnapshot();
  return {
    ...snapshot,
    groups: snapshot.groups.map((candidate) =>
      candidate.groupId === groupOneId
        ? {
            ...candidate,
            images: candidate.images.map((candidateImage) =>
              candidateImage.imageId === backImageId
                ? { ...candidateImage, isRejected: true }
                : candidateImage,
            ),
          }
        : candidate,
    ),
  };
}

function approvedSnapshot(): SellerClassifierReviewSnapshot {
  const snapshot = reviewSnapshot();
  return {
    ...snapshot,
    stage: "approved",
    groups: snapshot.groups.map((candidate) => ({ ...candidate, status: "approved" })),
  };
}

function draftImportSnapshot(): SellerClassifierDraftImportSnapshot {
  return {
    workflowId,
    stage: "importing",
    importStatus: "pending",
    continuationAllowed: false,
    retryAllowed: false,
    errorCode: null,
    pendingGroupCount: 2,
    processingGroupCount: 0,
    completeGroupCount: 0,
    failedGroupCount: 0,
    productDrafts: [],
  };
}

function group({
  groupId,
  approvedCategorySlug,
  suggestedCategorySlug,
  coverImageId,
  images,
}: Pick<
  SellerClassifierReviewGroup,
  "groupId" | "approvedCategorySlug" | "suggestedCategorySlug" | "coverImageId" | "images"
>): SellerClassifierReviewGroup {
  return {
    groupId,
    status: "proposed",
    confidence: 0.94,
    coverImageId,
    suggestedCategorySlug,
    approvedCategorySlug,
    categorySuggestionStatus: "ready",
    approvedCategorySource: "machine_suggestion",
    warnings: [],
    images,
  };
}

function image(imageId: string, originalFilename: string, uploadOrder: number) {
  return {
    imageId,
    originalFilename,
    uploadOrder,
    thumbnailUrl: `/v1/seller/classifier-batches/${workflowId}/images/${imageId}/thumbnail`,
    position: uploadOrder,
    isDuplicate: false,
    isRejected: false,
    duplicateOfImageId: null,
    membershipSource: "engine" as const,
    membershipConfidence: 0.94,
  };
}

function reviewGroup(number: 1 | 2): HTMLElement {
  const heading = screen.getByRole("heading", { name: `Group ${number}` });
  const container = heading.closest("[data-review-group]");
  if (!(container instanceof HTMLElement)) throw new Error("Review group card not found.");
  return container;
}

function enabledButton(name: string): HTMLElement {
  const button = screen
    .getAllByRole("button", { name })
    .find((candidate) => !candidate.hasAttribute("disabled"));
  if (!(button instanceof HTMLElement)) throw new Error(`Enabled button not found: ${name}`);
  return button;
}

function codedError(code: string, message = "Review request failed."): Error {
  return Object.assign(new Error(message), { code });
}

const categories = [
  { slug: "apparel", name: "Apparel", parentSlug: null, selectableLeaf: false },
  {
    slug: "t-shirts",
    name: "T-shirts",
    parentSlug: "apparel",
    selectableLeaf: true,
  },
  { slug: "footwear", name: "Footwear", parentSlug: null, selectableLeaf: false },
  { slug: "shoes", name: "Shoes", parentSlug: "footwear", selectableLeaf: true },
];

const workflowId = uuid(1);
const groupOneId = uuid(2);
const groupTwoId = uuid(3);
const frontImageId = uuid(4);
const backImageId = uuid(5);
const detailImageId = uuid(6);
const shoeImageId = uuid(7);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
