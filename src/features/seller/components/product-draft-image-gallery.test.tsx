import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SellerProductDraftGallery } from "../product-draft-image-gallery.types";
import { ProductDraftImageGallery } from "./product-draft-image-gallery";

const firstImageId = uuid(101);
const secondImageId = uuid(102);

describe("ProductDraftImageGallery", () => {
  it("renders ordered images, placeholders, source-cover metadata, and an accessible dialog", async () => {
    render(
      <ProductDraftImageGallery
        initialGallery={gallery([
          availableImage(firstImageId, 0, true),
          {
            imageId: secondImageId,
            sourcePosition: 1,
            durableStatus: "pending",
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
});

function gallery(images: SellerProductDraftGallery["images"]): SellerProductDraftGallery {
  return {
    status: "available",
    errorCode: null,
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
    deliveryStatus: "available",
    deliveryErrorCode: null,
    url: `https://signed.test/${urlSuffix}`,
    expiresAt: "2099-07-26T12:05:00.000Z",
    isSourceCover,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
