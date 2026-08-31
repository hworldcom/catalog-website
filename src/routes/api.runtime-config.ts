import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/runtime-config")({
  server: {
    handlers: {
      GET: async () => {
        const { handleGetRuntimePublicConfig } =
          await import("@/features/runtime/server/runtime-public-config.http");
        return handleGetRuntimePublicConfig();
      },
    },
  },
});
