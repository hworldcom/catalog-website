import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/version")({
  server: {
    handlers: {
      GET: async () => {
        const { handleGetVersion } = await import("@/features/runtime/server/runtime-probes.http");
        return handleGetVersion();
      },
    },
  },
});
