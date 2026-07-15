"""
Race verification: log every mutation to lumina-store.journal with timestamps,
seed AFTER mount, then observe whether a late initialSync obliterates the seed.
"""
import asyncio, os, json
from playwright.async_api import async_playwright
BASE = "http://localhost:8080"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width":1440,"height":1800})
        page = await ctx.new_page()
        cj = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        sk = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if cj:
            cookies = json.loads(cj)
            for c in cookies: c["url"] = BASE
            await ctx.add_cookies(cookies)
        await page.goto(BASE, wait_until="domcontentloaded")
        if sk and sj:
            await page.evaluate(f"window.localStorage.setItem({json.dumps(sk)}, {json.dumps(sj)})")

        await page.goto(f"{BASE}/app/journal", wait_until="domcontentloaded")

        # Install a subscriber BEFORE any code has a chance to mutate journal.
        await page.evaluate(r"""
          async () => {
            const mod = await import('/src/lib/lumina-store.ts');
            const { useLumina } = mod;
            window.__log = [];
            const t0 = performance.now();
            let prev = null;
            useLumina.subscribe((s) => {
              const j = s.journal;
              if (j === prev) return;
              window.__log.push({
                t: Math.round(performance.now() - t0),
                len: j.length,
                first_ids: j.slice(0,3).map(x => (x.id||'').slice(0,10)),
                first_grats: j.slice(0,3).map(x => (x.gratitude||'').slice(0,20)),
              });
              prev = j;
            });
            window.__t0 = t0;
          }
        """)

        # Seed at various offsets and see when initialSync clobbers.
        await page.wait_for_selector("button:has-text('Save today')")

        # Seed IMMEDIATELY (race with initialSync).
        await page.evaluate(r"""
          async () => {
            const mod = await import('/src/lib/lumina-store.ts');
            const entries = [];
            for (let i = 0; i < 5; i++) {
              entries.push({
                id: 'RACE_' + i,
                date: `2020-01-0${i+1}`,
                mood: '🔥',
                gratitude: `RACE_G_${i}`,
                reflection: `RACE_R_${i}`,
                highlight: `RACE_H_${i}`,
                createdAt: Date.now() - i,
              });
            }
            const s = mod.useLumina.getState();
            mod.useLumina.setState({ journal: [...entries, ...s.journal] });
            window.__log.push({ t: Math.round(performance.now() - window.__t0), event: 'SEEDED', count: 5 });
          }
        """)

        # Wait 5 seconds to let initialSync fully resolve.
        await page.wait_for_timeout(5000)

        # Read the log + final store state.
        log = await page.evaluate("window.__log")
        final = await page.evaluate(r"""
          async () => {
            const mod = await import('/src/lib/lumina-store.ts');
            const j = mod.useLumina.getState().journal;
            return {
              total: j.length,
              race_entries_still_there: j.filter(x => (x.id||'').startsWith('RACE_')).length,
              first_5: j.slice(0, 5).map(x => ({id: x.id, g: (x.gratitude||'').slice(0, 30)})),
            };
          }
        """)

        print("=== journal-state mutation log ===")
        for e in log: print(" ", e)
        print("\n=== final state ===")
        print(json.dumps(final, indent=2))
        await b.close()

asyncio.run(main())
