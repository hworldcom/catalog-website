import { describe, expect, it } from "vitest";

import {
  ClassifierAssistedUploadDisabledError,
  CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE,
  CLASSIFIER_ASSISTED_UPLOAD_DISABLED_MESSAGE,
} from "../classifier-assisted-upload";
import {
  assertClassifierAssistedUploadEnabled,
  classifierAssistedUploadGateResponse,
} from "./classifier-assisted-upload-gate";

describe("classifier-assisted upload server gate", () => {
  it("throws the shared typed 503 outcome before disabled work can run", () => {
    expect(() => assertClassifierAssistedUploadEnabled(environment("false"))).toThrowError(
      expect.objectContaining({
        statusCode: 503,
        code: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE,
        message: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_MESSAGE,
      }),
    );
    expect(() => assertClassifierAssistedUploadEnabled(environment("false"))).toThrow(
      ClassifierAssistedUploadDisabledError,
    );
  });

  it("returns the exact no-store HTTP response for disabled handlers", async () => {
    const response = classifierAssistedUploadGateResponse(environment("false"));

    expect(response?.status).toBe(503);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    await expect(response?.json()).resolves.toEqual({
      code: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE,
      message: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_MESSAGE,
    });
  });

  it("allows explicitly enabled local development", () => {
    expect(classifierAssistedUploadGateResponse(environment("true"))).toBeNull();
  });
});

function environment(
  classifierAssistedUploadEnabled: "true" | "false",
): Record<string, string | undefined> {
  return {
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
    BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: classifierAssistedUploadEnabled,
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_PUBLISHABLE_KEY: "local-anon-key",
  };
}
