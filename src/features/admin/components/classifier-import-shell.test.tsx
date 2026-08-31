import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AdministratorNavigationProvider } from "../administrator-navigation.provider";
import { ClassifierImportShell } from "./classifier-import-shell";

const mocks = vi.hoisted(() => ({ classifierAssistedUploadEnabled: true }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/classifier-release/classifier-release-runtime", () => ({
  useClassifierAssistedUploadEnabled: () => mocks.classifierAssistedUploadEnabled,
}));

describe("ClassifierImportShell moderation navigation", () => {
  it("shows moderation requests only for server-derived prototype administrators", () => {
    mocks.classifierAssistedUploadEnabled = true;
    const { rerender } = renderShell(false);
    expect(screen.queryByRole("link", { name: "Moderation requests" })).not.toBeInTheDocument();

    rerender(shell(true));
    expect(screen.getByRole("link", { name: "Moderation requests" })).toHaveAttribute(
      "href",
      "/admin/moderation",
    );
  });

  it("hides classifier entry points and uses ProductDrafts as its home when disabled", () => {
    mocks.classifierAssistedUploadEnabled = false;
    renderShell(true);

    expect(screen.queryByRole("link", { name: "Upload for seller" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Catalog operations Internal catalog operations/ }),
    ).toHaveAttribute("href", "/admin/product-drafts");
    expect(screen.getByRole("link", { name: "ProductDrafts" })).toBeVisible();
  });
});

function renderShell(prototypeAdministrator: boolean) {
  return render(shell(prototypeAdministrator));
}

function shell(prototypeAdministrator: boolean) {
  return (
    <AdministratorNavigationProvider value={{ prototypeAdministrator }}>
      <ClassifierImportShell>
        <p>Content</p>
      </ClassifierImportShell>
    </AdministratorNavigationProvider>
  );
}
