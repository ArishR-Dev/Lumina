"""
Batch D smoke test — Letters, Thoughts, Calendar, Timeline, Favorites,
Achievements, Tags, Scratch Pad.

For each route:

  - Navigate.
  - Assert no console errors and no unhandled promise rejections.
  - Assert the shared PageHeader h1 rendered on a single line (guards the
    "one character per line" regression that the production audit
    introduced and this suite exists to prevent).
  - Capture a mobile (390) and desktop (1280) screenshot for reviewers.

Run:
  python3 tests/e2e/batch_d_smoke.py
"""

import asyncio, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path(__file__).parent / "screenshots" / "batch_d_smoke"
SHOTS.mkdir(parents=True, exist_ok=True)

ROUTES = [
    ("letters",      "/app/letters"),
    ("thoughts",     "/app/thoughts"),
    ("calendar",     "/app/calendar"),
    ("timeline",     "/app/timeline"),
    ("favorites",    "/app/favorites"),
    ("achievements", "/app/achievements"),
    ("scratch",      "/app/scratch"),
    ("tag",          "/app/tags/test"),
]

# H1 line-height ceiling — a wrapped h1 (>= 2 lines) exceeds this at any
# viewport we care about. Real design uses leading-[1.1] * font-size 2rem
# (~35px) on mobile and 3rem (~53px) on desktop.
MAX_H1_HEIGHT_MOBILE = 60
MAX_H1_HEIGHT_DESKTOP = 90


def _require_session():
    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS")
    if status != "injected":
        print(f"SKIP: no injected session (LOVABLE_BROWSER_AUTH_STATUS={status!r})")
        sys.exit(0)


async def _restore(context, page):
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
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


async def _visit(context, slug, path, viewport):
    page = await context.new_page()
    await page.set_viewport_size(viewport)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}")
            if m.type == "error" else None)
    await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle")
    # Give framer-motion + PageTransition time to settle.
    await page.wait_for_timeout(400)

    h1 = await page.query_selector("h1")
    assert h1 is not None, f"{slug}: no h1"
    box = await h1.bounding_box()
    assert box is not None, f"{slug}: h1 has no box"
    limit = MAX_H1_HEIGHT_MOBILE if viewport["width"] < 640 else MAX_H1_HEIGHT_DESKTOP
    assert box["height"] < limit, (
        f"{slug} @ {viewport['width']}px: h1 wrapped "
        f"(height={box['height']:.0f} > {limit})"
    )
    assert box["width"] > 100, (
        f"{slug} @ {viewport['width']}px: h1 squeezed (width={box['width']:.0f})"
    )

    label = f"{slug}_{viewport['width']}"
    await page.screenshot(path=str(SHOTS / f"{label}.png"))
    await page.close()
    return errors


async def main():
    _require_session()
    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await context.new_page()
        await _restore(context, page)
        await page.close()
        for slug, path in ROUTES:
            for vp in ({"width": 390, "height": 844}, {"width": 1280, "height": 900}):
                try:
                    errs = await _visit(context, slug, path, vp)
                    if errs:
                        failures.append(f"{slug} @ {vp['width']}px: {errs[0]}")
                except AssertionError as e:
                    failures.append(str(e))
        await browser.close()
    if failures:
        print("FAIL")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print(f"OK — {len(ROUTES)} Batch D routes rendered cleanly at 390 + 1280.")


if __name__ == "__main__":
    asyncio.run(main())
