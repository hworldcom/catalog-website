import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { readdirSync } from "node:fs";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

function serverFunctionWarmup(): Plugin {
  return {
    name: "bazoria:server-function-warmup",
    apply: "serve",
    configureServer(server) {
      const sourceFiles = readdirSync(new URL("./src", import.meta.url), {
        encoding: "utf8",
        recursive: true,
      })
        .filter((file) => file.endsWith(".functions.ts"))
        .sort();

      let warmupPromise: Promise<void> | undefined;

      server.middlewares.use(async (_request, _response, next) => {
        warmupPromise ??= (async () => {
          for (const sourceFile of sourceFiles) {
            await server.environments.client.warmupRequest(
              `/src/${sourceFile.replaceAll("\\", "/")}`,
            );
          }

          await server.environments.client.waitForRequestsIdle();
        })();

        try {
          await warmupPromise;
          next();
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      server: {
        entry: "server",
      },
    }),
    ...(command === "build"
      ? nitro({
          preset: "node-server",
          rolldownConfig: {
            // The Google client is CommonJS and relies on __dirname. Keep it in
            // its native package form for the Node runtime instead of rewriting
            // it into a Nitro ECMAScript module chunk.
            external: [/^@google-cloud\/tasks(?:\/.*)?$/],
          },
        })
      : []),
    react(),
    serverFunctionWarmup(),
  ],
  css: {
    transformer: "lightningcss",
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },
  server: {
    host: "::",
    port: 8080,
  },
}));
