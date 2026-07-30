import type { SellerClassifierRegisteredUpload } from "./seller-classifier-workflow.types";

export const SELLER_CLASSIFIER_UPLOAD_CONCURRENCY = 4;

export type SellerClassifierDirectUploadStatus = "pending" | "uploading" | "uploaded" | "failed";

export type SellerClassifierDirectUpload = SellerClassifierRegisteredUpload & {
  file: File;
  status: SellerClassifierDirectUploadStatus;
  errorMessage: string | null;
};

export function validateSellerClassifierFiles(
  files: File[],
  limits: { maxFiles: number; maxFileSizeBytes: number },
): string | null {
  if (files.length < 1) return "Select at least one JPEG file.";
  if (files.length > limits.maxFiles) {
    return `Select at most ${limits.maxFiles} JPEG files.`;
  }
  for (const file of files) {
    if (file.type !== "image/jpeg") return `${file.name} must be a JPEG file.`;
    if (file.size < 1) return `${file.name} must not be empty.`;
    if (file.size > limits.maxFileSizeBytes) {
      return `${file.name} exceeds the ${formatBytes(limits.maxFileSizeBytes)} limit.`;
    }
  }
  return null;
}

export function prepareSellerClassifierDirectUploads(
  files: File[],
  registered: SellerClassifierRegisteredUpload[],
): SellerClassifierDirectUpload[] {
  if (files.length !== registered.length) throw invalidRegistration();
  const byOrder = new Map(registered.map((upload) => [upload.uploadOrder, upload]));
  if (
    byOrder.size !== files.length ||
    files.some((file, index) => {
      const upload = byOrder.get(index);
      return !upload || upload.originalFilename !== file.name;
    })
  ) {
    throw invalidRegistration();
  }

  return files.map((file, index) => ({
    ...byOrder.get(index)!,
    file,
    status: "pending",
    errorMessage: null,
  }));
}

export function prepareSellerClassifierRetryUploads(
  filesByImageId: ReadonlyMap<string, File>,
  registered: SellerClassifierRegisteredUpload[],
): SellerClassifierDirectUpload[] {
  if (
    registered.length !== filesByImageId.size ||
    new Set(registered.map((upload) => upload.imageId)).size !== registered.length
  ) {
    throw invalidRegistration();
  }

  return registered.map((upload) => {
    const file = filesByImageId.get(upload.imageId);
    if (!file || file.name !== upload.originalFilename) throw invalidRegistration();
    return {
      ...upload,
      file,
      status: "pending",
      errorMessage: null,
    };
  });
}

export async function uploadSellerClassifierFiles(
  uploads: SellerClassifierDirectUpload[],
  onUpdate: (upload: SellerClassifierDirectUpload) => void,
  fetchImplementation: typeof fetch = fetch,
): Promise<SellerClassifierDirectUpload[]> {
  const results = [...uploads];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < results.length) {
      const index = nextIndex;
      nextIndex += 1;
      const upload = results[index];
      if (!upload) continue;

      results[index] = { ...upload, status: "uploading", errorMessage: null };
      onUpdate(results[index]!);

      try {
        const response = await fetchImplementation(upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: upload.file,
        });
        if (!response.ok) throw new Error("Upload rejected.");
        results[index] = { ...upload, status: "uploaded", errorMessage: null };
      } catch {
        results[index] = {
          ...upload,
          status: "failed",
          errorMessage: "The file could not be uploaded.",
        };
      }
      onUpdate(results[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SELLER_CLASSIFIER_UPLOAD_CONCURRENCY, results.length) }, () =>
      worker(),
    ),
  );
  return results;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)} MiB`;
  }
  return `${bytes.toLocaleString()} bytes`;
}

function invalidRegistration(): Error {
  return new Error("The classifier returned invalid upload registration data.");
}
