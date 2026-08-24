import { describe, expect, it } from "vitest";

import { LOCAL_PUBLIC_SITE_ORIGIN, resolvePublicSiteOrigin } from "./public-site-origin";

describe("resolvePublicSiteOrigin", () => {
  it("uses the local default only for the local Bazoria environment", () => {
    expect(resolvePublicSiteOrigin({ BAZORIA_DEPLOYMENT_ENVIRONMENT: "local" })).toBe(
      LOCAL_PUBLIC_SITE_ORIGIN,
    );
  });

  it("normalizes an explicit root origin", () => {
    expect(
      resolvePublicSiteOrigin({
        BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
        BAZORIA_PUBLIC_SITE_URL: " https://Catalog.Example:443/ ",
      }),
    ).toBe("https://catalog.example");
  });

  it.each(["uat", "production"] as const)(
    "requires an explicit HTTPS origin for %s",
    (deploymentEnvironment) => {
      expect(() =>
        resolvePublicSiteOrigin({
          BAZORIA_DEPLOYMENT_ENVIRONMENT: deploymentEnvironment,
        }),
      ).toThrow("BAZORIA_PUBLIC_SITE_URL is required");

      expect(() =>
        resolvePublicSiteOrigin({
          BAZORIA_DEPLOYMENT_ENVIRONMENT: deploymentEnvironment,
          BAZORIA_PUBLIC_SITE_URL: "http://catalog.example",
        }),
      ).toThrow("must use HTTPS");
    },
  );

  it.each([
    "https://user:password@catalog.example",
    "https://catalog.example/products",
    "https://catalog.example?source=test",
    "https://catalog.example?",
    "https://catalog.example#preview",
    "https://catalog.example#",
    "ftp://catalog.example",
    "not a url",
  ])("rejects an invalid public site value: %s", (publicSiteUrl) => {
    expect(() =>
      resolvePublicSiteOrigin({
        BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
        BAZORIA_PUBLIC_SITE_URL: publicSiteUrl,
      }),
    ).toThrow("public_site_configuration_invalid");
  });

  it("requires the Bazoria deployment identity", () => {
    expect(() => resolvePublicSiteOrigin({})).toThrow("BAZORIA_DEPLOYMENT_ENVIRONMENT");
  });
});
