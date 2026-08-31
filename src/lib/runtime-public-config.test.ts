import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getInitializedRuntimePublicConfig,
  getOptionalInitializedRuntimePublicConfig,
  initializeRuntimePublicConfig,
  resetRuntimePublicConfigForTests,
  RuntimePublicConfigurationError,
} from "./runtime-public-config";
import { readRuntimePublicConfig } from "./runtime-public-config.server";

afterEach(() => {
  resetRuntimePublicConfigForTests();
});

describe("runtime public configuration", () => {
  it("exposes an optional read for components waiting on root initialization", () => {
    expect(getOptionalInitializedRuntimePublicConfig()).toBeNull();
  });

  it("validates server environment settings without exposing a service-role key", () => {
    expect(
      readRuntimePublicConfig({
        BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
        SUPABASE_URL: "https://project.supabase.co/",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-key",
        BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: "false",
      }),
    ).toEqual({
      environment: "uat",
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_browser-key",
      classifierAssistedUploadEnabled: false,
    });

    expect(() =>
      readRuntimePublicConfig({
        BAZORIA_DEPLOYMENT_ENVIRONMENT: "production",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_secret_server-key",
        BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: "false",
      }),
    ).toThrow("runtime_public_configuration_invalid");
  });

  it("allows local development to default the disabled classifier flag", () => {
    expect(
      readRuntimePublicConfig({
        BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_PUBLISHABLE_KEY: "local-anon-key",
      }).classifierAssistedUploadEnabled,
    ).toBe(false);
  });

  it("requires the classifier gate to be explicitly disabled in deployed environments", () => {
    for (const classifierSetting of [undefined, "true"] as const) {
      expect(() =>
        readRuntimePublicConfig({
          BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
          SUPABASE_URL: "https://project.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-key",
          BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: classifierSetting,
        }),
      ).toThrow("runtime_public_configuration_invalid");
    }
  });

  it("rejects nonblank classifier integration variables in deployed environments", () => {
    for (const [name, value] of [
      ["BAZORIA_CLASSIFIER_API_BASE_URL", "https://classifier.example.com"],
      ["BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID", "00000000-0000-0000-0000-000000000001"],
      ["BAZORIA_DEFAULT_SELLER_ID", "00000000-0000-0000-0000-000000000002"],
    ] as const) {
      expect(() =>
        readRuntimePublicConfig({
          BAZORIA_DEPLOYMENT_ENVIRONMENT: "production",
          SUPABASE_URL: "https://project.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-key",
          BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: "false",
          [name]: value,
        }),
      ).toThrow(name);
    }

    expect(
      readRuntimePublicConfig({
        BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-key",
        BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: "false",
        BAZORIA_CLASSIFIER_API_BASE_URL: "   ",
      }).classifierAssistedUploadEnabled,
    ).toBe(false);
  });

  it("coalesces concurrent browser requests and stores the validated result", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        environment: "uat",
        supabaseUrl: "https://project.supabase.co",
        supabasePublishableKey: "sb_publishable_browser-key",
        classifierAssistedUploadEnabled: false,
      }),
    );

    const [first, second] = await Promise.all([
      initializeRuntimePublicConfig(fetchImplementation),
      initializeRuntimePublicConfig(fetchImplementation),
    ]);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(getInitializedRuntimePublicConfig()).toBe(first);
  });

  it("keeps a malformed response in a stable unavailable state without retrying", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({ environment: "uat" }));

    await expect(initializeRuntimePublicConfig(fetchImplementation)).rejects.toBeInstanceOf(
      RuntimePublicConfigurationError,
    );
    await expect(initializeRuntimePublicConfig(fetchImplementation)).rejects.toBeInstanceOf(
      RuntimePublicConfigurationError,
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(() => getInitializedRuntimePublicConfig()).toThrow(RuntimePublicConfigurationError);
  });
});
