import { z } from "zod";

export type PrototypeAdministratorErrorCode =
  "prototype_administrator_required" | "prototype_administrator_configuration_invalid";

export class PrototypeAdministratorError extends Error {
  constructor(
    public readonly statusCode: 403 | 500,
    public readonly code: PrototypeAdministratorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PrototypeAdministratorError";
  }
}

const userIdSchema = z.string().uuid();

export function readPrototypeAdministratorUserIds(
  value = process.env.BAZORIA_PROTOTYPE_ADMIN_USER_IDS,
): ReadonlySet<string> {
  if (!value?.trim()) return new Set();

  const userIds = value.split(",").map((userId) => userId.trim());
  if (userIds.some((userId) => userId.length === 0)) {
    throw invalidConfiguration();
  }

  const parsed = z.array(userIdSchema).safeParse(userIds);
  if (!parsed.success) throw invalidConfiguration();
  return new Set(parsed.data);
}

export function isPrototypeAdministrator(
  userId: string,
  administratorUserIds: ReadonlySet<string>,
): boolean {
  return administratorUserIds.has(userId);
}

export function assertPrototypeAdministrator(
  userId: string,
  administratorUserIds = readPrototypeAdministratorUserIds(),
): void {
  if (!isPrototypeAdministrator(userId, administratorUserIds)) {
    throw new PrototypeAdministratorError(
      403,
      "prototype_administrator_required",
      "Prototype administrator access is required.",
    );
  }
}

function invalidConfiguration(): PrototypeAdministratorError {
  return new PrototypeAdministratorError(
    500,
    "prototype_administrator_configuration_invalid",
    "Prototype administrator access is not configured correctly.",
  );
}
