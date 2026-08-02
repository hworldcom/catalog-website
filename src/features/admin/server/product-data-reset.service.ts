export const PRODUCT_DATA_RESET_BUCKETS = ["product-images", "product-draft-images"] as const;

export type PreservedIdentitySnapshot = {
  projectRef: string;
  authUserIds: string[];
  userRoles: Array<{ user_id: string; role: string }>;
  sellers: Array<{
    id: string;
    owner_id: string | null;
    name: string;
    slug: string;
    company_code: string;
    company_code_locked_at: string | null;
  }>;
};

export type ProductDataResetStorageEntry = {
  name: string;
  id: string | null;
};

export interface ProductDataResetGateway {
  listAuthUserIds(page: number, pageSize: number): Promise<string[]>;
  listUserRoles(
    offset: number,
    pageSize: number,
  ): Promise<Array<{ user_id: string; role: string }>>;
  listSellers(offset: number, pageSize: number): Promise<PreservedIdentitySnapshot["sellers"]>;
  listStorageEntries(
    bucket: (typeof PRODUCT_DATA_RESET_BUCKETS)[number],
    prefix: string,
    offset: number,
    pageSize: number,
  ): Promise<ProductDataResetStorageEntry[]>;
  removeStorageObjects(
    bucket: (typeof PRODUCT_DATA_RESET_BUCKETS)[number],
    objectNames: string[],
  ): Promise<number>;
}

export type ProductDataResetSummary = {
  projectRef: string;
  status: "prepared" | "verified" | "failed";
  buckets: Record<
    (typeof PRODUCT_DATA_RESET_BUCKETS)[number],
    { scanned: number; deleted: number; missing: number; failed: number }
  >;
  errorCode: string | null;
};

export class ProductDataResetService {
  constructor(
    private readonly gateway: ProductDataResetGateway,
    private readonly projectRef: string,
    private readonly qaUserIds: string[],
    private readonly pageSize: number,
  ) {}

  async captureSnapshot(): Promise<PreservedIdentitySnapshot> {
    const authUserIds = await collectPages((page) =>
      this.gateway.listAuthUserIds(page, this.pageSize),
    );
    const userRoles = await collectOffsetPages((offset) =>
      this.gateway.listUserRoles(offset, this.pageSize),
    );
    const sellers = await collectOffsetPages((offset) =>
      this.gateway.listSellers(offset, this.pageSize),
    );

    const snapshot = canonicalSnapshot({
      projectRef: this.projectRef,
      authUserIds,
      userRoles,
      sellers,
    });
    assertQaUsers(snapshot, this.qaUserIds);
    return snapshot;
  }

  async cleanStorage(): Promise<ProductDataResetSummary> {
    const summary = emptySummary(this.projectRef, "prepared");
    try {
      for (const bucket of PRODUCT_DATA_RESET_BUCKETS) {
        const objectNames = await this.listAllObjectNames(bucket);
        summary.buckets[bucket].scanned = objectNames.length;

        for (let index = 0; index < objectNames.length; index += this.pageSize) {
          const batch = objectNames.slice(index, index + this.pageSize);
          try {
            const deleted = await retryTransient(() =>
              this.gateway.removeStorageObjects(bucket, batch),
            );
            if (!Number.isInteger(deleted) || deleted < 0 || deleted > batch.length) {
              throw new Error("product_data_reset_storage_delete_response_invalid");
            }
            summary.buckets[bucket].deleted += deleted;
            summary.buckets[bucket].missing += batch.length - deleted;
          } catch {
            summary.buckets[bucket].failed += batch.length;
            throw new Error("product_data_reset_storage_delete_failed");
          }
        }

        const remaining = await this.listAllObjectNames(bucket);
        if (remaining.length > 0) {
          summary.buckets[bucket].failed += remaining.length;
          throw new Error("product_data_reset_storage_not_empty");
        }
      }
      return summary;
    } catch (error) {
      summary.status = "failed";
      summary.errorCode = errorCode(error);
      throw new ProductDataResetFailure(summary);
    }
  }

  async verifySnapshot(expected: PreservedIdentitySnapshot): Promise<ProductDataResetSummary> {
    if (expected.projectRef !== this.projectRef) {
      throw new ProductDataResetFailure({
        ...emptySummary(this.projectRef, "failed"),
        errorCode: "product_data_reset_snapshot_project_mismatch",
      });
    }

    const actual = await this.captureSnapshot();
    if (JSON.stringify(canonicalSnapshot(expected)) !== JSON.stringify(actual)) {
      throw new ProductDataResetFailure({
        ...emptySummary(this.projectRef, "failed"),
        errorCode: "product_data_reset_preserved_identity_mismatch",
      });
    }

    const summary = emptySummary(this.projectRef, "verified");
    for (const bucket of PRODUCT_DATA_RESET_BUCKETS) {
      const remaining = await this.listAllObjectNames(bucket);
      summary.buckets[bucket].scanned = remaining.length;
      if (remaining.length > 0) {
        summary.status = "failed";
        summary.buckets[bucket].failed = remaining.length;
        summary.errorCode = "product_data_reset_storage_not_empty";
        throw new ProductDataResetFailure(summary);
      }
    }
    return summary;
  }

  private async listAllObjectNames(
    bucket: (typeof PRODUCT_DATA_RESET_BUCKETS)[number],
  ): Promise<string[]> {
    const objects: string[] = [];
    const prefixes = [""];
    while (prefixes.length > 0) {
      const prefix = prefixes.shift()!;
      let offset = 0;
      while (true) {
        const entries = await retryTransient(() =>
          this.gateway.listStorageEntries(bucket, prefix, offset, this.pageSize),
        );
        for (const entry of entries) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.id === null) prefixes.push(path);
          else objects.push(path);
        }
        if (entries.length < this.pageSize) break;
        offset += entries.length;
      }
    }
    return [...new Set(objects)].sort();
  }
}

export class ProductDataResetFailure extends Error {
  constructor(public readonly summary: ProductDataResetSummary) {
    super(summary.errorCode ?? "product_data_reset_failed");
    this.name = "ProductDataResetFailure";
  }
}

function emptySummary(
  projectRef: string,
  status: ProductDataResetSummary["status"],
): ProductDataResetSummary {
  return {
    projectRef,
    status,
    buckets: {
      "product-images": { scanned: 0, deleted: 0, missing: 0, failed: 0 },
      "product-draft-images": { scanned: 0, deleted: 0, missing: 0, failed: 0 },
    },
    errorCode: null,
  };
}

function canonicalSnapshot(snapshot: PreservedIdentitySnapshot): PreservedIdentitySnapshot {
  return {
    projectRef: snapshot.projectRef,
    authUserIds: [...snapshot.authUserIds].sort(),
    userRoles: snapshot.userRoles
      .map((row) => ({ ...row }))
      .sort((left, right) =>
        `${left.user_id}:${left.role}`.localeCompare(`${right.user_id}:${right.role}`),
      ),
    sellers: snapshot.sellers
      .map((row) => ({ ...row }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function assertQaUsers(snapshot: PreservedIdentitySnapshot, qaUserIds: string[]): void {
  const users = new Set(snapshot.authUserIds);
  const roleUsers = new Set(snapshot.userRoles.map((row) => row.user_id));
  for (const userId of qaUserIds) {
    if (!users.has(userId) || !roleUsers.has(userId)) {
      throw new Error("product_data_reset_qa_user_unresolved");
    }
  }
}

async function collectPages<T>(load: (page: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page += 1) {
    const selected = await load(page);
    rows.push(...selected);
    if (selected.length === 0) return rows;
  }
}

async function collectOffsetPages<T>(load: (offset: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset = rows.length) {
    const selected = await load(offset);
    rows.push(...selected);
    if (selected.length === 0) return rows;
  }
}

async function retryTransient<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  throw lastError;
}

function isTransient(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (typeof error !== "object" || error === null) return false;
  const status = "status" in error ? Number(error.status) : Number.NaN;
  return status === 408 || status === 429 || status >= 500;
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "product_data_reset_failed";
}
