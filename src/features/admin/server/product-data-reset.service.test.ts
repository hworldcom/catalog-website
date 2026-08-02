import { describe, expect, it } from "vitest";

import {
  ProductDataResetFailure,
  ProductDataResetService,
  type ProductDataResetGateway,
  type ProductDataResetStorageEntry,
} from "./product-data-reset.service";

const qaUserId = "00000000-0000-4000-8000-000000000001";

describe("ProductDataResetService", () => {
  it("captures only preserved identity fields and deletes nested bucket objects", async () => {
    const gateway = new FakeGateway();
    gateway.storage["product-images"] = {
      "": [{ name: "published", id: null }],
      published: [
        { name: "one.jpg", id: "object-1" },
        { name: "two.jpg", id: "object-2" },
      ],
    };
    gateway.storage["product-draft-images"] = {
      "": [{ name: "draft.jpg", id: "object-3" }],
    };
    const service = new ProductDataResetService(gateway, "project", [qaUserId], 1);

    expect(await service.captureSnapshot()).toEqual({
      projectRef: "project",
      authUserIds: [qaUserId],
      userRoles: [{ user_id: qaUserId, role: "seller" }],
      sellers: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          owner_id: qaUserId,
          name: "QA Seller",
          slug: "qa-seller",
          company_code: "QAR",
          company_code_locked_at: null,
        },
      ],
    });

    const summary = await service.cleanStorage();
    expect(summary.status).toBe("prepared");
    expect(summary.buckets["product-images"]).toMatchObject({ scanned: 2, deleted: 2 });
    expect(summary.buckets["product-draft-images"]).toMatchObject({ scanned: 1, deleted: 1 });
    expect(gateway.storage["product-images"]).toEqual({});
    expect(gateway.storage["product-draft-images"]).toEqual({});
  });

  it("fails verification when a preserved identity changes", async () => {
    const gateway = new FakeGateway();
    const service = new ProductDataResetService(gateway, "project", [qaUserId], 100);
    const snapshot = await service.captureSnapshot();
    gateway.sellers[0]!.company_code_locked_at = "2026-08-02T00:00:00.000Z";

    await expect(service.verifySnapshot(snapshot)).rejects.toMatchObject({
      summary: { errorCode: "product_data_reset_preserved_identity_mismatch" },
    });
  });

  it("fails rather than reporting success when an object remains", async () => {
    const gateway = new FakeGateway();
    gateway.storage["product-images"] = { "": [{ name: "one.jpg", id: "object-1" }] };
    gateway.retainDeletedObjects = true;
    const service = new ProductDataResetService(gateway, "project", [qaUserId], 100);

    await expect(service.cleanStorage()).rejects.toBeInstanceOf(ProductDataResetFailure);
    await expect(service.cleanStorage()).rejects.toMatchObject({
      summary: { status: "failed", errorCode: "product_data_reset_storage_not_empty" },
    });
  });

  it("records objects that disappear after listing as missing", async () => {
    const gateway = new FakeGateway();
    gateway.storage["product-images"] = { "": [{ name: "gone.jpg", id: "object-1" }] };
    gateway.missingObjectNames.add("gone.jpg");
    const service = new ProductDataResetService(gateway, "project", [qaUserId], 100);

    const summary = await service.cleanStorage();

    expect(summary.buckets["product-images"]).toEqual({
      scanned: 1,
      deleted: 0,
      missing: 1,
      failed: 0,
    });
  });

  it("retries transient storage deletion failures", async () => {
    const gateway = new FakeGateway();
    gateway.storage["product-images"] = { "": [{ name: "one.jpg", id: "object-1" }] };
    gateway.transientDeleteFailuresRemaining = 2;
    const service = new ProductDataResetService(gateway, "project", [qaUserId], 100);

    await expect(service.cleanStorage()).resolves.toMatchObject({ status: "prepared" });
    expect(gateway.deleteAttempts).toBe(3);
  });
});

class FakeGateway implements ProductDataResetGateway {
  readonly authUserIds = [qaUserId];
  readonly userRoles = [{ user_id: qaUserId, role: "seller" }];
  readonly sellers = [
    {
      id: "00000000-0000-4000-8000-000000000002",
      owner_id: qaUserId,
      name: "QA Seller",
      slug: "qa-seller",
      company_code: "QAR",
      company_code_locked_at: null as string | null,
    },
  ];
  storage: Record<
    "product-images" | "product-draft-images",
    Record<string, ProductDataResetStorageEntry[]>
  > = {
    "product-images": {},
    "product-draft-images": {},
  };
  retainDeletedObjects = false;
  missingObjectNames = new Set<string>();
  transientDeleteFailuresRemaining = 0;
  deleteAttempts = 0;

  async listAuthUserIds(page: number, pageSize: number): Promise<string[]> {
    return pageSlice(this.authUserIds, page - 1, pageSize);
  }

  async listUserRoles(offset: number, pageSize: number) {
    return this.userRoles.slice(offset, offset + pageSize);
  }

  async listSellers(offset: number, pageSize: number) {
    return this.sellers.slice(offset, offset + pageSize);
  }

  async listStorageEntries(
    bucket: "product-images" | "product-draft-images",
    prefix: string,
    offset: number,
    pageSize: number,
  ): Promise<ProductDataResetStorageEntry[]> {
    return (this.storage[bucket][prefix] ?? []).slice(offset, offset + pageSize);
  }

  async removeStorageObjects(
    bucket: "product-images" | "product-draft-images",
    objectNames: string[],
  ): Promise<number> {
    this.deleteAttempts += 1;
    if (this.transientDeleteFailuresRemaining > 0) {
      this.transientDeleteFailuresRemaining -= 1;
      throw Object.assign(new Error("temporarily unavailable"), { status: 503 });
    }
    if (this.retainDeletedObjects) return objectNames.length;
    let deleted = 0;
    for (const objectName of objectNames) {
      const slash = objectName.lastIndexOf("/");
      const prefix = slash < 0 ? "" : objectName.slice(0, slash);
      const name = slash < 0 ? objectName : objectName.slice(slash + 1);
      const entries = this.storage[bucket][prefix] ?? [];
      if (
        !this.missingObjectNames.has(objectName) &&
        entries.some((entry) => entry.name === name && entry.id !== null)
      ) {
        deleted += 1;
      }
      this.storage[bucket][prefix] = entries.filter((entry) => entry.name !== name);
      if (this.storage[bucket][prefix]?.length === 0) delete this.storage[bucket][prefix];
    }
    pruneFolders(this.storage[bucket]);
    return deleted;
  }
}

function pageSlice<T>(rows: T[], pageIndex: number, pageSize: number): T[] {
  return rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
}

function pruneFolders(storage: Record<string, ProductDataResetStorageEntry[]>): void {
  for (const [prefix, entries] of Object.entries(storage)) {
    storage[prefix] = entries.filter((entry) => {
      if (entry.id !== null) return true;
      const child = prefix ? `${prefix}/${entry.name}` : entry.name;
      return Object.keys(storage).some(
        (candidate) => candidate === child || candidate.startsWith(`${child}/`),
      );
    });
    if (storage[prefix]?.length === 0) delete storage[prefix];
  }
}
