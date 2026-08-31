import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  initializeRuntimePublicConfig,
  resetRuntimePublicConfigForTests,
} from "@/lib/runtime-public-config";

import {
  ClassifierAssistedUploadDisabledNotice,
  UatEnvironmentBadge,
} from "./classifier-release-ui";

afterEach(() => resetRuntimePublicConfigForTests());

describe("classifier release presentation", () => {
  it("mounts the global UAT badge only after runtime configuration is available", async () => {
    await initialize("uat");
    render(<UatEnvironmentBadge />);

    expect(await screen.findByLabelText("User acceptance testing environment")).toHaveTextContent(
      "UAT",
    );
  });

  it("does not render an environment badge in production", async () => {
    await initialize("production");
    render(<UatEnvironmentBadge />);

    expect(screen.queryByLabelText("User acceptance testing environment")).not.toBeInTheDocument();
  });

  it("renders the stable disabled notice only for its matching notice key", () => {
    const { rerender } = render(<ClassifierAssistedUploadDisabledNotice notice="other" />);
    expect(screen.queryByText("Classifier-assisted uploads unavailable")).not.toBeInTheDocument();

    rerender(
      <ClassifierAssistedUploadDisabledNotice notice="classifier_assisted_upload_disabled" />,
    );
    expect(screen.getByText("Classifier-assisted uploads unavailable")).toBeVisible();
    expect(
      screen.getByText("Classifier-assisted uploads are unavailable in this environment."),
    ).toBeVisible();
  });
});

async function initialize(environment: "uat" | "production"): Promise<void> {
  await initializeRuntimePublicConfig(async () =>
    Response.json({
      environment,
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_browser-key",
      classifierAssistedUploadEnabled: false,
      canonicalSiteOrigin:
        environment === "uat" ? "https://uat2026.bazoria.pl" : "https://bazoria.pl",
      googleSignInEnabled: false,
    }),
  );
}
