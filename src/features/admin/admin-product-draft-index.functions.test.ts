import { describe, expect, it, vi } from "vitest";

import { handleListAdminProductDrafts } from "./admin-product-draft-index.functions";
import type { PrototypeAdministratorRequestContext } from "./prototype-administrator.middleware";

const context = {
  userId: "00000000-0000-4000-8000-000000000001",
  prototypeAdministrator: true,
} as PrototypeAdministratorRequestContext;

describe("handleListAdminProductDrafts", () => {
  it("checks the deployment gate before constructing the service and applies private headers", async () => {
    const events: string[] = [];
    const response = { items: [], nextCursor: null };
    const list = vi.fn(async () => {
      events.push("list");
      return response;
    });

    await expect(
      handleListAdminProductDrafts(
        { limit: 25, cursor: null, status: null, sellerId: null },
        context,
        {
          assertEnabled: vi.fn(async () => {
            events.push("gate");
          }),
          createService: vi.fn(async () => {
            events.push("create");
            return { list };
          }),
          applyResponseHeaders: vi.fn(() => {
            events.push("headers");
          }),
        },
      ),
    ).resolves.toEqual(response);

    expect(events).toEqual(["gate", "create", "list", "headers"]);
    expect(list).toHaveBeenCalledWith(
      { limit: 25, cursor: null, status: null, sellerId: null },
      {
        userId: context.userId,
        prototypeAdministrator: true,
      },
    );
  });

  it("does not construct a service while the deployment gate is closed", async () => {
    const createService = vi.fn();

    await expect(
      handleListAdminProductDrafts(
        { limit: 25, cursor: null, status: null, sellerId: null },
        context,
        {
          assertEnabled: vi.fn(async () => {
            throw new Error("gate closed");
          }),
          createService,
          applyResponseHeaders: vi.fn(),
        },
      ),
    ).rejects.toThrow("gate closed");

    expect(createService).not.toHaveBeenCalled();
  });
});
