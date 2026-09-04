import { describe, expect, it } from "vitest";

import { fingerprint, normalizedPlan } from "./uat-runtime-release.mjs";

const inputs = {
  commit: "a".repeat(40),
  digest: `sha256:${"b".repeat(64)}`,
};

describe("UAT runtime release plan fingerprint", () => {
  it("normalizes resource changes by address", () => {
    const first = {
      format_version: "1.2",
      resource_changes: [
        { address: "z.resource", change: { actions: ["create"] } },
        { address: "a.resource", change: { actions: ["update"] } },
      ],
    };
    const second = {
      ...first,
      resource_changes: [...first.resource_changes].reverse(),
    };

    expect(normalizedPlan(first, inputs)).toBe(normalizedPlan(second, inputs));
  });

  it("changes when the selected immutable release changes", () => {
    const plan = { format_version: "1.2", resource_changes: [] };

    expect(fingerprint(plan, inputs)).not.toBe(
      fingerprint(plan, { ...inputs, digest: `sha256:${"c".repeat(64)}` }),
    );
  });
});
