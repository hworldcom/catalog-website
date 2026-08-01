import { z } from "zod";

import { delegatedActionConfigurationInvalid } from "../delegated-classifier-review-import.types";

export type DelegatedAdministratorActionConfig = {
  actionTimeoutMs: number;
  leaseTimeoutSeconds: number;
};

const integerText = z.string().regex(/^[1-9][0-9]*$/);

export function readDelegatedAdministratorActionConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DelegatedAdministratorActionConfig {
  const actionTimeoutSeconds = parseInteger(
    environment.BAZORIA_DELEGATED_ADMIN_ACTION_TIMEOUT_SECONDS ?? "30",
  );
  const leaseTimeoutSeconds = parseInteger(
    environment.BAZORIA_DELEGATED_ADMIN_ACTION_LEASE_TIMEOUT_SECONDS ?? "120",
  );

  if (
    actionTimeoutSeconds < 1 ||
    actionTimeoutSeconds > 300 ||
    leaseTimeoutSeconds < 31 ||
    leaseTimeoutSeconds > 900 ||
    leaseTimeoutSeconds < actionTimeoutSeconds + 30
  ) {
    throw delegatedActionConfigurationInvalid();
  }

  return {
    actionTimeoutMs: actionTimeoutSeconds * 1_000,
    leaseTimeoutSeconds,
  };
}

function parseInteger(value: string): number {
  const result = integerText.safeParse(value);
  if (!result.success) throw delegatedActionConfigurationInvalid();
  const parsed = Number(result.data);
  if (!Number.isSafeInteger(parsed)) throw delegatedActionConfigurationInvalid();
  return parsed;
}
