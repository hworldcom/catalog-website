import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerProfileMediaPreview } from "@/features/seller/seller-profile-moderation.types";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listCategories: vi.fn(),
  onboard: vi.fn(),
  saveCompanyCode: vi.fn(),
  saveProfile: vi.fn(),
  submitProfile: vi.fn(),
  withdrawProfile: vi.fn(),
  setStorefrontEnabled: vi.fn(),
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
  getMySellerProfileModerationSnapshot: mocks.getProfile,
  saveMySellerProfileWorkingCopy: mocks.saveProfile,
  submitMySellerProfile: mocks.submitProfile,
  withdrawMySellerProfileSubmission: mocks.withdrawProfile,
  setMySellerStorefrontEnabled: mocks.setStorefrontEnabled,
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

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "qa-access-token" } },
      })),
    },
    storage: {
      from: vi.fn(() => ({ uploadToSignedUrl: vi.fn() })),
    },
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
    mocks.getProfile.mockResolvedValue(snapshotResult());
    mocks.saveCompanyCode.mockResolvedValue({
      seller: seller({ company_code: "QAB" }),
    });
    mocks.saveProfile.mockResolvedValue(profileResult({ revision: 2 }));
    mocks.submitProfile.mockResolvedValue({ submission: { status: "pending" } });
    mocks.withdrawProfile.mockResolvedValue({ submission: { status: "withdrawn" } });
    mocks.setStorefrontEnabled.mockResolvedValue({
      receipt: { result: "recorded", storefrontEnabled: true },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a consistent Polish-market onboarding example", () => {
    renderScreen(<OnboardingScreen />);

    expect(screen.getByRole("textbox", { name: "Business name*" })).toHaveAttribute(
      "placeholder",
      "Mazovia Moda",
    );
    expect(screen.getByRole("textbox", { name: /^Company code\*/ })).toHaveAttribute(
      "placeholder",
      "MIA",
    );
    expect(screen.getByRole("textbox", { name: "City" })).toHaveAttribute("placeholder", "Warsaw");
    expect(screen.getByRole("textbox", { name: "Country" })).toHaveAttribute(
      "placeholder",
      "Poland",
    );
    expect(
      screen.getByRole("textbox", { name: /^WhatsApp \(with country code\)/ }),
    ).toHaveAttribute("placeholder", "+48 000 000 000");
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
    mocks.getProfile
      .mockResolvedValueOnce(snapshotResult())
      .mockResolvedValue(snapshotResult({ revision: 2, company_code: "QAB" }));
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
      snapshotResult({ company_code_locked_at: "2026-08-01T12:00:00.000Z" }),
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
    expect(screen.getByText("Not approved")).toHaveClass(
      "border-primary/30",
      "bg-primary/10",
      "text-foreground",
    );
    expect(screen.getByRole("textbox", { name: "Business category" })).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload cover image" })).toBeInTheDocument();
  });

  it("uses orange profile-action styling for logo and cover replacements", async () => {
    mocks.getProfile.mockResolvedValue(
      snapshotResult({
        logo: mediaPreview("00000000-0000-4000-8000-000000000021"),
        cover: mediaPreview("00000000-0000-4000-8000-000000000022"),
      }),
    );

    renderScreen(<StorefrontScreen />);

    for (const name of ["Replace logo", "Replace cover image"]) {
      expect(await screen.findByRole("button", { name })).toHaveClass(
        "bg-orange-600",
        "px-4",
        "py-2.5",
        "text-sm",
      );
    }
    expect(screen.getByRole("button", { name: "Save profile draft" })).toHaveClass(
      "bg-orange-600",
      "text-white",
    );
  });

  it("keeps a pending profile read-only and exposes only withdrawal", async () => {
    mocks.getProfile.mockResolvedValue(
      snapshotResult({
        latestSubmission: submissionSnapshot({ status: "pending" }),
        actions: {
          canEdit: false,
          canSubmit: false,
          canWithdraw: true,
          canEnableStorefront: false,
          canDisableStorefront: false,
        },
      }),
    );

    renderScreen(<StorefrontScreen />);

    expect(await screen.findByRole("textbox", { name: "Business name" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save profile draft" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Submit profile for review" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Pending review")).toHaveClass(
      "border-primary/30",
      "bg-primary/10",
      "text-foreground",
    );
    expect(screen.getByRole("button", { name: "Withdraw submission" })).toHaveClass(
      "bg-orange-600",
      "text-white",
    );
  });

  it.each([
    ["changes_requested", "Changes requested"],
    ["rejected", "Rejected"],
    ["withdrawn", "Withdrawn"],
  ] as const)("allows editing and resubmission after %s", async (status, label) => {
    mocks.getProfile.mockResolvedValue(
      snapshotResult({
        latestSubmission: submissionSnapshot({ status }),
      }),
    );

    renderScreen(<StorefrontScreen />);

    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Business name" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Submit profile for review" })).toBeEnabled();
  });

  it("keeps an approved profile separate from storefront visibility", async () => {
    const base = snapshotResult();
    mocks.getProfile.mockResolvedValue({
      ...base,
      approvalState: "approved_storefront_disabled",
      approvedProfile: {
        submissionId: "00000000-0000-4000-8000-000000000013",
        revision: 1,
        name: "Approved QA Seller",
        slug: "approved-qa-seller",
        city: "Berlin",
        country: "Germany",
        whatsapp: null,
        email: null,
        about: "Approved seller summary",
        establishedYear: null,
        logo: null,
        cover: null,
      },
      latestSubmission: submissionSnapshot({ status: "approved" }),
      actions: {
        canEdit: true,
        canSubmit: true,
        canWithdraw: false,
        canEnableStorefront: true,
        canDisableStorefront: false,
      },
    });

    renderScreen(<StorefrontScreen />);

    expect(await screen.findByText("Approved public profile")).toBeInTheDocument();
    expect(screen.getByText("Approved, storefront disabled")).toHaveClass("bg-emerald-600");
    expect(screen.getByRole("button", { name: "Enable storefront" })).toHaveClass("bg-emerald-600");
    expect(screen.getByRole("textbox", { name: "Business name" })).toHaveValue("QA Seller");
  });

  it("uses destructive styling for the storefront disable action", async () => {
    const base = snapshotResult();
    mocks.getProfile.mockResolvedValue({
      ...base,
      storefrontEnabled: true,
      approvalState: "approved_storefront_enabled",
      actions: {
        canEdit: true,
        canSubmit: true,
        canWithdraw: false,
        canEnableStorefront: false,
        canDisableStorefront: true,
      },
    });

    renderScreen(<StorefrontScreen />);

    expect(await screen.findByRole("button", { name: "Disable storefront" })).toHaveClass(
      "bg-destructive",
    );
  });

  it("reuses a request identifier after an unknown submission outcome", async () => {
    mocks.submitProfile
      .mockRejectedValueOnce(new Error("seller_approval_unavailable"))
      .mockResolvedValueOnce({ submission: { status: "pending" } });
    renderScreen(<StorefrontScreen />);

    const submit = await screen.findByRole("button", { name: "Submit profile for review" });
    await userEvent.click(submit);
    await waitFor(() => expect(mocks.submitProfile).toHaveBeenCalledTimes(1));
    await userEvent.click(submit);
    await waitFor(() => expect(mocks.submitProfile).toHaveBeenCalledTimes(2));

    const firstRequestId = mocks.submitProfile.mock.calls[0]?.[0].data.requestId;
    const secondRequestId = mocks.submitProfile.mock.calls[1]?.[0].data.requestId;
    expect(firstRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondRequestId).toBe(firstRequestId);
  });

  it("preserves unsaved fields while a failed media preview refreshes once", async () => {
    let rejectFirstFetch: ((reason: Error) => void) | undefined;
    const firstFetch = new Promise<Response>((_resolve, reject) => {
      rejectFirstFetch = reject;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstFetch)
      .mockRejectedValueOnce(new Error("preview unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    mocks.getProfile.mockResolvedValue(
      snapshotResult({
        logo: {
          assetId: "00000000-0000-4000-8000-000000000012",
          durableStatus: "available",
          deliveryStatus: "available",
          deliveryErrorCode: null,
          url: "/v1/seller-profile-assets/00000000-0000-4000-8000-000000000012",
        },
      }),
    );
    renderScreen(<StorefrontScreen />);

    const businessName = await screen.findByRole("textbox", { name: "Business name" });
    await userEvent.clear(businessName);
    await userEvent.type(businessName, "Unsaved seller name");
    rejectFirstFetch?.(new Error("expired preview"));

    await waitFor(() => expect(mocks.getProfile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(businessName).toHaveValue("Unsaved seller name");
  });

  it("uses the refreshed revision without discarding fields after a save conflict", async () => {
    mocks.getProfile
      .mockResolvedValueOnce(snapshotResult())
      .mockResolvedValue(snapshotResult({ revision: 2 }));
    mocks.saveProfile
      .mockRejectedValueOnce(new Error("seller_profile_revision_conflict"))
      .mockResolvedValueOnce(profileResult({ revision: 3 }));
    renderScreen(<StorefrontScreen />);

    const city = await screen.findByRole("textbox", { name: "City" });
    await userEvent.type(city, "Warsaw");
    await userEvent.click(screen.getByRole("button", { name: "Save profile draft" }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1));
    expect(city).toHaveValue("Warsaw");

    await userEvent.click(screen.getByRole("button", { name: "Save profile draft" }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(2));
    expect(mocks.saveProfile).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        expectedRevision: 2,
        city: "Warsaw",
      }),
    });
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

function snapshotResult(
  overrides: Partial<{
    company_code: string;
    company_code_locked_at: string | null;
    revision: number;
    latestSubmission: ReturnType<typeof submissionSnapshot> | null;
    actions: {
      canEdit: boolean;
      canSubmit: boolean;
      canWithdraw: boolean;
      canEnableStorefront: boolean;
      canDisableStorefront: boolean;
    };
    logo: SellerProfileMediaPreview | null;
    cover: SellerProfileMediaPreview | null;
  }> = {},
) {
  return {
    sellerId: "00000000-0000-4000-8000-000000000010",
    companyCode: overrides.company_code ?? "QAA",
    companyCodeLockedAt: overrides.company_code_locked_at ?? null,
    primaryCategoryId: fashionId,
    storefrontEnabled: false,
    approvalState: "not_approved" as const,
    approvedProfile: null,
    workingCopy: {
      revision: overrides.revision ?? 1,
      name: "QA Seller",
      slug: "qa-seller",
      city: null,
      country: null,
      whatsapp: null,
      email: null,
      about: null,
      establishedYear: null,
      logo: overrides.logo ?? null,
      cover: overrides.cover ?? null,
    },
    latestSubmission: overrides.latestSubmission ?? null,
    actions: overrides.actions ?? {
      canEdit: true,
      canSubmit: true,
      canWithdraw: false,
      canEnableStorefront: false,
      canDisableStorefront: false,
    },
  };
}

function mediaPreview(assetId: string): SellerProfileMediaPreview {
  return {
    assetId,
    durableStatus: "pending",
    deliveryStatus: "pending",
    deliveryErrorCode: null,
    url: null,
  };
}

function submissionSnapshot(
  overrides: Partial<{
    status: "pending" | "changes_requested" | "approved" | "rejected" | "withdrawn";
  }> = {},
) {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "initial" as const,
    revision: 1,
    status: overrides.status ?? ("pending" as const),
    submittedAt: "2026-08-16T12:00:00.000Z",
    decidedAt: null,
    sellerVisibleReason: null,
  };
}
