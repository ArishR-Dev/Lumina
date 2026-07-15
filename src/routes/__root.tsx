import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PwaUpdatePrompt } from "../components/PwaUpdatePrompt";
import { SplashScreen } from "../components/lumina/SplashScreen";
import { BackToTimeline } from "../components/lumina/BackToTimeline";
import { LuminaDialogHost } from "../components/lumina/dialog/LuminaDialogHost";
import { LuminaLoadingOverlay } from "../components/lumina/dialog/LuminaLoadingOverlay";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[Lumina root error]", error);
  const router = useRouter();
  const isDev = import.meta.env.DEV;
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl text-center">
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

        {isDev && (
          <details
            open
            className="mt-8 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-left"
          >
            <summary className="cursor-pointer text-sm font-medium text-destructive">
              Dev diagnostics — {error.name}: {error.message.slice(0, 140)}
            </summary>
            <div className="mt-3 space-y-3 text-[11px] text-foreground/80">
              <div>
                <div className="font-semibold uppercase tracking-wider text-muted-foreground">Route</div>
                <div className="font-mono">{typeof window !== "undefined" ? window.location.pathname + window.location.search : "(ssr)"}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wider text-muted-foreground">User agent</div>
                <div className="font-mono break-all">{typeof navigator !== "undefined" ? navigator.userAgent : "(ssr)"}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wider text-muted-foreground">Stack</div>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono">
                  {error.stack ?? "(no stack)"}
                </pre>
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { title: "Lumina Evermore" },
      {
        name: "description",
        content: "Crafted with care 😸..... preserving the moments that mean the most to Shivani 😌.....",
      },
      { name: "author", content: "Lumina Evermore" },
      { name: "application-name", content: "Lumina Evermore" },
      { name: "theme-color", content: "#1a1033" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Lumina Evermore" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "msapplication-TileColor", content: "#1a1033" },
      { name: "msapplication-TileImage", content: "/android-chrome-192x192.png" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Lumina Evermore" },
      {
        property: "og:description",
        content: "Crafted with care 😸.... preserving the moments that mean the most to Shivani 😌.....",
      },
      { property: "og:image", content: "https://lumina-evermore.vercel.app/og-shivani.jpg" },
      { property: "og:image:secure_url", content: "https://lumina-evermore.vercel.app/og-shivani.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:url", content: "https://lumina-evermore.vercel.app/" },
      { property: "og:site_name", content: "Lumina Evermore" },
      { property: "og:image:alt", content: "Lumina Evermore — crafted with care for Shivani" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Lumina Evermore" },
      {
        name: "twitter:description",
        content: "Crafted with care 😸.... preserving the moments that mean the most to Shivani 😌.....",
      },
      { name: "twitter:image", content: "https://lumina-evermore.vercel.app/og-shivani.jpg" },
      { name: "twitter:image:alt", content: "Lumina Evermore — crafted with care for Shivani" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico?v=evermore1", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png?v=evermore1" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png?v=evermore1" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/android-chrome-192x192.png?v=evermore1" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/android-chrome-512x512.png?v=evermore1" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png?v=evermore1" },
      { rel: "mask-icon", href: "/apple-touch-icon.png?v=evermore1", color: "#1a1033" },
      { rel: "manifest", href: "/manifest.webmanifest?v=evermore1" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Caveat:wght@400;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    // Fire and forget — internally idempotent
    void import("@/lib/lumina-auth").then((m) => m.bindAuthListener());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <BackToTimeline />
        <SplashScreen />
        <PwaUpdatePrompt />
        <LuminaDialogHost />
        <LuminaLoadingOverlay />
      </MotionConfig>
    </QueryClientProvider>
  );
}
