import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listCategories: vi.fn(),
  onboard: vi.fn(),
  saveCompanyCode: vi.fn(),
  saveProfile: vi.fn(),
  removeProfileAsset: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("@/features/seller/categories.functions", () => ({
  listSellerBusinessCategories: mocks.listCategories,
}));

vi.mock("@/features/seller/onboarding.functions", () => ({
  onboardSeller: mocks.onboard,
}));

vi.mock("@/features/seller/company-code.functions", () => ({
  updateMyCompanyCode: mocks.saveCompanyCode,
}));

vi.mock("@/features/seller/storefront.functions", () => ({
  getMySellerProfileWorkingCopy: mocks.getProfile,
  saveMySellerProfileWorkingCopy: mocks.saveProfile,
}));

vi.mock("@/features/seller/seller-profile-media.functions", () => ({
  prepareMySellerProfileAssetUpload: vi.fn(),
  finalizeMySellerProfileAssetUpload: vi.fn(),
  removeMySellerProfileAsset: mocks.removeProfileAsset,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
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
    mocks.getProfile.mockResolvedValue(profileResult());
    mocks.saveCompanyCode.mockResolvedValue({
      seller: seller({ company_code: "QAB" }),
    });
    mocks.saveProfile.mockResolvedValue(profileResult({ revision: 2 }));
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
    await userEvent.click(screen.getByRole("button", { name: "Save profile draft" }));

    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1));
    expect(mocks.saveCompanyCode).toHaveBeenCalledWith({ data: { companyCode: "QAB" } });
    expect(mocks.saveProfile).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expectedRevision: 1,
        name: "QA Seller",
        slug: "qa-seller",
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Save profile draft" }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(2));
    expect(mocks.saveCompanyCode).toHaveBeenCalledTimes(1);
    expect(mocks.saveProfile).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ expectedRevision: 2 }),
    });
  });

  it("shows a locked company code without allowing edits", async () => {
    mocks.getProfile.mockResolvedValue(
      profileResult({ company_code_locked_at: "2026-08-01T12:00:00.000Z" }),
    );
    renderScreen(<StorefrontScreen />);

    expect(await screen.findByRole("textbox", { name: /^Company code\*/ })).toBeDisabled();
    expect(
      screen.getByText("This code is locked because a product code has already been created."),
    ).toBeInTheDocument();
  });

  it("keeps publication and category editing disabled while exposing private media controls", async () => {
    renderScreen(<StorefrontScreen />);

    await screen.findByRole("textbox", { name: "Business name" });
    expect(screen.getByRole("textbox", { name: "Business category" })).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload cover image" })).toBeInTheDocument();
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
    slug: "qa-seller",
    primary_category_id: fashionId,
    company_code: "QAA",
    company_code_locked_at: null,
    approved_profile_submission_id: null,
    storefront_enabled: false,
    published: false,
    ...overrides,
  };
}

function profileResult(
  sellerOverrides: Partial<{
    company_code: string;
    company_code_locked_at: string | null;
    revision: number;
  }> = {},
) {
  const { revision = 1, ...identityOverrides } = sellerOverrides;
  return {
    seller: seller(identityOverrides),
    workingCopy: {
      seller_id: "00000000-0000-4000-8000-000000000010",
      revision,
      name: "QA Seller",
      slug: "qa-seller",
      city: null,
      country: null,
      whatsapp: null,
      email: null,
      about: null,
      logo_asset_id: null,
      cover_asset_id: null,
      established_year: null,
      created_at: "2026-08-11T12:00:00.000Z",
      updated_at: "2026-08-11T12:00:00.000Z",
    },
  };
}
