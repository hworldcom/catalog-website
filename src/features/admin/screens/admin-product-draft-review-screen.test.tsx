import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { mergeReviewGallery } from "../admin-product-draft-review.gallery";
import type { AdminProductDraftReview } from "../admin-product-draft-review.types";
import {
  AdminProductDraftReviewScreenView,
  type AdminProductDraftReviewClient,
} from "./admin-product-draft-review-screen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

describe("AdminProductDraftReviewScreenView", () => {
  it("renders durable context, private images, placeholders, and the facts boundary", async () => {
    renderScreen(client(review()));

    expect(await screen.findByText("Untitled product")).toBeVisible();
    expect(screen.getByText("Seller (seller)")).toBeVisible();
    expect(screen.getByText("Trousers (trousers)")).toBeVisible();
    expect(screen.getByText(uuid(701))).toBeVisible();
    expect(screen.getByText("Product code")).toBeVisible();
    expect(screen.getByText("SEL-F-TSH-ABCDEFGH")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to ProductDrafts" })).toHaveAttribute(
      "href",
      "/admin/product-drafts?limit=25&lang=EN",
    );
    expect(screen.getByRole("img", { name: /Position 1/ })).toHaveAttribute(
      "src",
      "https://signed.test/101",
    );
    expect(screen.getByText("Image pending")).toBeVisible();
    expect(screen.getByText("Image failed")).toBeVisible();
    expect(screen.getByText("Image missing")).toBeVisible();
    expect(screen.getByText("Image unavailable")).toBeVisible();
    expect(screen.getByLabelText("Title probe")).toBeVisible();
    expect(screen.getByLabelText("Facts probe")).toBeVisible();
    expect(screen.getByText(/Description review will use this section/)).toBeVisible();
  });

  it("opens an accessible enlarged image and restores focus after Escape", async () => {
    renderScreen(client(review({ images: [image(101, "available")] })));
    const trigger = await screen.findByRole("button", { name: /Enlarge image.*Position 1/ });

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("img", { name: /Enlarge image/ })).toHaveAttribute(
      "src",
      "https://signed.test/101",
    );

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("coalesces failed image loads and preserves unsaved facts during gallery refresh", async () => {
    const nextReview = review({
      images: [
        image(101, "available", { url: "https://signed.test/replacement-101" }),
        image(102, "available", { url: "https://signed.test/replacement-102" }),
      ],
    });
    const refresh = deferred<AdminProductDraftReview>();
    const get = vi
      .fn<AdminProductDraftReviewClient["get"]>()
      .mockResolvedValueOnce(review({ images: [image(101, "available"), image(102, "available")] }))
      .mockReturnValueOnce(refresh.promise);
    renderScreen({ get });

    const facts = await screen.findByLabelText("Facts probe");
    await userEvent.type(facts, "unsaved");
    const initialImages = screen.getAllByRole("img");
    fireEvent.error(initialImages[0]!);
    fireEvent.error(initialImages[1]!);
    expect(get).toHaveBeenCalledTimes(2);

    refresh.resolve(nextReview);
    await waitFor(() =>
      expect(screen.getByRole("img", { name: /Position 1/ })).toHaveAttribute(
        "src",
        "https://signed.test/replacement-101",
      ),
    );
    expect(facts).toHaveValue("unsaved");

    fireEvent.error(screen.getByRole("img", { name: /Position 1/ }));
    expect(get).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Image unavailable")).toBeVisible();
    expect(facts).toHaveValue("unsaved");
  });

  it("keeps immutable context while merging replacement gallery fields", () => {
    const current = review();
    const replacement = review({
      title: "Changed elsewhere",
      seller: { id: uuid(11), name: "Other", slug: "other" },
      coverImageId: uuid(102),
      previewImageId: uuid(102),
      images: [image(102, "available")],
    });

    expect(mergeReviewGallery(current, replacement)).toMatchObject({
      title: current.title,
      seller: current.seller,
      coverImageId: uuid(102),
      previewImageId: uuid(102),
      images: replacement.images,
    });
  });
});

function renderScreen(client: AdminProductDraftReviewClient) {
  return render(
    <AdminProductDraftReviewScreenView
      productDraftId={uuid(1)}
      backHref="/admin/product-drafts?limit=25&lang=EN"
      client={client}
      titleEditor={<TitleProbe />}
      factsEditor={<FactsProbe />}
    />,
  );
}

function TitleProbe() {
  return <input aria-label="Title probe" />;
}

function FactsProbe() {
  const [value, setValue] = useState("");
  return (
    <label>
      Facts probe
      <input
        aria-label="Facts probe"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

function client(result: AdminProductDraftReview): AdminProductDraftReviewClient {
  return { get: vi.fn().mockResolvedValue(result) };
}

function review(overrides: Partial<AdminProductDraftReview> = {}): AdminProductDraftReview {
  const images = overrides.images ?? [
    image(101, "available"),
    image(102, "pending"),
    image(103, "failed"),
    image(104, "missing"),
    image(105, "unavailable"),
  ];
  return {
    productDraftId: uuid(1),
    productCode: "SEL-F-TSH-ABCDEFGH",
    title: "",
    titleSource: "human",
    status: "draft",
    seller: { id: uuid(10), name: "Seller", slug: "seller" },
    category: { id: uuid(20), name: "Trousers", slug: "trousers" },
    source: {
      classifierOrganizationId: uuid(700),
      classifierBatchId: uuid(701),
      classifierGroupId: uuid(702),
    },
    coverImageId: images[0]?.imageId ?? null,
    previewImageId: images[0]?.imageId ?? null,
    previewDeliveryStatus: images[0]?.deliveryStatus ?? "missing",
    previewDeliveryErrorCode: images[0]?.deliveryErrorCode ?? null,
    images,
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T13:00:00.000Z",
    ...overrides,
  };
}

function image(
  value: number,
  deliveryStatus: AdminProductDraftReview["images"][number]["deliveryStatus"],
  overrides: Partial<AdminProductDraftReview["images"][number]> = {},
): AdminProductDraftReview["images"][number] {
  return {
    imageId: uuid(value),
    sourcePosition: value - 101,
    status:
      deliveryStatus === "pending"
        ? "pending"
        : deliveryStatus === "failed"
          ? "failed"
          : "available",
    deliveryStatus,
    deliveryErrorCode: deliveryStatus === "unavailable" ? "private_object_missing" : null,
    isCover: value === 101,
    url: deliveryStatus === "available" ? `https://signed.test/${value}` : null,
    expiresAt: deliveryStatus === "available" ? "2999-01-01T00:00:00.000Z" : null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
