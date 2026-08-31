import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setResponseStatus: vi.fn() }));

vi.mock("@tanstack/react-start/server", () => ({
  setResponseStatus: mocks.setResponseStatus,
}));

import { requireClassifierAssistedUpload } from "./classifier-assisted-upload.middleware";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("classifier-assisted upload server-function middleware", () => {
  it("sets transport status 503 and preserves the stable typed error when disabled", async () => {
    vi.stubEnv("BAZORIA_DEPLOYMENT_ENVIRONMENT", "local");
    vi.stubEnv("BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED", "false");
    const next = vi.fn();

    await expect(runMiddleware(next)).rejects.toMatchObject({
      statusCode: 503,
      code: "classifier_assisted_upload_disabled",
      message: "Classifier-assisted uploads are unavailable in this environment.",
    });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("continues without changing response status when explicitly enabled locally", async () => {
    vi.stubEnv("BAZORIA_DEPLOYMENT_ENVIRONMENT", "local");
    vi.stubEnv("BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED", "true");
    const next = vi.fn().mockResolvedValue({ result: "continued" });

    await expect(runMiddleware(next)).resolves.toEqual({ result: "continued" });
    expect(mocks.setResponseStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});

function runMiddleware(next: () => Promise<unknown>): Promise<unknown> {
  const server = requireClassifierAssistedUpload.options.server as (context: {
    next: () => Promise<unknown>;
  }) => Promise<unknown>;
  return server({ next });
}
