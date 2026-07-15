"""
E2E: navigate Notes → Home and assert Home never overlaps Notes.

Mirrors home_to_notes_transition.py. We poll the DOM at requestAnimationFrame
rate during the transition and record every sample where both
`[data-page="notes"]` and `[data-page="home"]` are present. The test passes
iff that overlap count stays at 0.
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

        await page.goto(f"{BASE}/app/notes", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-page="notes"]', state="attached", timeout=20_000)
        await page.screenshot(path=str(OUT / "n2h_1_notes.png"))
        print("notes mounted:", page.url)

        # Start high-frequency DOM sampling BEFORE clicking Home.
        await page.evaluate(
            """() => {
              window.__samples = [];
              const start = performance.now();
              const tick = () => {
                const notes = !!document.querySelector('[data-page="notes"]');
                const home = !!document.querySelector('[data-page="home"]');
                window.__samples.push({ t: performance.now() - start, notes, home });
                if (performance.now() - start < 4000) requestAnimationFrame(tick);
              };
              requestAnimationFrame(tick);
            }"""
        )

        home_link = page.locator('a[href="/app/home"]').first
        await home_link.click()

        await page.wait_for_selector('[data-page="home"]', state="attached", timeout=20_000)
        await page.screenshot(path=str(OUT / "n2h_2_home.png"))

        await page.wait_for_function("window.__samples && window.__samples.length > 10", timeout=15_000)
        samples = await page.evaluate("window.__samples")

        overlap = [s for s in samples if s["notes"] and s["home"]]
        first_home_t = next((s["t"] for s in samples if s["home"]), None)
        last_notes_t = next((s["t"] for s in reversed(samples) if s["notes"]), None)

        print(f"samples: {len(samples)}  overlap_frames: {len(overlap)}")
        print(f"first home @ {first_home_t}  last notes @ {last_notes_t}")

        assert len(overlap) == 0, (
            f"Notes overlapped Home during transition ({len(overlap)} frames). "
            f"Example: {overlap[:3]}"
        )
        assert first_home_t is not None, "Home never mounted"

        print("PASS: Notes never appeared during Notes → Home transition")
        await browser.close()


asyncio.run(main())
