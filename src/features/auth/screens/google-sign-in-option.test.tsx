import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GoogleSignInOption } from "./auth-screen";

describe("GoogleSignInOption", () => {
  it("renders neither the provider control nor separator while disabled", () => {
    const { container } = render(
      <GoogleSignInOption enabled={false} busy={false} onClick={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
  });

  it("renders the provider control and separator only when enabled", () => {
    render(<GoogleSignInOption enabled busy={false} onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.getByText("or")).toBeVisible();
  });
});
