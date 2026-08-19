import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { buildAdministratorModerationDetailHref } from "../administrator-moderation.navigation";
import type {
  AdministratorModerationPage,
  AdministratorModerationQueueItem,
  AdministratorModerationRequest,
} from "../administrator-moderation.types";
import {
  AdministratorModerationQueueScreenView,
  type AdministratorModerationQueueClient,
} from "./administrator-moderation-queue-screen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const request: AdministratorModerationRequest = {
  submissionType: null,
  reviewStatus: "pending",
  activationStatus: null,
  sellerId: null,
  limit: 25,
  cursor: null,
};

describe("AdministratorModerationQueueScreenView", () => {
  it("renders mixed seller and product rows with immutable previews and return links", async () => {
    const seller = sellerItem();
    const product = productItem();
    renderScreen(client(page([seller, product])));

    expect((await screen.findAllByText("Seller One")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("New seller").length).toBeGreaterThan(1);
    expect(screen.getByText("Cotton trousers")).toBeVisible();
    expect(screen.getByText("Publishing")).toBeVisible();
    expect(screen.getByRole("img", { name: "Seller One preview" })).toHaveAttribute(
      "src",
      seller.preview.url,
    );
    expect(screen.getAllByRole("link", { name: "Review request" })[1]).toHaveAttribute(
      "href",
      buildAdministratorModerationDetailHref(
        product.submissionType,
        product.submissionId,
        request,
        "EN",
      ),
    );
  });

  it("applies deterministic activation filter interactions and resets the cursor", async () => {
    const onRequestChange = vi.fn();
    renderScreen(client(page([sellerItem()])), {
      onRequestChange,
      request: { ...request, cursor: "current-page" },
    });
    await screen.findByText("New seller");

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Request type" }),
      "seller_update",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Activation status" }),
      "failed",
    );
    expect(screen.getByRole("combobox", { name: "Request type" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Review status" })).toHaveValue("approved");

    await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(onRequestChange).toHaveBeenCalledWith({
      submissionType: null,
      reviewStatus: "approved",
      activationStatus: "failed",
      sellerId: null,
      limit: 25,
      cursor: null,
    });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Review status" }),
      "rejected",
    );
    expect(screen.getByRole("combobox", { name: "Activation status" })).toHaveValue("");
  });

  it("renders invalid route state without issuing a protected list read", async () => {
    const list = vi.fn();
    const onRequestChange = vi.fn();
    render(
      <AdministratorModerationQueueScreenView
        routeState={{ valid: false, lang: "EN" }}
        onRequestChange={onRequestChange}
        client={{ list }}
      />,
    );

    expect(screen.getByText("Invalid moderation filters")).toBeVisible();
    expect(list).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reset to pending" }));
    expect(onRequestChange).toHaveBeenCalledWith(request);
  });

  it("keeps rows visible after an image failure and refreshes only deliberately", async () => {
    const first = productItem();
    const replacement = productItem({
      preview: { ...first.preview, url: "https://signed.test/replacement" },
    });
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([first]))
      .mockResolvedValueOnce(page([replacement]));
    renderScreen({ list });

    fireEvent.error(await screen.findByRole("img", { name: "Cotton trousers preview" }));
    expect(screen.getByText("Preview unavailable")).toBeVisible();
    expect(screen.getByText("Cotton trousers")).toBeVisible();
    expect(list).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Refresh requests" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Cotton trousers preview" })).toHaveAttribute(
        "src",
        "https://signed.test/replacement",
      ),
    );
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("resets an empty stale cursor and does not retain an invalid page", async () => {
    const onRequestChange = vi.fn();
    renderScreen(client(page()), {
      request: { ...request, cursor: "stale-page" },
      onRequestChange,
    });

    await waitFor(() => expect(onRequestChange).toHaveBeenCalledWith({ ...request, cursor: null }));
    expect(screen.queryByText("No moderation requests")).not.toBeInTheDocument();
  });

  it("removes private queue data when administrator authorization is lost", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([sellerItem()]))
      .mockRejectedValueOnce({ code: "prototype_administrator_required" });
    renderScreen({ list });
    expect((await screen.findAllByText("Seller One")).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Refresh requests" }));
    expect(await screen.findByText("Administrator access required")).toBeVisible();
    expect(screen.queryByText("Seller One")).not.toBeInTheDocument();
  });
});

function renderScreen(
  queueClient: AdministratorModerationQueueClient,
  overrides: Partial<{
    request: AdministratorModerationRequest;
    onRequestChange: (request: AdministratorModerationRequest) => void;
  }> = {},
) {
  return render(
    <AdministratorModerationQueueScreenView
      routeState={{ valid: true, request: overrides.request ?? request, lang: "EN" }}
      onRequestChange={overrides.onRequestChange ?? vi.fn()}
      client={queueClient}
    />,
  );
}

function client(result: AdministratorModerationPage): AdministratorModerationQueueClient {
  return { list: vi.fn().mockResolvedValue(result) };
}

function page(items: AdministratorModerationQueueItem[] = []): AdministratorModerationPage {
  return {
    items,
    nextCursor: null,
    normalizedFilters: {
      submissionType: null,
      reviewStatus: "pending",
      activationStatus: null,
      sellerId: null,
      limit: 25,
    },
  };
}

function sellerItem(
  overrides: Partial<AdministratorModerationQueueItem> = {},
): AdministratorModerationQueueItem {
  return {
    submissionType: "new_seller",
    submissionId: uuid(10),
    seller: { sellerId: uuid(1), name: "Seller One" },
    product: null,
    revision: 1,
    submittedAt: "2026-08-18T10:00:00.000Z",
    reviewStatus: "pending",
    sellerVisibleReason: null,
    preview: availablePreview("https://seller.test/logo"),
    activation: null,
    ...overrides,
  } as AdministratorModerationQueueItem;
}

function productItem(
  overrides: Partial<AdministratorModerationQueueItem> = {},
): AdministratorModerationQueueItem {
  return {
    submissionType: "initial_product",
    submissionId: uuid(20),
    seller: { sellerId: uuid(1), name: "Seller One" },
    product: { productId: uuid(2), title: "Cotton trousers", productCode: "SEL-F-TRO-ABC12345" },
    revision: 2,
    submittedAt: "2026-08-18T11:00:00.000Z",
    reviewStatus: "approved",
    sellerVisibleReason: null,
    preview: availablePreview("https://product.test/cover"),
    activation: {
      runId: uuid(30),
      phase: "activation",
      status: "running",
      dispatchStatus: "dispatched",
      dispatchGeneration: 1,
      dispatchErrorCode: null,
      errorCode: null,
      displayState: "publishing",
    },
    ...overrides,
  } as AdministratorModerationQueueItem;
}

function availablePreview(url: string): AdministratorModerationQueueItem["preview"] {
  return {
    kind: "product_cover",
    deliveryStatus: "available",
    deliveryErrorCode: null,
    url,
    expiresAt: "2999-08-18T12:00:00.000Z",
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
