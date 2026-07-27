import { afterEach, describe, expect, it, vi } from "vitest";

import { reportClientError } from "./client-error-reporting";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("reportClientError", () => {
  it("logs the error with route and boundary context", () => {
    window.history.replaceState({}, "", "/products/example");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("render failed");

    reportClientError(error, { boundary: "bazoria_page" });

    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith("Client error", error, {
      route: "/products/example",
      boundary: "bazoria_page",
    });
  });
});
