import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  AdminProductDraftIndexItem,
  AdminProductDraftIndexPage,
  AdminProductDraftIndexRequest,
} from "../admin-product-draft-index.types";
import {
  AdminProductDraftIndexScreenView,
  type AdminProductDraftIndexClient,
} from "./admin-product-draft-index-screen";
import { buildAdminProductDraftReviewHref } from "../admin-product-draft-index.navigation";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => <a href={to}>{children}</a>,
}));

const request: AdminProductDraftIndexRequest = {
  limit: 25,
  cursor: null,
  status: null,
  sellerId: null,
};

describe("AdminProductDraftIndexScreenView", () => {
  it("renders durable context, blank-title fallback, signed preview, and exact return link", async () => {
    const draft = item({
      title: "",
      source: {
        classifierOrganizationId: uuid(700),
        classifierBatchId: uuid(701),
        classifierGroupId: uuid(702),
      },
    });
    renderScreen(client(page([draft])));

    expect(await screen.findByText("Untitled product")).toBeVisible();
    expect(screen.getByText("Seller One (seller-one)")).toBeVisible();
    expect(screen.getByText("Trousers (trousers)")).toBeVisible();
    expect(screen.getByText("4")).toBeVisible();
    expect(screen.getByText(uuid(701))).toBeVisible();
    expect(screen.getByRole("img", { name: "Untitled product preview" })).toHaveAttribute(
      "src",
      draft.preview.url,
    );
    expect(screen.getByRole("link", { name: "Review draft" })).toHaveAttribute(
      "href",
      buildAdminProductDraftReviewHref(draft.productDraftId, request, "EN"),
    );
  });

  it("shows deterministic placeholders without attempting browser fallback images", async () => {
    renderScreen(
      client(
        page([
          item({
            productDraftId: uuid(2),
            previewImageId: uuid(102),
            preview: preview("pending"),
          }),
          item({
            productDraftId: uuid(3),
            previewImageId: uuid(103),
            preview: preview("failed"),
          }),
          item({
            productDraftId: uuid(4),
            previewImageId: null,
            preview: preview("missing"),
          }),
          item({
            productDraftId: uuid(5),
            previewImageId: uuid(105),
            preview: preview("unavailable", "private_object_missing"),
          }),
        ]),
      ),
    );

    expect(await screen.findByText("Preview pending")).toBeVisible();
    expect(screen.getByText("Preview failed")).toBeVisible();
    expect(screen.getByText("No preview")).toBeVisible();
    expect(screen.getByText("Preview unavailable")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("validates filters and resets the cursor when valid filters change", async () => {
    const onRequestChange = vi.fn();
    renderScreen(client(page()), {
      request: { ...request, cursor: "current-page" },
      onRequestChange,
    });
    await screen.findByText("No ProductDrafts");

    await userEvent.clear(screen.getByRole("spinbutton", { name: "Items per page" }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "Items per page" }), "101");
    await userEvent.type(screen.getByRole("textbox", { name: "Seller ID (exact)" }), "bad-id");
    await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText(/Enter a page size/)).toBeVisible();
    expect(onRequestChange).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByRole("spinbutton", { name: "Items per page" }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "Items per page" }), "50");
    await userEvent.clear(screen.getByRole("textbox", { name: "Seller ID (exact)" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Seller ID (exact)" }), uuid(10));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "draft");
    await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(onRequestChange).toHaveBeenCalledWith({
      limit: 50,
      cursor: null,
      status: "draft",
      sellerId: uuid(10),
    });
  });

  it("persists the next cursor and can reset to the first page", async () => {
    const onRequestChange = vi.fn();
    renderScreen(client(page([item()], "next-page")), {
      request: { ...request, cursor: "current-page" },
      onRequestChange,
    });

    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(onRequestChange).toHaveBeenCalledWith({ ...request, cursor: "next-page" });

    await userEvent.click(screen.getByRole("button", { name: "First page" }));
    expect(onRequestChange).toHaveBeenCalledWith({ ...request, cursor: null });
  });

  it("coalesces simultaneous image failures and stops after a replacement fails", async () => {
    let resolveRefresh!: (value: AdminProductDraftIndexPage) => void;
    const first = item({ productDraftId: uuid(1), previewImageId: uuid(101) });
    const second = item({ productDraftId: uuid(2), previewImageId: uuid(102) });
    const replacementFirst = item({
      productDraftId: first.productDraftId,
      previewImageId: first.previewImageId,
      preview: {
        ...first.preview,
        url: "https://signed.test/replacement-101",
        expiresAt: "2999-01-01T00:05:00.000Z",
      },
    });
    const replacementSecond = item({
      productDraftId: second.productDraftId,
      previewImageId: second.previewImageId,
      preview: {
        ...second.preview,
        url: "https://signed.test/replacement-102",
        expiresAt: "2999-01-01T00:05:00.000Z",
      },
    });
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([first, second]))
      .mockReturnValueOnce(
        new Promise<AdminProductDraftIndexPage>((resolve) => {
          resolveRefresh = resolve;
        }),
      );
    renderScreen({ list });

    const initialImages = await screen.findAllByRole("img");
    fireEvent.error(initialImages[0]!);
    fireEvent.error(initialImages[1]!);
    expect(list).toHaveBeenCalledTimes(2);

    resolveRefresh(page([replacementFirst, replacementSecond]));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Draft 1 preview" })).toHaveAttribute(
        "src",
        "https://signed.test/replacement-101",
      ),
    );

    fireEvent.error(screen.getByRole("img", { name: "Draft 1 preview" }));
    expect(await screen.findByText("Preview unavailable")).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
  });
});

function renderScreen(
  indexClient: AdminProductDraftIndexClient,
  overrides: Partial<{
    request: AdminProductDraftIndexRequest;
    onRequestChange: (request: AdminProductDraftIndexRequest) => void;
  }> = {},
) {
  return render(
    <AdminProductDraftIndexScreenView
      request={overrides.request ?? request}
      onRequestChange={overrides.onRequestChange ?? vi.fn()}
      client={indexClient}
    />,
  );
}

function client(result: AdminProductDraftIndexPage): AdminProductDraftIndexClient {
  return { list: vi.fn().mockResolvedValue(result) };
}

function page(
  items: AdminProductDraftIndexItem[] = [],
  nextCursor: string | null = null,
): AdminProductDraftIndexPage {
  return { items, nextCursor };
}

function item(overrides: Partial<AdminProductDraftIndexItem> = {}): AdminProductDraftIndexItem {
  const productDraftId = overrides.productDraftId ?? uuid(1);
  const previewImageId =
    overrides.previewImageId === undefined
      ? uuid(Number(productDraftId.slice(-3)) + 100)
      : overrides.previewImageId;
  return {
    productDraftId,
    title: `Draft ${Number(productDraftId.slice(-3))}`,
    status: "draft",
    seller: { id: uuid(10), name: "Seller One", slug: "seller-one" },
    category: { id: uuid(20), name: "Trousers", slug: "trousers" },
    factsRevision: 4,
    source: null,
    coverImageId: previewImageId,
    previewImageId,
    preview: preview("available"),
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T13:00:00.000Z",
    ...overrides,
  };
}

function preview(
  deliveryStatus: AdminProductDraftIndexItem["preview"]["deliveryStatus"],
  deliveryErrorCode: AdminProductDraftIndexItem["preview"]["deliveryErrorCode"] = null,
): AdminProductDraftIndexItem["preview"] {
  return {
    deliveryStatus,
    deliveryErrorCode,
    url: deliveryStatus === "available" ? "https://signed.test/preview" : null,
    expiresAt: deliveryStatus === "available" ? "2999-01-01T00:05:00.000Z" : null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
