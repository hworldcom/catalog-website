import "@fontsource/bodoni-moda/latin-400.css";
import "@fontsource/bodoni-moda/latin-500.css";
import "@fontsource/bodoni-moda/latin-600.css";
import "@fontsource/bodoni-moda/latin-700.css";
import "@fontsource/bodoni-moda/latin-ext-400.css";
import "@fontsource/bodoni-moda/latin-ext-500.css";
import "@fontsource/bodoni-moda/latin-ext-600.css";
import "@fontsource/bodoni-moda/latin-ext-700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
