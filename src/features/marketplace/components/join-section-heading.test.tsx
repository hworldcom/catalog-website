import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JoinSectionHeading } from "./join-section-heading";

describe("JoinSectionHeading", () => {
  it("renders the shared left-aligned heading and optional lead", () => {
    const { container } = render(
      <JoinSectionHeading eyebrow="For sellers" title="Seller details" lead="Seller lead" />,
    );

    const wrapper = container.firstElementChild;
    expect(screen.getByText("For sellers")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Seller details" })).toBeVisible();
    expect(screen.getByText("Seller lead")).toBeVisible();
    expect(wrapper).toHaveClass("max-w-3xl");
    expect(wrapper).not.toHaveClass("mx-auto", "text-center");
  });

  it("supports centered headings without requiring a lead", () => {
    const { container } = render(
      <JoinSectionHeading eyebrow="Start here" title="Join Bazoria" align="center" />,
    );

    expect(container.firstElementChild).toHaveClass("mx-auto", "text-center");
    expect(screen.getByRole("heading", { level: 2, name: "Join Bazoria" })).toBeVisible();
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});
