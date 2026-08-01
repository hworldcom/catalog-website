import { describe, expect, it, vi } from "vitest";

import {
  DelegatedActionRequestManager,
  delegatedActionStorageKey,
} from "./delegated-action-request";

describe("DelegatedActionRequestManager", () => {
  it("reuses an uncertain request and clears it after success", async () => {
    const storage = memoryStorage();
    const ids = [uuid(1), uuid(2)];
    const manager = new DelegatedActionRequestManager({
      createRequestId: () => ids.shift()!,
      getStorage: () => storage,
    });
    const input = actionInput();
    const uncertain = codedError("delegated_action_in_progress");
    const first = vi.fn(async () => {
      throw uncertain;
    });

    await expect(manager.run({ ...input, execute: first })).rejects.toBe(uncertain);
    expect(first).toHaveBeenCalledWith(uuid(1), null);

    const replay = vi.fn(async (requestId: string) => requestId);
    await expect(manager.run({ ...input, execute: replay })).resolves.toBe(uuid(1));
    expect(storage.getItem(delegatedActionStorageKey(input))).toBeNull();

    await expect(manager.run({ ...input, execute: replay })).resolves.toBe(uuid(2));
  });

  it("keeps a conflict until an explicit new action replaces it", async () => {
    const storage = memoryStorage();
    const ids = [uuid(1), uuid(2)];
    const manager = new DelegatedActionRequestManager({
      createRequestId: () => ids.shift()!,
      getStorage: () => storage,
    });
    const input = actionInput();
    const conflict = codedError("delegated_action_request_conflict");

    await expect(
      manager.run({
        ...input,
        execute: async () => {
          throw conflict;
        },
      }),
    ).rejects.toBe(conflict);

    const retry = vi.fn(async (requestId: string) => requestId);
    await expect(manager.run({ ...input, newRequest: true, execute: retry })).resolves.toBe(
      uuid(2),
    );
    expect(retry).toHaveBeenCalledWith(uuid(2), null);
  });

  it("clears deterministic failures and falls back when session storage is unavailable", async () => {
    const ids = [uuid(1), uuid(2)];
    const manager = new DelegatedActionRequestManager({
      createRequestId: () => ids.shift()!,
      getStorage: () => {
        throw new Error("blocked");
      },
    });
    const input = actionInput();

    await expect(
      manager.run({
        ...input,
        execute: async () => {
          throw codedError("delegated_review_not_allowed");
        },
      }),
    ).rejects.toMatchObject({ code: "delegated_review_not_allowed" });

    const next = vi.fn(async (requestId: string) => requestId);
    await expect(manager.run({ ...input, execute: next })).resolves.toBe(uuid(2));
  });

  it("persists and replays the exact normalized publication payload", async () => {
    const storage = memoryStorage();
    const manager = new DelegatedActionRequestManager({
      createRequestId: () => uuid(1),
      getStorage: () => storage,
    });
    const input = {
      workflowId: uuid(10),
      actionType: "publish_product_draft" as const,
      target: uuid(11),
    };
    const originalPayload = {
      title: "Cotton shirt",
      categoryId: uuid(12),
      minimumOrderQuantity: 10,
      packSize: null,
      price: 12.5,
      currency: "EUR",
      stock: "in_stock",
      trending: false,
    };

    await expect(
      manager.run({
        ...input,
        normalizedPayload: originalPayload,
        execute: async () => {
          throw codedError("product_publication_unavailable");
        },
      }),
    ).rejects.toMatchObject({ code: "product_publication_unavailable" });

    expect(manager.getPending<typeof originalPayload>(input)).toEqual({
      version: 1,
      requestId: uuid(1),
      normalizedPayload: originalPayload,
    });

    const replay = vi.fn(
      async (_requestId: string, payload: typeof originalPayload | null) => payload,
    );
    await expect(
      manager.run({
        ...input,
        normalizedPayload: { ...originalPayload, title: "Changed title" },
        execute: replay,
      }),
    ).resolves.toEqual(originalPayload);
    expect(replay).toHaveBeenCalledWith(uuid(1), originalPayload);
  });

  it("discards malformed and legacy request records without submitting them", async () => {
    const storage = memoryStorage();
    const ids = [uuid(1), uuid(2)];
    const manager = new DelegatedActionRequestManager({
      createRequestId: () => ids.shift()!,
      getStorage: () => storage,
    });
    const input = actionInput();
    storage.setItem(delegatedActionStorageKey(input), uuid(99));

    expect(manager.getPending(input)).toBeNull();

    const execute = vi.fn(async (requestId: string) => requestId);
    await expect(manager.run({ ...input, execute })).resolves.toBe(uuid(1));
    expect(execute).toHaveBeenCalledWith(uuid(1), null);
  });
});

function actionInput() {
  return {
    workflowId: uuid(10),
    actionType: "approve_group" as const,
    target: uuid(11),
  };
}

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function codedError(code: string): Error {
  return Object.assign(new Error("safe"), { code });
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
