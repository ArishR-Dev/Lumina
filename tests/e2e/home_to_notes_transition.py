"""
E2E: navigate Home → Notes and assert Home never overlaps Notes.

We poll the DOM at a very high rate during the transition and record every
sample where `[data-page="home"]` and `[data-page="notes"]` are both present.
The test passes iff that overlap count stays at 0.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080"


async def restore_supabase(context, page):
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            f'window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})'
        )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        page.on("console", lambda m: print("CONSOLE", m.type, m.text[:200]))
        await restore_supabase(context, page)

        await page.goto(f"{BASE}/app/home", wait_until="domcontentloaded")
        await page.wait_for_timeout(8000)
        print("after goto url:", page.url)
        info = await page.evaluate("(key) => ({ href: location.href, hasKey: !!localStorage.getItem(key) })", os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY") or "")
        print("info:", info)
        found = await page.evaluate("() => ({ home: !!document.querySelector('[data-page=\"home\"]'), notes: !!document.querySelector('[data-page=\"notes\"]'), body: document.body.innerText.slice(0,200) })")
        print("found:", found)


        await page.screenshot(path=str(OUT / "0_before.png"))
        await page.wait_for_selector("[data-page=\"home\"]", state="attached", timeout=20_000)
        await page.screenshot(path=str(OUT / "1_home.png"))
        print("home mounted:", page.url)



        # Start high-frequency DOM sampling BEFORE clicking Notes and keep
        # running through the transition. Records overlap frames.
        sampler = await page.evaluate_handle(
            """() => {
              const samples = [];
              const start = performance.now();
              const tick = () => {
                const home = !!document.querySelector('[data-page="home"]');
                const notes = !!document.querySelector('[data-page="notes"]');
                samples.push({ t: performance.now() - start, home, notes });
                if (performance.now() - start < 4000) requestAnimationFrame(tick);
                else window.__samples = samples;
              };
              requestAnimationFrame(tick);
              return true;
            }"""
        )

        # Click the sidebar Notes link (falls back to mobile nav).
        notes_link = page.locator('a[href="/app/notes"]').first
        await notes_link.click()

        await page.wait_for_selector("[data-page=\"notes\"]", state="attached", timeout=20_000)
        await page.screenshot(path=str(OUT / "2_notes.png"))

        # Wait for sampler to finish (4s window).
        await page.wait_for_function("window.__samples && window.__samples.length > 30", timeout=8_000)
        samples = await page.evaluate("window.__samples")

        overlap = [s for s in samples if s["home"] and s["notes"]]
        home_after_notes = [s for s in samples if s["notes"] and s["home"]]
        first_notes_t = next((s["t"] for s in samples if s["notes"]), None)
        last_home_t = next((s["t"] for s in reversed(samples) if s["home"]), None)

        print(f"samples: {len(samples)}  overlap_frames: {len(overlap)}")
        print(f"first notes @ {first_notes_t}  last home @ {last_home_t}")

        assert len(overlap) == 0, (
            f"Home overlapped Notes during transition ({len(overlap)} frames). "
            f"Example: {overlap[:3]}"
        )
        # Sanity: we actually observed Notes.
        assert first_notes_t is not None, "Notes never mounted"

        print("PASS: Home never appeared during Home → Notes transition")
        await browser.close()


asyncio.run(main())
