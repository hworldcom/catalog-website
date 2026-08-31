import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AdministratorNavigationProvider } from "@/features/admin/administrator-navigation.provider";

import { SideNav } from "./side-nav";

const mocks = vi.hoisted(() => ({ classifierAssistedUploadEnabled: true }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/classifier-release/classifier-release-runtime", () => ({
  useClassifierAssistedUploadEnabled: () => mocks.classifierAssistedUploadEnabled,
}));

describe("SideNav administrator navigation", () => {
  it("shows moderation requests only to server-derived prototype administrators", () => {
    mocks.classifierAssistedUploadEnabled = true;
    const { rerender } = renderSideNav(false);
    expect(screen.queryByRole("link", { name: "Moderation requests" })).not.toBeInTheDocument();

    rerender(sideNav(true));
    expect(screen.getByRole("link", { name: "Moderation requests" })).toHaveAttribute(
      "href",
      "/admin/moderation",
    );
  });

  it("hides classifier upload navigation when the release gate is disabled", () => {
    mocks.classifierAssistedUploadEnabled = false;
    renderSideNav(false);

    expect(screen.queryByRole("link", { name: "Classifier uploads" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Products" })).toBeVisible();
  });
});

function renderSideNav(prototypeAdministrator: boolean) {
  return render(sideNav(prototypeAdministrator));
}

function sideNav(prototypeAdministrator: boolean) {
  return (
    <AdministratorNavigationProvider value={{ prototypeAdministrator }}>
      <SideNav sellerSlug="test-seller" />
    </AdministratorNavigationProvider>
  );
}
