import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock('@/lib/enkop.functions', () => ({ getProperties: vi.fn(async () => []), sendEnquiry: vi.fn() }));
vi.mock('@/lib/slides.functions', () => ({ getHomepageSlides: vi.fn(async () => []) }));
vi.mock('@/lib/content.functions', () => ({ getTestimonials: vi.fn(async () => []) }));

import { routeTree } from "@/routeTree.gen";

function routerAt(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: false,
  });
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Exercise the real route tree and loader contract without mounting an SSR document in a div.
describe("App routing", () => {
  it("loads homepage data through the index route", async () => {
    const router = routerAt('/');
    await router.load();
    const index = router.state.matches.find(match => match.routeId === '/');
    expect(index?.status).toBe('success');
    expect(index?.loaderData).toEqual({ properties: [], slides: [], quotes: [] });
  });

  it("renders the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const router = routerAt('/this-route-does-not-exist');
    await router.load();
    expect(router.state.matches.some(match => match._notFound || match.status === 'notFound')).toBe(true);
  });
});
