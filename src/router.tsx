import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultViewTransition: false,
    // Start a page's data on hover or touch, so it is usually ready when the transition reveals it.
    // Loaders call server functions directly (no query cache), so a preload must stay usable for the click.
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
