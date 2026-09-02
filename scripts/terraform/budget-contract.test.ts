import { describe, expect, it } from "vitest";

import {
  runBudgetPreflight,
  validateNotificationChannelMetadata,
  validateReviewedBudgetInput,
} from "./budget-preflight.mjs";
import { validateBudgetContract, validateBudgetSource } from "./budget-contract.mjs";

const validInput = {
  billing_account_id: "014CA9-692646-D9E4CE",
  currency_code: "PLN",
  environment: "uat",
  monthly_amount: 100,
  notification_channel_names: [
    "projects/bazoria-uat-lnlabs/notificationChannels/uat-email",
  ],
  project_id: "bazoria-uat-lnlabs",
  project_number: "145571383840",
};

describe("operator-managed billing budget contract", () => {
  it("validates isolated informational budgets", () => {
    expect(validateBudgetContract()).toEqual({
      environments: ["uat", "production"],
      operatorManaged: true,
      thresholds: [0.5, 0.8, 1],
    });
  });

  it("accepts a verified, enabled email channel without returning its name", () => {
    const result = runBudgetPreflight(validInput, (name) => ({
      enabled: true,
      name,
      type: "email",
      verificationStatus: "VERIFIED",
    }));

    expect(result).toEqual({
      channelCount: 1,
      environment: "uat",
      projectId: "bazoria-uat-lnlabs",
      status: "passed",
    });
    expect(JSON.stringify(result)).not.toContain("notificationChannels");
  });

  it("rejects non-email, unverified, and disabled channels", () => {
    const metadata = {
      enabled: true,
      name: validInput.notification_channel_names[0],
      type: "email",
      verificationStatus: "VERIFIED",
    };
    expect(() => validateNotificationChannelMetadata({ ...metadata, type: "sms" }, metadata.name))
      .toThrow("type must be email");
    expect(() =>
      validateNotificationChannelMetadata(
        { ...metadata, verificationStatus: "UNVERIFIED" },
        metadata.name,
      ),
    ).toThrow("must be verified");
    expect(() =>
      validateNotificationChannelMetadata({ ...metadata, enabled: false }, metadata.name),
    ).toThrow("must be enabled");
  });

  it("rejects wrong environment identity, invalid amounts, and cross-project channels", () => {
    expect(() =>
      validateReviewedBudgetInput({ ...validInput, project_number: "787649115343" }),
    ).toThrow("project_number differs");
    expect(() => validateReviewedBudgetInput({ ...validInput, monthly_amount: -1 })).toThrow(
      "greater than zero",
    );
    expect(() =>
      validateReviewedBudgetInput({
        ...validInput,
        notification_channel_names: [
          "projects/bazoria-prod-lnlabs/notificationChannels/prod-email",
        ],
      }),
    ).toThrow("reviewed project");
  });

  it("rejects an automated or recipient-bearing budget source", () => {
    expect(() => validateBudgetSource('pubsub_topic = "projects/test/topics/stop"')).toThrow();
    expect(() => validateBudgetSource('email_address = "operator@example.com"')).toThrow();
  });
});
