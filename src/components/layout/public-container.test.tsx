import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicContainer } from "./public-container";

describe("PublicContainer", () => {
  it("provides the shared public width and responsive gutters", () => {
    render(<PublicContainer data-testid="container">Content</PublicContainer>);

    expect(screen.getByTestId("container")).toHaveClass(
      "mx-auto",
      "w-full",
      "max-w-[1320px]",
      "px-5",
      "sm:px-6",
      "lg:px-8",
    );
  });

  it("merges caller classes and native div properties", () => {
    render(
      <PublicContainer data-testid="container" className="py-8" aria-label="Public content">
        Content
      </PublicContainer>,
    );

    expect(screen.getByLabelText("Public content")).toHaveClass("py-8");
  });
});
