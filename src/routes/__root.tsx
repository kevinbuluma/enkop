import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SeasonalPageTransition } from '@/components/enkop/SeasonalPageTransition';
import { SeasonalAtmosphereController } from '@/components/enkop/storm/SeasonalAtmosphereController';
import { BrandLogo } from '@/components/enkop/BrandLogo';
import { siteUrl } from '@/lib/enkop';

const SHARE_IMAGE = siteUrl('/brand/enkop-og.jpg');

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <Link to="/" aria-label="ENKOP Real Estate home" className="mx-auto mb-10 block w-fit"><BrandLogo tone="dark" className="h-28 w-auto" /></Link>
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
       { title: "ENKOP Real Estate | Nairobi Property Consultancy" },
       { name: "description", content: "Buy, sell, rent and invest in residential property across Kenya with ENKOP Real Estate: honest advice, personalised guidance and market knowledge from a Nairobi-based consultancy." },
       { name: "author", content: "ENKOP Real Estate" },
       { property: "og:title", content: "ENKOP Real Estate | Nairobi Property Consultancy" },
       { property: "og:description", content: "Homes you can confidently call home, and investments made with clarity." },
       { property: "og:site_name", content: "ENKOP Real Estate" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: SHARE_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "ENKOP Real Estate logo" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: SHARE_IMAGE },
      { name: "theme-color", content: "#142b59" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/brand/enkop-icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
       { rel: "preconnect", href: "https://fonts.googleapis.com" },
       { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
       { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Scroll reveals start hidden and are shown by script; without it, show every section. */}
        <noscript><style>{'.reveal, .reveal > *, .reveal h2 { opacity: 1 !important; transform: none !important; filter: none !important; letter-spacing: normal !important; }'}</style></noscript>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SeasonalPageTransition />
      <SeasonalAtmosphereController />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
