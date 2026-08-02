import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSeller: vi.fn(),
  listCategories: vi.fn(),
  onboard: vi.fn(),
  saveCompanyCode: vi.fn(),
  saveStorefront: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("@/features/seller/categories.functions", () => ({
  listSellerBusinessCategories: mocks.listCategories,
}));

vi.mock("@/features/seller/current-seller.functions", () => ({
  getMySeller: mocks.getSeller,
}));

vi.mock("@/features/seller/onboarding.functions", () => ({
  onboardSeller: mocks.onboard,
}));

vi.mock("@/features/seller/company-code.functions", () => ({
  updateMyCompanyCode: mocks.saveCompanyCode,
}));

vi.mock("@/features/seller/storefront.functions", () => ({
  updateStorefront: mocks.saveStorefront,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("../components/image-upload", () => ({
  ImageUpload: () => <div>Image upload</div>,
}));

import { OnboardingScreen } from "./onboarding-screen";
import { StorefrontScreen } from "./storefront-screen";

const fashionId = "00000000-0000-4000-8000-000000000001";

describe("seller company-code screens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCategories.mockResolvedValue({
      categories: [{ id: fashionId, slug: "fashion", name: "Fashion & Apparel", parent_id: null }],
    });
    mocks.onboard.mockResolvedValue({ seller: seller() });
    mocks.getSeller.mockResolvedValue({ seller: seller() });
    mocks.saveCompanyCode.mockResolvedValue({
      seller: seller({ company_code: "QAB" }),
    });
    mocks.saveStorefront.mockResolvedValue({ ok: true });
  });

  it("preserves a deliberate onboarding code when the business name changes", async () => {
    renderScreen(<OnboardingScreen />);

    const businessName = screen.getByRole("textbox", { name: "Business name*" });
    const companyCode = screen.getByRole("textbox", { name: /^Company code\*/ });

    await userEvent.type(businessName, "Kesar Textiles");
    expect(companyCode).toHaveValue("KES");

    await userEvent.clear(companyCode);
    await userEvent.type(companyCode, "jhc");
    await userEvent.clear(businessName);
    await userEvent.type(businessName, "Aroma Naturals");
    expect(companyCode).toHaveValue("JHC");

    await screen.findByRole("option", { name: "Fashion & Apparel" });
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(mocks.onboard).toHaveBeenCalledTimes(1));
    expect(mocks.onboard).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Aroma Naturals",
        companyCode: "JHC",
        primary_category_id: fashionId,
      }),
    });
  });

  it("saves a changed unlocked company code once through the protected operation", async () => {
    renderScreen(<StorefrontScreen />);

    const companyCode = await screen.findByRole("textbox", { name: /^Company code\*/ });
    await userEvent.clear(companyCode);
    await userEvent.type(companyCode, "qab");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.saveStorefront).toHaveBeenCalledTimes(1));
    expect(mocks.saveCompanyCode).toHaveBeenCalledWith({ data: { companyCode: "QAB" } });

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.saveStorefront).toHaveBeenCalledTimes(2));
    expect(mocks.saveCompanyCode).toHaveBeenCalledTimes(1);
  });

  it("shows a locked company code without allowing edits", async () => {
    mocks.getSeller.mockResolvedValue({
      seller: seller({ company_code_locked_at: "2026-08-01T12:00:00.000Z" }),
    });
    renderScreen(<StorefrontScreen />);

    expect(await screen.findByRole("textbox", { name: /^Company code\*/ })).toBeDisabled();
    expect(
      screen.getByText("This code is locked because a product code has already been created."),
    ).toBeInTheDocument();
  });
});

function renderScreen(element: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

function seller(
  overrides: Partial<{
    company_code: string;
    company_code_locked_at: string | null;
  }> = {},
) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    name: "QA Seller",
    slug: "qa-seller",
    city: null,
    country: null,
    whatsapp: null,
    email: null,
    about: null,
    logo_url: null,
    cover_image_url: null,
    established_year: null,
    primary_category_id: fashionId,
    company_code: "QAA",
    company_code_locked_at: null,
    published: false,
    ...overrides,
  };
}
