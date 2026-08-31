import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { DatabaseToolingError } from "./database-tooling.mjs";
import {
  validateInventoryAgainstTarget,
  verifyHostedDeploymentFoundation,
} from "./deployment-bootstrap.mjs";
import { loadDeploymentEnvironmentInventory } from "./deployment-inventory.mjs";

const PRIVATE_BUCKETS = Object.freeze(["product-draft-images", "seller-profile-images"]);
const PUBLIC_BUCKET = "product-images";
const ALL_BUCKETS = Object.freeze([...PRIVATE_BUCKETS, PUBLIC_BUCKET]);
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
const OPERATION_TIMEOUT_MS = 10_000;

export async function runStorageSmoke(target, confirmation, dependencies = {}) {
  if (confirmation !== target.projectRef) {
    throw new DatabaseToolingError(
      "supabase_storage_smoke_confirmation_mismatch",
      "Storage smoke confirmation does not match the selected project.",
    );
  }

  const inventory =
    dependencies.inventory ?? loadDeploymentEnvironmentInventory(target.environment);
  validateInventoryAgainstTarget(inventory, target);
  const verifyFoundation = dependencies.verifyFoundation ?? verifyHostedDeploymentFoundation;
  await verifyFoundation(target, { ...dependencies, inventory });

  const gateway =
    dependencies.gateway ??
    new SupabaseStorageSmokeGateway({
      supabaseUrl: target.supabaseUrl,
      publishableKey: target.publishableKey,
      serviceRoleKey: target.serviceRoleKey,
      request: dependencies.request,
    });
  const requestId = dependencies.requestId ?? randomUUID();
  const sleep =
    dependencies.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const output = dependencies.output ?? ((line) => process.stdout.write(`${line}\n`));

  return executeStorageSmoke({
    environment: target.environment,
    gateway,
    output,
    requestId,
    sleep,
  });
}

export class SupabaseStorageSmokeGateway {
  constructor({ supabaseUrl, publishableKey, serviceRoleKey, request = fetch }) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/u, "");
    this.request = timedRequest(request);
    const common = {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { fetch: this.request },
    };
    this.publishable = createClient(this.supabaseUrl, publishableKey, common);
    this.service = createClient(this.supabaseUrl, serviceRoleKey, common);
  }

  async createSignedUpload(bucket, objectKey) {
    const { data, error } = await this.service.storage
      .from(bucket)
      .createSignedUploadUrl(objectKey, { upsert: false });
    assertStorageResult(error, "supabase_storage_signed_upload_creation_failed");
    if (!data?.token) {
      throw new DatabaseToolingError(
        "supabase_storage_signed_upload_creation_failed",
        "Storage did not return a signed-upload token.",
      );
    }
    return data.token;
  }

  async uploadWithSignedToken(bucket, objectKey, token, bytes) {
    const { error } = await this.publishable.storage
      .from(bucket)
      .uploadToSignedUrl(objectKey, token, bytes, {
        contentType: "image/png",
        upsert: false,
      });
    assertStorageResult(error, "supabase_storage_signed_upload_failed");
  }

  async createSignedRead(bucket, objectKey, expiresInSeconds) {
    const { data, error } = await this.service.storage
      .from(bucket)
      .createSignedUrl(objectKey, expiresInSeconds);
    assertStorageResult(error, "supabase_storage_signed_read_creation_failed");
    if (!data?.signedUrl) {
      throw new DatabaseToolingError(
        "supabase_storage_signed_read_creation_failed",
        "Storage did not return a signed-read URL.",
      );
    }
    return data.signedUrl;
  }

  async readUrl(url) {
    const response = await this.request(url, { cache: "no-store" });
    return {
      ok: response.ok,
      bytes: response.ok ? new Uint8Array(await response.arrayBuffer()) : null,
    };
  }

  async serviceUpload(bucket, objectKey, bytes) {
    const { error } = await this.service.storage.from(bucket).upload(objectKey, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    assertStorageResult(error, "supabase_storage_service_upload_failed");
  }

  publicUrl(bucket, objectKey) {
    return this.service.storage.from(bucket).getPublicUrl(objectKey).data.publicUrl;
  }

  async anonymousUploadIsDenied(bucket, objectKey, bytes) {
    const { error } = await this.publishable.storage.from(bucket).upload(objectKey, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    return Boolean(error);
  }

  async publicReadIsDenied(bucket, objectKey) {
    const response = await this.request(
      `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${encodeObjectKey(objectKey)}`,
      { cache: "no-store" },
    );
    return !response.ok;
  }

  async remove(bucket, objectKeys) {
    const { error } = await this.service.storage.from(bucket).remove(objectKeys);
    assertStorageResult(error, "supabase_storage_smoke_cleanup_failed");
  }

  async objectIsMissing(bucket, objectKey) {
    const { data, error } = await this.service.storage.from(bucket).download(objectKey);
    return Boolean(error) && !data;
  }
}

async function executeStorageSmoke({ environment, gateway, output, requestId, sleep }) {
  const createdObjects = new Map(ALL_BUCKETS.map((bucket) => [bucket, new Set()]));
  let operationError;

  try {
    for (const bucket of PRIVATE_BUCKETS) {
      const objectKey = smokeObjectKey(requestId, bucket, "signed");
      createdObjects.get(bucket).add(objectKey);
      const token = await gateway.createSignedUpload(bucket, objectKey);
      await gateway.uploadWithSignedToken(bucket, objectKey, token, PNG_BYTES);
      const signedRead = await gateway.createSignedRead(bucket, objectKey, 1);
      assertBytes(await gateway.readUrl(signedRead));
      if (!(await gateway.publicReadIsDenied(bucket, objectKey))) {
        throw new DatabaseToolingError(
          "supabase_private_storage_publicly_readable",
          `${bucket} allowed an unsigned public read.`,
        );
      }
      await sleep(2_100);
      if ((await gateway.readUrl(signedRead)).ok) {
        throw new DatabaseToolingError(
          "supabase_storage_signed_read_did_not_expire",
          `${bucket} accepted an expired signed read.`,
        );
      }
      output(`storage_private_bucket=${bucket}:verified`);
    }

    const publicObjectKey = smokeObjectKey(requestId, PUBLIC_BUCKET, "service");
    createdObjects.get(PUBLIC_BUCKET).add(publicObjectKey);
    await gateway.serviceUpload(PUBLIC_BUCKET, publicObjectKey, PNG_BYTES);
    assertBytes(await gateway.readUrl(gateway.publicUrl(PUBLIC_BUCKET, publicObjectKey)));
    output(`storage_public_bucket=${PUBLIC_BUCKET}:verified`);

    for (const bucket of ALL_BUCKETS) {
      const deniedObjectKey = smokeObjectKey(requestId, bucket, "anonymous-denied");
      if (!(await gateway.anonymousUploadIsDenied(bucket, deniedObjectKey, PNG_BYTES))) {
        createdObjects.get(bucket).add(deniedObjectKey);
        throw new DatabaseToolingError(
          "supabase_browser_storage_write_allowed",
          `${bucket} allowed a publishable-key write.`,
        );
      }
      output(`storage_publishable_write=${bucket}:denied`);
    }
  } catch (error) {
    operationError = error;
  }

  let cleanupError;
  for (const [bucket, objectKeys] of createdObjects) {
    if (objectKeys.size === 0) continue;
    try {
      await gateway.remove(bucket, [...objectKeys]);
      for (const objectKey of objectKeys) {
        if (!(await gateway.objectIsMissing(bucket, objectKey))) {
          throw new DatabaseToolingError(
            "supabase_storage_smoke_cleanup_failed",
            `Cleanup verification failed for ${environment} ${bucket} ${objectKey}.`,
          );
        }
      }
    } catch (error) {
      cleanupError ??= error;
    }
  }

  if (cleanupError) {
    if (cleanupError instanceof DatabaseToolingError) throw cleanupError;
    throw new DatabaseToolingError(
      "supabase_storage_smoke_cleanup_failed",
      `Storage smoke cleanup failed for ${environment}.`,
      { cause: cleanupError },
    );
  }
  if (operationError) throw operationError;

  output(`storage_cleanup=${environment}:verified`);
  return { environment, requestId, buckets: [...ALL_BUCKETS] };
}

function smokeObjectKey(requestId, bucket, purpose) {
  return `deployment-smoke/${requestId}/${bucket}-${purpose}.png`;
}

function assertBytes(result) {
  if (!result.ok || !result.bytes || digest(result.bytes) !== digest(PNG_BYTES)) {
    throw new DatabaseToolingError(
      "supabase_storage_smoke_content_mismatch",
      "Storage smoke bytes did not match the uploaded object.",
    );
  }
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertStorageResult(error, reason) {
  if (error) throw new DatabaseToolingError(reason, "Supabase storage operation failed.");
}

function encodeObjectKey(objectKey) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

function timedRequest(request) {
  return (input, init = {}) =>
    request(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(OPERATION_TIMEOUT_MS),
    });
}
