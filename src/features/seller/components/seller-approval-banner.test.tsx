import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { SellerApprovalBanner } from "./seller-approval-banner";

type BannerSnapshot = Parameters<typeof SellerApprovalBanner>[0]["snapshot"];
type Submission = NonNullable<BannerSnapshot["latestSubmission"]>;

describe("SellerApprovalBanner", () => {
  it("directs an unsubmitted seller to complete the profile", () => {
    render(<SellerApprovalBanner snapshot={snapshot()} />);

    expect(screen.getByRole("heading", { name: "Seller profile approval required" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Complete profile" })).toHaveAttribute(
      "href",
      "/seller/storefront",
    );
  });

  it("shows that a pending submission is waiting for administrator approval", () => {
    render(<SellerApprovalBanner snapshot={snapshot(submission("pending"))} />);

    expect(
      screen.getByRole("heading", { name: "Waiting for administrator approval" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "View submission" })).toBeVisible();
  });

  it.each([
    ["changes_requested", "Seller profile changes requested", "Review changes"],
    ["rejected", "Seller profile was rejected", "Edit and resubmit"],
  ] as const)("shows administrator feedback for %s", (status, title, action) => {
    render(
      <SellerApprovalBanner
        snapshot={snapshot(submission(status, "Please provide a complete business address."))}
      />,
    );

    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByText(/Please provide a complete business address\./)).toBeVisible();
    expect(screen.getByRole("link", { name: action })).toBeVisible();
  });

  it.each(["approved_storefront_disabled", "approved_storefront_enabled"] as const)(
    "does not render for %s",
    (approvalState) => {
      const { container } = render(
        <SellerApprovalBanner snapshot={{ approvalState, latestSubmission: null }} />,
      );

      expect(container).toBeEmptyDOMElement();
    },
  );
});

function snapshot(latestSubmission: Submission | null = null): BannerSnapshot {
  return { approvalState: "not_approved", latestSubmission };
}

function submission(
  status: Submission["status"],
  sellerVisibleReason: string | null = null,
): Submission {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "initial",
    revision: 1,
    status,
    submittedAt: "2026-08-19T12:00:00.000Z",
    decidedAt: status === "pending" ? null : "2026-08-19T12:05:00.000Z",
    sellerVisibleReason,
  };
}
