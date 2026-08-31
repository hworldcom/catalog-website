import { describe, expect, it, vi } from "vitest";

import { CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE } from "@/features/classifier-release/classifier-assisted-upload";

import { loadEnabledClassifierImportWorkerConfig } from "./classifier-import.worker-process";

describe("classifier import worker process", () => {
  it("refuses disabled startup before loading classifier configuration", async () => {
    const loadConfigReader = vi.fn();

    await expect(
      loadEnabledClassifierImportWorkerConfig(
        {
          BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
          BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: "false",
        },
        loadConfigReader,
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE,
    });
    expect(loadConfigReader).not.toHaveBeenCalled();
  });
});
