import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  finalize: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  retryCleanup: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("../product-draft-image-lifecycle.functions", () => ({
  prepareMyProductDraftImageUploads: mocks.prepare,
  finalizeMyProductDraftImageUploads: mocks.finalize,
  updateMyProductDraftImageGallery: mocks.update,
  removeMyProductDraftImage: mocks.remove,
  retryMyProductDraftImageCleanup: mocks.retryCleanup,
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({ uploadToSignedUrl: mocks.uploadToSignedUrl }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

import type { SellerProductDraftGallery } from "../product-draft-image-gallery.types";
import { ProductDraftImageGallery } from "./product-draft-image-gallery";

const firstImageId = uuid(101);
const secondImageId = uuid(102);

describe("ProductDraftImageGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ productDraftId: uuid(1), galleryRevision: 2 });
    mocks.remove.mockResolvedValue({ productDraftId: uuid(1), galleryRevision: 2 });
    mocks.retryCleanup.mockResolvedValue({ productDraftId: uuid(1), galleryRevision: 2 });
    mocks.uploadToSignedUrl.mockResolvedValue({ data: { path: "ok" }, error: null });
  });

  it("renders ordered images, placeholders, source-cover metadata, and an accessible dialog", async () => {
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([
          availableImage(firstImageId, 0, true),
          {
            imageId: secondImageId,
            sourcePosition: 1,
            durableStatus: "pending",
            sourceKind: "classifier_import",
            clientUploadId: null,
            originalFilename: null,
            contentType: "image/jpeg",
            sizeBytes: 100,
            lifecycleErrorCode: null,
            recoveryAction: null,
            canRemove: false,
            deliveryStatus: "pending",
            deliveryErrorCode: null,
            url: null,
            expiresAt: null,
            isSourceCover: false,
          },
        ])}
        productTitle="Cotton shirt"
        refresh={vi.fn()}
      />,
    );

    expect(screen.getByText("Source cover")).toBeInTheDocument();
    expect(screen.getByText("Image pending")).toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: "Enlarge image: Cotton shirt, Position 1",
    });
    await userEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cotton shirt, Position 1" })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("coalesces simultaneous image failures and does not loop when a replacement also fails", async () => {
    let resolveRefresh!: (value: SellerProductDraftGallery) => void;
    const refresh = vi.fn(
      () =>
        new Promise<SellerProductDraftGallery>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([
          availableImage(firstImageId, 0, true),
          availableImage(secondImageId, 1, false),
        ])}
        productTitle="Cotton shirt"
        refresh={refresh}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Cotton shirt, Position 1" }));
    fireEvent.error(screen.getByRole("img", { name: "Cotton shirt, Position 2" }));
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh(
      gallery([
        availableImage(firstImageId, 0, true, "replacement-1"),
        availableImage(secondImageId, 1, false, "replacement-2"),
      ]),
    );
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Cotton shirt, Position 1" })).toHaveAttribute(
        "src",
        "https://signed.test/replacement-1",
      ),
    );

    fireEvent.error(screen.getByRole("img", { name: "Cotton shirt, Position 1" }));
    await waitFor(() => expect(screen.getByText("Image unavailable")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("retains the last gallery and offers a retry when refreshing fails", async () => {
    const refresh = vi
      .fn<() => Promise<SellerProductDraftGallery>>()
      .mockRejectedValueOnce(new Error("signing unavailable"))
      .mockResolvedValueOnce(gallery([availableImage(firstImageId, 0, true, "manual-retry")]));
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([availableImage(firstImageId, 0, true)])}
        productTitle="Cotton shirt"
        refresh={refresh}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Cotton shirt, Position 1" }));

    expect(
      await screen.findByText("One or more image links could not be refreshed."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Cotton shirt, Position 1" })).toHaveAttribute(
        "src",
        "https://signed.test/manual-retry",
      ),
    );
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("uploads multiple files and finalizes every prepared image after partial upload failure", async () => {
    mocks.prepare.mockImplementation(async ({ data }) => ({
      productDraftId: data.productDraftId,
      galleryRevision: 1,
      images: data.files.map((file: { clientUploadId: string }, index: number) => ({
        imageId: index === 0 ? firstImageId : secondImageId,
        clientUploadId: file.clientUploadId,
        originalFilename: index === 0 ? "front.jpg" : "back.jpg",
        contentType: "image/jpeg",
        sizeBytes: 3,
        durableStatus: "pending",
        uploadPath: `private/${index}.jpg`,
        uploadToken: `token-${index}`,
        uploadExpiresAt: "2099-01-01T00:00:00.000Z",
      })),
    }));
    mocks.uploadToSignedUrl.mockImplementation(async (path: string) =>
      path.endsWith("/1.jpg")
        ? { data: null, error: new Error("upload failed") }
        : { data: { path }, error: null },
    );
    mocks.finalize.mockResolvedValue({
      productDraftId: uuid(1),
      galleryRevision: 2,
      images: [
        { imageId: firstImageId, durableStatus: "available", lifecycleErrorCode: null },
        {
          imageId: secondImageId,
          durableStatus: "failed",
          lifecycleErrorCode: "product_draft_image_object_missing",
        },
      ],
    });
    const refresh = vi.fn(async () => gallery([]));
    const view = render(
      <ProductDraftImageGallery
        initialGallery={gallery([])}
        productTitle="Cotton shirt"
        refresh={refresh}
        productDraftId={uuid(1)}
        imageSourceMode="seller_upload"
        productStatus="draft"
      />,
    );
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
    const front = new File([new Uint8Array([0xff, 0xd8, 0xff])], "front.jpg", {
      type: "image/jpeg",
    });
    const back = new File([new Uint8Array([0xff, 0xd8, 0xff])], "back.jpg", {
      type: "image/jpeg",
    });

    fireEvent.change(input, { target: { files: [front, back] } });

    await waitFor(() => expect(mocks.finalize).toHaveBeenCalledTimes(1));
    expect(mocks.finalize.mock.calls[0]?.[0].data.imageIds).toEqual([firstImageId, secondImageId]);
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Completed")).toBeVisible();
    expect(screen.getByText("Failed")).toBeVisible();
    expect(refresh).toHaveBeenCalled();
  });

  it("uses the cleanup-only operation for a failed upload cleanup", async () => {
    const cleanupImage = {
      ...availableImage(firstImageId, 0, false),
      durableStatus: "failed" as const,
      sourceKind: "seller_upload" as const,
      clientUploadId: uuid(500),
      originalFilename: "front.jpg",
      lifecycleErrorCode: "product_draft_image_upload_cleanup_failed",
      recoveryAction: "retry_cleanup" as const,
      canRemove: true,
      deliveryStatus: "failed" as const,
      url: null,
      expiresAt: null,
      isSourceCover: false,
    };
    const refresh = vi.fn(async () => gallery([cleanupImage]));
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([cleanupImage])}
        productTitle="Cotton shirt"
        refresh={refresh}
        productDraftId={uuid(1)}
        imageSourceMode="seller_upload"
        productStatus="draft"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry cleanup" }));

    await waitFor(() =>
      expect(mocks.retryCleanup).toHaveBeenCalledWith({
        data: { productDraftId: uuid(1), imageId: firstImageId },
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("changes the cover and submits the complete available order", async () => {
    const front = sellerAvailableImage(firstImageId, 0, true, "front.jpg");
    const back = sellerAvailableImage(secondImageId, 1, false, "back.jpg");
    const refresh = vi.fn(async () => gallery([front, back]));
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([front, back])}
        productTitle="Cotton shirt"
        refresh={refresh}
        productDraftId={uuid(1)}
        imageSourceMode="seller_upload"
        productStatus="draft"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Make cover" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith({
        data: {
          productDraftId: uuid(1),
          expectedGalleryRevision: 0,
          orderedAvailableImageIds: [firstImageId, secondImageId],
          coverImageId: secondImageId,
        },
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Move later: front.jpg" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith({
        data: {
          productDraftId: uuid(1),
          expectedGalleryRevision: 0,
          orderedAvailableImageIds: [secondImageId, firstImageId],
          coverImageId: firstImageId,
        },
      }),
    );
  });

  it("removes a direct draft image only after confirmation", async () => {
    const image = sellerAvailableImage(firstImageId, 0, true, "front.jpg");
    const refresh = vi.fn(async () => gallery([image]));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([image])}
        productTitle="Cotton shirt"
        refresh={refresh}
        productDraftId={uuid(1)}
        imageSourceMode="seller_upload"
        productStatus="draft"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove picture" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith({
        data: {
          productDraftId: uuid(1),
          imageId: firstImageId,
          expectedGalleryRevision: 0,
        },
      }),
    );
    confirm.mockRestore();
  });

  it("keeps classifier and published galleries read-only", () => {
    const image = sellerAvailableImage(firstImageId, 0, true, "front.jpg");
    const refresh = vi.fn(async () => gallery([image]));
    const classifier = render(
      <ProductDraftImageGallery
        initialGallery={gallery([image])}
        productTitle="Cotton shirt"
        refresh={refresh}
        productDraftId={uuid(1)}
        imageSourceMode="classifier_import"
        productStatus="draft"
      />,
    );

    expect(screen.queryByRole("button", { name: "Add pictures" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove picture" })).not.toBeInTheDocument();

    classifier.unmount();
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([image])}
        productTitle="Cotton shirt"
        refresh={refresh}
        productDraftId={uuid(1)}
        imageSourceMode="seller_upload"
        productStatus="published"
      />,
    );

    expect(screen.queryByRole("button", { name: "Add pictures" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove picture" })).not.toBeInTheDocument();
  });

  it("refreshes a stale gallery and asks the seller to repeat the action", async () => {
    const front = sellerAvailableImage(firstImageId, 0, true, "front.jpg");
    const back = sellerAvailableImage(secondImageId, 1, false, "back.jpg");
    mocks.update.mockRejectedValueOnce({ code: "product_draft_image_gallery_stale" });
    const refresh = vi.fn(async () => gallery([front, back]));
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([front, back])}
        productTitle="Cotton shirt"
        refresh={refresh}
        productDraftId={uuid(1)}
        imageSourceMode="seller_upload"
        productStatus="draft"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Make cover" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(mocks.toastError).toHaveBeenCalledWith(
      "The gallery changed. It was refreshed; repeat the action.",
    );
  });
});

function gallery(images: SellerProductDraftGallery["images"]): SellerProductDraftGallery {
  return {
    status: "available",
    errorCode: null,
    galleryRevision: 0,
    images,
  };
}

function availableImage(
  imageId: string,
  sourcePosition: number,
  isSourceCover: boolean,
  urlSuffix = imageId,
): SellerProductDraftGallery["images"][number] {
  return {
    imageId,
    sourcePosition,
    durableStatus: "available",
    sourceKind: "classifier_import",
    clientUploadId: null,
    originalFilename: null,
    contentType: "image/jpeg",
    sizeBytes: 100,
    lifecycleErrorCode: null,
    recoveryAction: null,
    canRemove: false,
    deliveryStatus: "available",
    deliveryErrorCode: null,
    url: `https://signed.test/${urlSuffix}`,
    expiresAt: "2099-07-26T12:05:00.000Z",
    isSourceCover,
  };
}

function sellerAvailableImage(
  imageId: string,
  sourcePosition: number,
  isSourceCover: boolean,
  originalFilename: string,
): SellerProductDraftGallery["images"][number] {
  return {
    ...availableImage(imageId, sourcePosition, isSourceCover),
    sourceKind: "seller_upload",
    clientUploadId: uuid(500 + sourcePosition),
    originalFilename,
    canRemove: true,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
