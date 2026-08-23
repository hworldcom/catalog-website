import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ProductModerationStatusDetail } from "../product-moderation-status.types";
import { productModerationImageCredentialIdentity } from "../product-moderation-status-refresh";
import {
  ProductModerationAxes,
  ProductModerationOutcomeNotice,
  ProductModerationSubmittedRevisionView,
} from "./product-moderation-status-view";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

describe("ProductModerationSubmittedRevisionView", () => {
  it("reports an image failure with its credential context", () => {
    const current = status();
    const image = current.submittedRevision?.images[0];
    const onImageError = vi.fn();
    render(
      <ProductModerationSubmittedRevisionView
        status={current}
        categoryName="Dresses"
        onImageError={onImageError}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Submitted dress 1" }));
    expect(onImageError).toHaveBeenCalledWith(current.submittedRevision?.submissionId, image);
  });

  it("shows a placeholder after the credential used by the image has failed", () => {
    const current = status();
    const submitted = current.submittedRevision;
    const image = submitted?.images[0];
    if (!submitted || !image) throw new Error("The test submitted image is missing.");
    const identity = productModerationImageCredentialIdentity(submitted.submissionId, image);
    if (!identity) throw new Error("The test credential identity is missing.");

    render(
      <ProductModerationSubmittedRevisionView
        status={current}
        categoryName="Dresses"
        failedCredentialIdentities={new Set([identity])}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Image unavailable")).toBeVisible();
  });

  it("renders submitted facts without exposing document metadata", () => {
    const current = status();
    if (!current.submittedRevision) throw new Error("The submitted revision is missing.");
    current.submittedRevision.snapshot.facts = {
      factsRevision: 2,
      facts: {
        schemaVersion: 2,
        colors: ["black"],
        materialComposition: "linen",
        uncertainFields: [],
        fieldSources: { colors: "human", materialComposition: "human" },
      },
    };

    render(<ProductModerationSubmittedRevisionView status={current} categoryName="Dresses" />);

    expect(screen.getByText("Submitted product facts")).toBeVisible();
    expect(screen.getByText("Colors")).toBeVisible();
    expect(screen.getByText("black")).toBeVisible();
    expect(screen.getByText("Material composition")).toBeVisible();
    expect(screen.getByText("linen")).toBeVisible();
    expect(
      screen.queryByText(/schemaVersion|fieldSources|uncertainFields/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewed product facts")).not.toBeInTheDocument();
  });

  it("keeps an invalid submitted facts document seller-safe", () => {
    const current = status();
    if (!current.submittedRevision) throw new Error("The submitted revision is missing.");
    current.submittedRevision.snapshot.facts = {
      factsRevision: 2,
      facts: { schemaVersion: 1, privateMetadata: "must not be rendered" },
    };

    render(<ProductModerationSubmittedRevisionView status={current} categoryName="Dresses" />);

    const factsTitle = screen.getByText("Submitted product facts");
    const factsCard = factsTitle.closest(".rounded-xl");
    if (!factsCard) throw new Error("The submitted facts card is missing.");
    expect(within(factsCard).getAllByText("Not available")).toHaveLength(2);
    expect(screen.queryByText(/privateMetadata|must not be rendered/)).not.toBeInTheDocument();
  });

  it("identifies a submitted description based on older facts", () => {
    const current = status();
    if (!current.submittedRevision) throw new Error("The submitted revision is missing.");
    current.submittedRevision.snapshot.facts = { factsRevision: 2, facts: {} };
    current.submittedRevision.snapshot.descriptions = [
      {
        language: "en",
        descriptionText: "Black running trousers.",
        source: "human",
        factsRevision: 1,
        provider: null,
        model: null,
        pipelineVersion: null,
        generatedAt: null,
      },
    ];

    render(<ProductModerationSubmittedRevisionView status={current} categoryName="Trousers" />);

    expect(screen.getByText("Older facts")).toBeVisible();
    expect(
      screen.getByText(
        "This description uses facts revision 1; the submitted facts are revision 2.",
      ),
    ).toBeVisible();
  });
});

describe("ProductModerationOutcomeNotice", () => {
  it("presents product state separately from effective marketplace visibility", () => {
    const current = status();
    current.publicState = "published";
    current.marketplaceVisibility = "storefront_disabled";

    render(<ProductModerationAxes status={current} />);

    expect(screen.getByText("Product state")).toBeVisible();
    expect(screen.getByText("Published")).toBeVisible();
    expect(screen.getByText("Marketplace")).toBeVisible();
    expect(screen.getByText("Storefront disabled")).toBeVisible();
  });

  it("shows a durable pending-review notice", () => {
    render(<ProductModerationOutcomeNotice status={status()} />);

    expect(screen.getByText("Pending administrator review")).toBeVisible();
    expect(screen.getByText(/not public yet/)).toBeVisible();
  });

  it("shows a durable published notice and public link", () => {
    const current = status();
    current.publicState = "published";
    current.marketplaceVisibility = "visible";
    if (current.review) current.review.status = "approved";

    render(<ProductModerationOutcomeNotice status={current} />);

    expect(screen.getByText("Product published")).toBeVisible();
    expect(screen.getByRole("link", { name: "View published product" })).toBeVisible();
  });

  it("shows storefront recovery without a broken public link", () => {
    const current = status();
    current.publicState = "published";
    current.marketplaceVisibility = "storefront_disabled";
    if (current.review) current.review.status = "approved";

    render(<ProductModerationOutcomeNotice status={current} />);

    expect(screen.getByText("Product published; storefront disabled")).toBeVisible();
    expect(screen.getByText(/will not appear.*until you enable your storefront/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open storefront settings" })).toHaveAttribute(
      "href",
      "/seller/storefront",
    );
    expect(screen.queryByRole("link", { name: "View published product" })).not.toBeInTheDocument();
  });

  it("does not present a defensive seller-approval failure as success", () => {
    const current = status();
    current.publicState = "published";
    current.marketplaceVisibility = "seller_approval_required";
    if (current.review) current.review.status = "approved";

    render(<ProductModerationOutcomeNotice status={current} />);

    expect(screen.getByText("Product hidden; seller approval required")).toBeVisible();
    expect(screen.queryByRole("link", { name: "View published product" })).not.toBeInTheDocument();
  });

  it("does not confuse a pending update with the already-public baseline", () => {
    const current = status();
    current.publicState = "published";
    current.marketplaceVisibility = "visible";
    if (!current.review) throw new Error("The review fixture is missing.");
    current.review.kind = "update";

    render(<ProductModerationOutcomeNotice status={current} />);

    expect(screen.getByText("Pending administrator review")).toBeVisible();
    expect(screen.getByText(/current public version remains visible/i)).toBeVisible();
    expect(screen.queryByText("Product published")).not.toBeInTheDocument();
  });
});

function status(): ProductModerationStatusDetail {
  const productId = uuid(1);
  const sellerId = uuid(2);
  const submissionId = uuid(3);
  const imageId = uuid(4);
  return {
    productId,
    publicState: "draft",
    marketplaceVisibility: "not_published",
    actionRevision: 1,
    hasWorkingCopy: false,
    review: {
      submissionId,
      kind: "initial_publication",
      revision: 1,
      status: "pending",
      submittedAt: "2026-08-16T12:00:00.000Z",
      decidedAt: null,
      sellerVisibleReason: null,
    },
    activation: null,
    actions: {
      canEdit: false,
      canSubmit: false,
      canWithdraw: true,
      canAbandonFailedActivation: false,
      canRetryAbandonmentCleanup: false,
      canArchive: true,
      canRestore: false,
    },
    submittedRevision: {
      submissionId,
      snapshotSchemaVersion: 1,
      snapshot: {
        schemaVersion: 1,
        productId,
        sellerId,
        productCode: null,
        productCodeInput: null,
        title: "Submitted dress",
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
          url: "https://storage.example.test/submitted.jpg?token=secret",
          expiresAt: "2026-08-16T12:05:00.000Z",
        },
      ],
    },
  };
}

function uuid(seed: number) {
  return `00000000-0000-4000-8000-${seed.toString().padStart(12, "0")}`;
}
