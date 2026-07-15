"""Zoom in on the click-A-save-click-B failure."""
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
        await page.wait_for_selector("button:has-text('Save today')")
        await page.wait_for_timeout(1500)

        await page.evaluate(r"""
          async () => {
            const mod = await import('/src/lib/lumina-store.ts');
            const now = Date.now();
            const entries = [];
            for (let i = 0; i < 15; i++) {
              const d = new Date(now - (i+40)*86400000).toISOString().slice(0,10);
              entries.push({id:'stress_'+i,date:d,mood:'🌸',
                gratitude:`STRESS_G_${i}`, reflection:`STRESS_R_${i}`, highlight:`STRESS_H_${i}`,
                createdAt: now - i});
            }
            const s = mod.useLumina.getState();
            const cleaned = s.journal.filter(j => !(j.gratitude||'').startsWith('STRESS_G_'));
            mod.useLumina.setState({ journal: [...entries, ...cleaned] });
          }
        """)
        await page.wait_for_timeout(300)

        async def dump(label):
            info = await page.evaluate(r"""
              async () => {
                const mod = await import('/src/lib/lumina-store.ts');
                const store = mod.useLumina.getState().journal.slice(0, 20).map(j=>({id:j.id,date:j.date,g:(j.gratitude||'').slice(0,20)}));
                const btns = Array.from(document.querySelectorAll('main button'))
                  .map(b=>(b.innerText||'').replace(/\s+/g,' ').trim().slice(0,60));
                const dateEl = document.querySelector('input[type=date]');
                const tas = Array.from(document.querySelectorAll('textarea')).map(x=>x.value.slice(0,40));
                return { store, btns_count: btns.length, btns_first_15: btns.slice(0,20), date: dateEl?.value, tas };
              }
            """)
            print(f"\n--- {label} ---")
            print(json.dumps(info, indent=2))
            return info

        await dump("initial")

        # Click STRESS_G_0
        await page.evaluate(r"""
          () => {
            for (const b of document.querySelectorAll('main button')) {
              if ((b.innerText||'').includes('STRESS_G_0') && !(b.innerText||'').includes('STRESS_G_1')) {
                b.click(); return;
              }
            }
          }
        """)
        await page.wait_for_timeout(100)
        await dump("after click STRESS_G_0")

        # Save
        await page.get_by_role("button", name="Save today").click()
        await page.wait_for_timeout(150)
        await dump("after Save")

        # Try to click STRESS_G_1
        clicked = await page.evaluate(r"""
          () => {
            for (const b of document.querySelectorAll('main button')) {
              const t = (b.innerText||'');
              if (t.includes('STRESS_G_1') && !t.includes('STRESS_G_10')) { b.click(); return t; }
            }
            return null;
          }
        """)
        print("click STRESS_G_1 result:", clicked)
        await page.wait_for_timeout(150)
        await dump("after click STRESS_G_1")

        await b.close()
asyncio.run(main())
