export async function bootstrapAuthAwareBrowserApplication({
  initializeRuntimeConfig,
  initializeRecoveryCoordinator,
  hydrate,
}: {
  initializeRuntimeConfig: () => Promise<unknown>;
  initializeRecoveryCoordinator: () => Promise<unknown>;
  hydrate: () => void;
}): Promise<void> {
  await initializeRuntimeConfig();
  await initializeRecoveryCoordinator();
  hydrate();
}
