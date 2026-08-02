import { describe, expect, it } from "vitest";

import {
  PRODUCT_DATA_RESET_PROJECT_REF,
  projectRefFromUrl,
  readProductDataResetConfig,
} from "./product-data-reset.config";

const qaUserId = "00000000-0000-4000-8000-000000000001";

describe("product data reset configuration", () => {
  it("requires the hosted project and matching destructive confirmation", () => {
    const config = readProductDataResetConfig(
      {
        SUPABASE_URL: `https://${PRODUCT_DATA_RESET_PROJECT_REF}.supabase.co`,
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        BAZORIA_PRODUCT_RESET_QA_USER_IDS: qaUserId,
      },
      [
        "prepare",
        "--confirm-project-ref",
        PRODUCT_DATA_RESET_PROJECT_REF,
        "--snapshot",
        "/tmp/snapshot.json",
        "--summary",
        "/tmp/summary.json",
      ],
    );

    expect(config).toMatchObject({
      mode: "prepare",
      projectRef: PRODUCT_DATA_RESET_PROJECT_REF,
      qaUserIds: [qaUserId],
      pageSize: 100,
    });
  });

  it.each([
    [`https://wrongprojectref00000.supabase.co`, PRODUCT_DATA_RESET_PROJECT_REF],
    [`https://${PRODUCT_DATA_RESET_PROJECT_REF}.supabase.co`, "wrongprojectref00000"],
  ])("rejects project mismatch before cleanup", (supabaseUrl, confirmation) => {
    expect(() =>
      readProductDataResetConfig(
        {
          SUPABASE_URL: supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
          BAZORIA_PRODUCT_RESET_QA_USER_IDS: qaUserId,
        },
        [
          "prepare",
          "--confirm-project-ref",
          confirmation,
          "--snapshot",
          "/tmp/snapshot.json",
          "--summary",
          "/tmp/summary.json",
        ],
      ),
    ).toThrow("product_data_reset_project_confirmation_invalid");
  });

  it("rejects local and malformed Supabase URLs", () => {
    expect(() => projectRefFromUrl("http://127.0.0.1:54321")).toThrow(
      "product_data_reset_supabase_url_invalid",
    );
  });
});
