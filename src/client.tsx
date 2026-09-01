import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

import { bootstrapAuthAwareBrowserApplication } from "@/features/auth/auth-recovery-bootstrap";
import { initializeAuthRecoveryCoordinator } from "@/features/auth/auth-recovery-coordinator";
import { initializeRuntimePublicConfig } from "@/lib/runtime-public-config";

void bootstrapAuthAwareBrowserApplication({
  initializeRuntimeConfig: initializeRuntimePublicConfig,
  initializeRecoveryCoordinator: initializeAuthRecoveryCoordinator,
  hydrate: () => {
    startTransition(() => {
      hydrateRoot(
        document,
        <StrictMode>
          <StartClient />
        </StrictMode>,
      );
    });
  },
}).catch(() => {
  renderConfigurationUnavailable();
});

function renderConfigurationUnavailable(): void {
  document.title = "Bazoria configuration unavailable";
  document.body.replaceChildren();

  const main = document.createElement("main");
  main.style.cssText =
    "min-height:100vh;display:grid;place-items:center;padding:2rem;font-family:system-ui,sans-serif";
  const content = document.createElement("div");
  content.style.cssText = "max-width:32rem;text-align:center";
  const heading = document.createElement("h1");
  heading.textContent = "Bazoria is temporarily unavailable";
  const message = document.createElement("p");
  message.textContent =
    "The application configuration could not be loaded. Please try again later.";
  content.append(heading, message);
  main.append(content);
  document.body.append(main);
}
