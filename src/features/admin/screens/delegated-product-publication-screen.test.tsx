import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductDraftFactsEditorState } from "@/features/product-draft-facts/components/product-draft-facts-editor";
import type {
  SellerProductPublicationSnapshot,
  SellerProductPublicationStatus,
} from "@/features/seller/seller-product-publication.types";

import { DelegatedActionRequestManager } from "../delegated-action-request";
import type {
  DelegatedProductDraftSnapshot,
  DelegatedProductFields,
} from "../delegated-product-publication.types";
import {
  DelegatedProductPublicationScreenView,
  type DelegatedProductPublicationClient,
} from "./delegated-product-publication-screen";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (operation: unknown) => operation,
}));

vi.mock("../delegated-product-publication.functions", () => ({
  getDelegatedProductDraft: vi.fn(),
  saveDelegatedProductDraft: vi.fn(),
  listDelegatedProductCategories: vi.fn(),
  getDelegatedProductDraftFacts: vi.fn(),
  updateDelegatedProductDraftFacts: vi.fn(),
  getDelegatedProductDraftDescriptions: vi.fn(),
  updateDelegatedProductDraftDescriptions: vi.fn(),
  getDelegatedProductPublication: vi.fn(),
  publishDelegatedProduct: vi.fn(),
  retryDelegatedProductPublication: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string | number>;
  }) => {
    let href = to;
    for (const [key, value] of Object.entries(params ?? {})) {
      href = href.replace(`$${key}`, value);
    }
    const query = new URLSearchParams(
      Object.entries(search ?? {}).map(([key, value]) => [key, String(value)]),
    ).toString();
    return <a href={query ? `${href}?${query}` : href}>{children}</a>;
  },
}));

vi.mock("@/features/seller/components/product-draft-image-gallery", () => ({
  ProductDraftImageGallery: ({ productTitle }: { productTitle: string }) => (
    <section>Product images for {productTitle}</section>
  ),
}));

vi.mock("@/features/product-draft-facts/components/product-draft-facts-editor", () => ({
  ProductDraftFactsEditorView: ({
    onStateChange,
  }: {
    onStateChange?(state: ProductDraftFactsEditorState): void;
  }) => (
    <button type="button" onClick={() => onStateChange?.({ dirty: true, saving: false })}>
      Product facts
    </button>
  ),
}));

vi.mock(
  "@/features/product-draft-descriptions/components/product-draft-description-editor",
  () => ({
    ProductDraftDescriptionEditor: () => <section>Product descriptions</section>,
  }),
);

describe("DelegatedProductPublicationScreenView", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows immutable ownership and publishes the current complete normalized product payload", async () => {
    const publish = vi.fn().mockResolvedValue(publication("pending"));
    const testClient = client({ publish });
    const user = userEvent.setup();

    render(
      <DelegatedProductPublicationScreenView
        workflowId={workflowId}
        productDraftId={productDraftId}
        client={testClient}
        requestManager={requestManager([uuid(90)])}
      />,
    );

    expect(await screen.findByText("Kesar Textiles")).toBeVisible();
    expect(screen.getByText(`/${sellerSlug}`)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to import" })).toHaveAttribute(
      "href",
      `/admin/classifier-uploads/${workflowId}/import?lang=EN`,
    );
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();

    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Revised cotton shirt");
    await user.click(screen.getByRole("button", { name: "Publish for seller" }));
    const publicationButtons = await screen.findAllByRole("button", {
      name: "Publish for seller",
    });
    await user.click(publicationButtons.at(-1)!);

    await waitFor(() =>
      expect(publish).toHaveBeenCalledWith({
        workflowId,
        productDraftId,
        requestId: uuid(90),
        title: "Revised cotton shirt",
        categoryId,
        minimumOrderQuantity: 10,
        packSize: "12 per box",
        price: 15.5,
        currency: "EUR",
        stock: "in_stock",
        trending: false,
      }),
    );
  });

  it("resumes an uncertain publication with its stored identifier and exact old payload", async () => {
    const manager = requestManager([uuid(91)]);
    const oldPayload = fields({ title: "Stored title" });
    await expect(seedUncertainPublish(manager, oldPayload)).rejects.toMatchObject({
      code: "product_publication_unavailable",
    });
    const publish = vi.fn().mockResolvedValue(publication("pending"));

    render(
      <DelegatedProductPublicationScreenView
        workflowId={workflowId}
        productDraftId={productDraftId}
        client={client({
          get: vi.fn().mockResolvedValue(draft({ title: "Current unsaved title" })),
          publish,
        })}
        requestManager={manager}
      />,
    );

    expect(await screen.findByText("A previous publication response is uncertain")).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveValue("Current unsaved title");
    await userEvent.click(screen.getByRole("button", { name: "Resume previous publication" }));

    await waitFor(() =>
      expect(publish).toHaveBeenCalledWith({
        workflowId,
        productDraftId,
        requestId: uuid(91),
        ...oldPayload,
      }),
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Current unsaved title");
  });

  it("polls active publication without overlap and stops after a terminal snapshot", async () => {
    vi.useFakeTimers();
    let finishPoll!: (value: ReturnType<typeof publication>) => void;
    const getPublication = vi
      .fn()
      .mockResolvedValueOnce(publication("running"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPoll = resolve;
          }),
      );

    render(
      <DelegatedProductPublicationScreenView
        workflowId={workflowId}
        productDraftId={productDraftId}
        client={client({ getPublication })}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getPublication).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(getPublication).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(getPublication).toHaveBeenCalledTimes(2);

    await act(async () => {
      finishPoll(publication("failed"));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(getPublication).toHaveBeenCalledTimes(2);
  });

  it("starts an allowed publication retry with a new audited request", async () => {
    const retry = vi.fn().mockResolvedValue(publication("pending"));
    const user = userEvent.setup();
    render(
      <DelegatedProductPublicationScreenView
        workflowId={workflowId}
        productDraftId={productDraftId}
        client={client({
          getPublication: vi.fn().mockResolvedValue(publication("failed", true)),
          retry,
        })}
        requestManager={requestManager([uuid(92)])}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Retry publication" }));
    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith({
        workflowId,
        productDraftId,
        requestId: uuid(92),
      }),
    );
  });

  it("renders workflow ownership failures as terminal without a retry action", async () => {
    render(
      <DelegatedProductPublicationScreenView
        workflowId={workflowId}
        productDraftId={productDraftId}
        client={client({
          get: vi.fn().mockRejectedValue(codedError("delegated_product_draft_not_found")),
        })}
      />,
    );

    expect(
      await screen.findByText("This ProductDraft is not part of the delegated workflow."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

function client(
  overrides: Partial<DelegatedProductPublicationClient> = {},
): DelegatedProductPublicationClient {
  return {
    get: vi.fn().mockResolvedValue(draft()),
    save: vi.fn().mockResolvedValue(draft()),
    listCategories: vi.fn().mockResolvedValue({
      categories: [{ id: categoryId, slug: "t-shirts", name: "T-shirts" }],
    }),
    getFacts: vi.fn(),
    updateFacts: vi.fn(),
    getDescriptions: vi.fn(),
    updateDescriptions: vi.fn(),
    getPublication: vi.fn().mockResolvedValue(publication("not_started")),
    publish: vi.fn().mockResolvedValue(publication("pending")),
    retry: vi.fn().mockResolvedValue(publication("pending")),
    ...overrides,
  };
}

function draft(productOverrides: Partial<DelegatedProductDraftSnapshot["product"]> = {}) {
  return {
    workflowId,
    productDraftId,
    seller: {
      id: sellerId,
      name: "Kesar Textiles",
      slug: sellerSlug,
      storefrontPublished: true,
    },
    source: {
      classifierOrganizationId: uuid(4),
      classifierBatchId: uuid(5),
      classifierGroupId: uuid(6),
    },
    product: {
      status: "draft" as const,
      title: "Cotton shirt",
      titleSource: "model" as const,
      categoryId,
      minimumOrderQuantity: 10,
      packSize: "12 per box",
      price: 15.5,
      currency: "EUR",
      stock: "in_stock" as const,
      trending: false,
      coverImageId: uuid(7),
      imagePublicationMode: "imported" as const,
      editable: true,
      ...productOverrides,
    },
    gallery: {
      status: "available" as const,
      errorCode: null,
      images: [],
    },
  } satisfies DelegatedProductDraftSnapshot;
}

function fields(overrides: Partial<DelegatedProductFields> = {}): DelegatedProductFields {
  return {
    title: "Cotton shirt",
    categoryId,
    minimumOrderQuantity: 10,
    packSize: "12 per box",
    price: 15.5,
    currency: "EUR",
    stock: "in_stock",
    trending: false,
    ...overrides,
  };
}

function publication(
  publicationStatus: SellerProductPublicationStatus,
  retryAllowed = false,
): SellerProductPublicationSnapshot {
  return {
    productDraftId,
    productStatus: publicationStatus === "completed" ? ("published" as const) : ("draft" as const),
    publicationStatus,
    attemptCount: publicationStatus === "not_started" ? 0 : 1,
    failureReasonCode:
      publicationStatus === "failed" ? "product_publication_dispatch_failed" : null,
    retryAllowed,
    publicProductUrl:
      publicationStatus === "completed" ? `/products/${sellerSlug}/cotton-shirt` : null,
  };
}

function requestManager(ids: string[]) {
  const storage = new Map<string, string>();
  return new DelegatedActionRequestManager({
    createRequestId: () => ids.shift()!,
    getStorage: () => ({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    }),
  });
}

function seedUncertainPublish(
  manager: DelegatedActionRequestManager,
  payload: DelegatedProductFields,
) {
  return manager.run({
    workflowId,
    actionType: "publish_product_draft",
    target: productDraftId,
    normalizedPayload: payload,
    execute: async () => {
      throw codedError("product_publication_unavailable");
    },
  });
}

function codedError(code: string): Error {
  return Object.assign(new Error("safe"), { code });
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

const workflowId = uuid(1);
const productDraftId = uuid(2);
const sellerId = uuid(3);
const categoryId = uuid(8);
const sellerSlug = "kesar-textiles";
