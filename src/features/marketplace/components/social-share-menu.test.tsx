import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));

import { facebookShareUrl, whatsAppShareUrl } from "../social-share-destinations";
import { SocialShareMenu } from "./social-share-menu";

const title = "Cotton shirt — Bazoria";
const url = "https://bazoria.example/p/product-id?lang=EN&audience=all";

describe("SocialShareMenu", () => {
  beforeEach(() => {
    toast.error.mockReset();
    toast.success.mockReset();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a keyboard-accessible menu with the persistent destinations", async () => {
    render(<SocialShareMenu title={title} url={url} language="EN" />);

    const trigger = screen.getByRole("button", { name: "Share" });
    expect(trigger).toHaveTextContent("Share");
    expect(trigger.querySelector(".sr-only")).toBeNull();
    trigger.focus();
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByRole("menuitem", { name: "Facebook" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "WhatsApp" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "LinkedIn" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Share using another app" }),
    ).not.toBeInTheDocument();
  });

  it("shows native sharing when supported and ignores user cancellation", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<SocialShareMenu title={title} url={url} language="EN" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Share using another app" }));

    expect(share).toHaveBeenCalledWith({ title, url });
    await waitFor(() => expect(toast.error).not.toHaveBeenCalled());
  });

  it("reports a non-cancellation native share failure in the selected language", async () => {
    const share = vi.fn().mockRejectedValue(new Error("Unavailable"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<SocialShareMenu title={title} url={url} language="DE" />);

    await userEvent.click(screen.getByRole("button", { name: "Teilen" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Mit einer anderen App teilen" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Teilen fehlgeschlagen. Versuchen Sie eine andere Option.",
      ),
    );
  });

  it("copies the canonical URL and confirms success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<SocialShareMenu title={title} url={url} language="PL" />);

    await userEvent.click(screen.getByRole("button", { name: "Udostępnij" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Kopiuj link" }));

    expect(writeText).toHaveBeenCalledWith(url);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link skopiowany."));
  });

  it("reports a localized clipboard failure and keeps Copy link available", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<SocialShareMenu title={title} url={url} language="VI" />);

    await userEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sao chép liên kết" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể sao chép liên kết."));

    await userEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    expect(screen.getByRole("menuitem", { name: "Sao chép liên kết" })).toBeVisible();
  });

  it("opens external destinations without opener access", async () => {
    const openedWindow = { opener: window } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(openedWindow);
    render(<SocialShareMenu title={title} url={url} language="EN" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Facebook" }));

    expect(open).toHaveBeenCalledWith(facebookShareUrl(url), "_blank", "noopener,noreferrer");
    expect(openedWindow.opener).toBeNull();
  });
});

describe("social destination URLs", () => {
  it("encodes the shared URL and WhatsApp title", () => {
    expect(new URL(facebookShareUrl(url)).searchParams.get("u")).toBe(url);
    expect(new URL(whatsAppShareUrl(title, url)).searchParams.get("text")).toBe(`${title} ${url}`);
  });
});
