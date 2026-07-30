import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  DelegatedClassifierUploadNewScreenView,
  type DelegatedClassifierUploadNewClient,
} from "./delegated-classifier-upload-new-screen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

describe("DelegatedClassifierUploadNewScreenView", () => {
  it("selects an explicit seller and creates the seller-owned workflow", async () => {
    const user = userEvent.setup();
    const create = vi.fn(async () => context());
    const client: DelegatedClassifierUploadNewClient = {
      search: vi.fn(async () => ({ sellers: [seller()] })),
      create,
    };
    const onCreated = vi.fn();

    render(<DelegatedClassifierUploadNewScreenView client={client} onCreated={onCreated} />);

    await user.click(await screen.findByRole("button", { name: /Kesar Textiles/ }));
    expect(screen.getByText("Selected seller")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create classifier upload" }));

    expect(create).toHaveBeenCalledWith({
      sellerId: uuid(10),
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(onCreated).toHaveBeenCalledWith(uuid(1));
  });

  it("allows an unpublished storefront to own the delegated workflow", async () => {
    const client: DelegatedClassifierUploadNewClient = {
      search: vi.fn(async () => ({
        sellers: [{ ...seller(), published: false }],
      })),
      create: vi.fn(),
    };

    render(<DelegatedClassifierUploadNewScreenView client={client} onCreated={vi.fn()} />);

    expect(await screen.findByText("Unpublished storefront")).toBeInTheDocument();
  });
});

function context() {
  return {
    seller: seller(),
    workflow: {
      workflowId: uuid(1),
      provisioningStatus: "ready" as const,
      stage: "upload" as const,
      errorCode: null,
      retryAllowed: false,
      maxFiles: 20,
      maxFileSizeBytes: 20 * 1024 * 1024,
      createdAt: "2026-07-30T10:00:00.000Z",
      updatedAt: "2026-07-30T10:01:00.000Z",
    },
  };
}

function seller() {
  return {
    sellerId: uuid(10),
    name: "Kesar Textiles",
    slug: "kesar-textiles",
    published: true,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
