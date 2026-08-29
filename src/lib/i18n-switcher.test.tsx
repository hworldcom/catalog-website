import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LanguageSwitcher } from "./i18n";

describe("LanguageSwitcher appearances", () => {
  it("keeps the existing default treatment", () => {
    render(<LanguageSwitcher />);

    expect(screen.getByRole("group", { name: "Language" })).toHaveClass(
      "gap-0.5",
      "px-1",
      "py-0.5",
    );
    expect(screen.getByRole("button", { name: "EN" })).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    );
  });

  it("uses the compact black selection treatment in the public header", () => {
    render(<LanguageSwitcher appearance="publicHeader" />);

    expect(screen.getByRole("group", { name: "Language" })).toHaveClass("bg-card");
    expect(screen.getByRole("button", { name: "EN" })).toHaveClass(
      "min-h-8",
      "min-w-8",
      "bg-foreground",
      "text-card",
    );
    expect(screen.getByRole("button", { name: "PL" })).toHaveClass("text-muted-foreground");
  });
});
