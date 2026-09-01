export interface PasswordRecoveryAuthClient {
  updateUser(attributes: { password: string }): Promise<{ error: unknown }>;
  signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
}

export type PasswordRecoveryCompletionResult =
  { status: "completed" } | { status: "update_failed" } | { status: "sign_out_failed" };

export type PasswordRecoverySignOutResult = { status: "completed" } | { status: "sign_out_failed" };

export async function completePasswordRecovery({
  auth,
  password,
  clearRecoveryState,
}: {
  auth: PasswordRecoveryAuthClient;
  password: string;
  clearRecoveryState: () => void;
}): Promise<PasswordRecoveryCompletionResult> {
  try {
    const update = await auth.updateUser({ password });
    if (update.error) return { status: "update_failed" };
  } catch {
    return { status: "update_failed" };
  }

  return finishPasswordRecoverySignOut({ auth, clearRecoveryState });
}

export async function finishPasswordRecoverySignOut({
  auth,
  clearRecoveryState,
}: {
  auth: Pick<PasswordRecoveryAuthClient, "signOut">;
  clearRecoveryState: () => void;
}): Promise<PasswordRecoverySignOutResult> {
  try {
    const signOut = await auth.signOut({ scope: "local" });
    if (signOut.error) return { status: "sign_out_failed" };
  } catch {
    return { status: "sign_out_failed" };
  }

  clearRecoveryState();
  return { status: "completed" };
}
