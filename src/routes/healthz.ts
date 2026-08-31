import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        const { handleGetHealth } = await import("@/features/runtime/server/runtime-probes.http");
        return handleGetHealth();
      },
    },
  },
});
