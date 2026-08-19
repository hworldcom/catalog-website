import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AdministratorNavigationProvider } from "../administrator-navigation.provider";
import { ClassifierImportShell } from "./classifier-import-shell";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

describe("ClassifierImportShell moderation navigation", () => {
  it("shows moderation requests only for server-derived prototype administrators", () => {
    const { rerender } = renderShell(false);
    expect(screen.queryByRole("link", { name: "Moderation requests" })).not.toBeInTheDocument();

    rerender(shell(true));
    expect(screen.getByRole("link", { name: "Moderation requests" })).toHaveAttribute(
      "href",
      "/admin/moderation",
    );
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
