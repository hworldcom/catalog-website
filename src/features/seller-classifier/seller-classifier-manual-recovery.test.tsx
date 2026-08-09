import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { isSellerClassifierUnavailable } from "./seller-classifier-error";
import { SellerClassifierManualRecovery } from "./seller-classifier-manual-recovery";

describe("SellerClassifierManualRecovery", () => {
  it("offers manual ingestion only for the exact classifier-unavailable outcome", () => {
    const { rerender } = render(
      <SellerClassifierManualRecovery error={{ code: "seller_classifier_unavailable" }} />,
    );

    expect(
      screen.getByText(
        "Automatic grouping is temporarily unavailable. You can still add a product manually.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Add product manually" })).toHaveAttribute(
      "href",
      "/seller/products/new",
    );

    rerender(
      <SellerClassifierManualRecovery
        error={{ code: "seller_classifier_configuration_invalid" }}
      />,
    );
    expect(screen.queryByRole("link", { name: "Add product manually" })).not.toBeInTheDocument();
  });

  it("does not infer classifier availability from error messages", () => {
    expect(
      isSellerClassifierUnavailable(
        new Error("seller_classifier_unavailable: classifier request failed"),
      ),
    ).toBe(false);
  });
});
