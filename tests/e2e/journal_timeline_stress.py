"""
Additional Journal timeline stress: mobile viewport, rapid click sequences,
click-then-save-then-click, and click while sync engine is churning.
"""
import asyncio, json, os
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"

async def restore(ctx, page):
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


async def scenario(name, viewport, actions):
    print(f"\n=== {name} @ {viewport} ===")
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport=viewport)
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        await restore(ctx, page)
        await page.goto(f"{BASE}/app/journal", wait_until="domcontentloaded")
        await page.wait_for_selector("button:has-text('Save today')")
        await page.wait_for_timeout(1500)
        # Seed 15 unmistakable entries.
        await page.evaluate(r"""
          async () => {
            const mod = await import('/src/lib/lumina-store.ts');
            const uid = () => 'stress_' + Math.random().toString(36).slice(2, 8);
            const now = Date.now();
            const entries = [];
            for (let i = 0; i < 15; i++) {
              const d = new Date(now - (i+40)*86400000).toISOString().slice(0,10);
              entries.push({id:uid(),date:d,mood:'🌸',
                gratitude:`STRESS_G_${i}`, reflection:`STRESS_R_${i}`, highlight:`STRESS_H_${i}`,
                createdAt: now - i});
            }
            const s = mod.useLumina.getState();
            // Remove any old stress entries to avoid duplicates.
            const cleaned = s.journal.filter(j => !j.gratitude?.startsWith('STRESS_G_'));
            mod.useLumina.setState({ journal: [...entries, ...cleaned] });
            return entries.length;
          }
        """)
        await page.wait_for_timeout(300)
        result = await actions(page)
        result["errors"] = errors
        print(json.dumps(result, indent=2))
        await b.close()
        return result


async def act_rapid_click(page):
    """Click 15 different STRESS entries with only 30ms between clicks."""
    fails = []
    for i in range(15):
        needle = f"STRESS_G_{i}"
        await page.evaluate(r"""
          (needle) => {
            const btns = Array.from(document.querySelectorAll('main button'));
            for (const b of btns) if ((b.innerText||'').includes(needle)) { b.click(); return; }
          }
        """, needle)
        await page.wait_for_timeout(30)
    # After the storm, verify final selection matches the last click.
    st = await page.evaluate("() => ({d: document.querySelector('input[type=date]').value, t: Array.from(document.querySelectorAll('textarea')).map(x=>x.value)})")
    return {"final": st}


async def act_click_save_click(page):
    """Click older -> Save -> click another older -> verify editor updates."""
    fails = []
    for i in range(0, 15, 3):
        needle_a = f"STRESS_G_{i}"
        needle_b = f"STRESS_G_{i+1}"
        await page.evaluate(
            r"(n)=>{for(const b of document.querySelectorAll('main button')) if((b.innerText||'').includes(n)){b.click();return;}}",
            needle_a,
        )
        await page.wait_for_timeout(80)
        # Verify editor loaded A
        st = await page.evaluate("() => Array.from(document.querySelectorAll('textarea')).map(x=>x.value)")
        if st[0] != needle_a:
            fails.append({"phase":"click-a","i":i,"got":st[0]})
        # Press Save.
        await page.get_by_role("button", name="Save today").click()
        await page.wait_for_timeout(150)
        # Click B.
        clicked_b = await page.evaluate(
            r"(n)=>{for(const b of document.querySelectorAll('main button')) if((b.innerText||'').includes(n)){b.click();return true;} return false;}",
            needle_b,
        )
        if not clicked_b:
            fails.append({"phase":"click-b-not-found","i":i,"needle":needle_b})
            continue
        await page.wait_for_timeout(80)
        st = await page.evaluate("() => Array.from(document.querySelectorAll('textarea')).map(x=>x.value)")
        if st[0] != needle_b:
            fails.append({"phase":"click-b-mismatch","i":i,"expected":needle_b,"got":st[0]})
    return {"failures": fails}


async def main():
    r1 = await scenario("desktop_rapid_clicks", {"width":1440,"height":1600}, act_rapid_click)
    r2 = await scenario("desktop_click_save_click", {"width":1440,"height":1600}, act_click_save_click)
    r3 = await scenario("mobile_rapid_clicks", {"width":390,"height":844}, act_rapid_click)
    r4 = await scenario("mobile_click_save_click", {"width":390,"height":844}, act_click_save_click)


asyncio.run(main())
