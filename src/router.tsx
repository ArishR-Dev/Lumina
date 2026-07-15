import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Warm route chunks + loader data on link hover / focus so navigation
    // feels instant. Query owns cache freshness (staleTime: 0).
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    defaultPreloadStaleTime: 0,
    // Scroll restore inside the app-shell scroller, not window.
    scrollRestoration: true,
    scrollToTopSelectors: ["#main-content"],
    // If a transition takes longer than 150ms, show the pending UI
    // instead of leaving the previous page visible.
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
  });

  return router;
};
