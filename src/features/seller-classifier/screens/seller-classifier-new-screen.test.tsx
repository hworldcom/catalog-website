import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (operation: unknown) => operation,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("../seller-classifier-batch.functions", () => ({
  createMyClassifierBatch: mocks.create,
  getMyClassifierBatch: mocks.get,
  retryMyClassifierBatchProvisioning: mocks.retry,
}));

vi.mock("../seller-classifier-creation-session", () => ({
  loadSellerClassifierCreationSession: () => null,
  newSellerClassifierCreationSession: () => ({
    requestId: "00000000-0000-4000-8000-000000000001",
  }),
  saveSellerClassifierCreationSession: vi.fn(),
}));

import { SellerClassifierNewScreen } from "./seller-classifier-new-screen";

describe("SellerClassifierNewScreen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers manual ingestion when classifier batch creation is unavailable", async () => {
    mocks.create.mockRejectedValueOnce(
      Object.assign(new Error("Seller classifier workflows are temporarily unavailable."), {
        code: "seller_classifier_unavailable",
      }),
    );
    render(<SellerClassifierNewScreen />);

    await userEvent.click(screen.getByRole("button", { name: "Start classifier upload" }));

    expect(await screen.findByRole("link", { name: "Add product manually" })).toHaveAttribute(
      "href",
      "/seller/products/new",
    );
  });

  it("does not offer manual recovery for classifier configuration errors", async () => {
    mocks.create.mockRejectedValueOnce(
      Object.assign(new Error("Seller classifier workflows are not configured."), {
        code: "seller_classifier_configuration_invalid",
      }),
    );
    render(<SellerClassifierNewScreen />);

    await userEvent.click(screen.getByRole("button", { name: "Start classifier upload" }));

    expect(
      await screen.findByText("Seller classifier workflows are not configured."),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add product manually" })).not.toBeInTheDocument();
  });
});
