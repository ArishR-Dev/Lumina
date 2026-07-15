// Self-unregistering service worker: satisfies any cached registration
// that still requests /sw.js, then removes itself so we stop 404 loops.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* noop */
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        if ("navigate" in client) {
          try {
            await client.navigate(client.url);
          } catch {
            /* noop */
          }
        }
      }
    })(),
  );
});
