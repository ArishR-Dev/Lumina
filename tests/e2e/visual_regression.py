"""
Lumina — Visual Regression Suite.

Captures deterministic screenshots of every top-level app route at three
viewports (mobile / tablet / desktop) and diffs them against committed
baselines. First run creates baselines; subsequent runs fail on any pixel
delta above the configured tolerance.

Design goals:
  - Deterministic frames: animations paused, caret hidden, fonts loaded,
    reduced-motion forced, network idle.
  - Runs against the live dev server on http://localhost:8080.
  - Uses the injected Supabase session (see LOVABLE_BROWSER_AUTH_STATUS).
  - Zero external services — PIL diffs baselines locally.

Layout on disk:
  tests/e2e/visuals/
    baselines/<viewport>/<slug>.png   ← committed truth
    current/<viewport>/<slug>.png     ← latest run (gitignored)
    diffs/<viewport>/<slug>.png       ← red-mask diff (gitignored)
    report.json

Run:
  python3 tests/e2e/visual_regression.py                # diff
  UPDATE_BASELINES=1 python3 tests/e2e/visual_regression.py   # refresh
  ROUTES=home,notes python3 tests/e2e/visual_regression.py    # subset

Exit code is non-zero on any regression so CI can gate on it.
"""
import asyncio, json, os, sys
from pathlib import Path
from PIL import Image, ImageChops
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
ROOT = Path(__file__).parent / "visuals"
BASELINES = ROOT / "baselines"
CURRENT = ROOT / "current"
DIFFS = ROOT / "diffs"
for d in (BASELINES, CURRENT, DIFFS):
    d.mkdir(parents=True, exist_ok=True)

# Pixel-diff tolerance. Anti-aliasing on differing GPUs can flip 1–2 pixels
# per glyph edge; 0.5% of total pixels is the industry-standard headroom.
PIXEL_TOLERANCE = float(os.environ.get("PIXEL_TOLERANCE", "0.005"))
UPDATE = os.environ.get("UPDATE_BASELINES") == "1"

VIEWPORTS = {
    "mobile":  (390, 844),
    "tablet":  (834, 1112),
    "desktop": (1440, 900),
}

ROUTES = [
    ("home",         "/app/home"),
    ("notes",        "/app/notes"),
    ("journal",      "/app/journal"),
    ("thoughts",     "/app/thoughts"),
    ("letters",      "/app/letters"),
    ("memories",     "/app/memories"),
    ("capsules",     "/app/capsules"),
    ("calendar",     "/app/calendar"),
    ("tasks",        "/app/tasks"),
    ("habits",       "/app/habits"),
    ("collections",  "/app/collections"),
    ("favorites",    "/app/favorites"),
    ("dashboard",    "/app/dashboard"),
    ("insights",     "/app/insights"),
    ("achievements", "/app/achievements"),
    ("mood",         "/app/mood"),
    ("settings",     "/app/settings"),
    ("farewell",     "/app/farewell"),
    ("backups",      "/app/backups"),
    ("timeline",     "/app/timeline"),
    ("scratch",      "/app/scratch"),
    ("export",       "/app/export"),
]
if os.environ.get("ROUTES"):
    allowed = set(os.environ["ROUTES"].split(","))
    ROUTES = [r for r in ROUTES if r[0] in allowed]


FREEZE_CSS = """
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }
/* Hide any live time / relative-date strings that change between runs. */
[data-visual-volatile] { visibility: hidden !important; }
"""


async def restore_session(context, page):
    sk = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cj = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cj:
        cookies = json.loads(cj)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE, wait_until="domcontentloaded")
    if sk and sj:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(sk)}, {json.dumps(sj)})"
        )


async def stabilize(page):
    await page.add_style_tag(content=FREEZE_CSS)
    # Wait for webfonts so glyph metrics don't shift.
    await page.evaluate("() => document.fonts && document.fonts.ready")
    # Blur any focused input so caret / focus ring don't leak into the frame.
    await page.evaluate("() => document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    await page.wait_for_timeout(200)


def diff_images(a_path: Path, b_path: Path, out_path: Path) -> dict:
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if a.size != b.size:
        return {"ok": False, "reason": f"size mismatch {a.size} vs {b.size}",
                "diff_ratio": 1.0}
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    if bbox is None:
        return {"ok": True, "diff_ratio": 0.0}
    # Count non-zero pixels.
    hist = diff.convert("L").getdata()
    changed = sum(1 for v in hist if v > 8)  # >8/255 ignores JPEG-style noise
    total = a.size[0] * a.size[1]
    ratio = changed / total
    # Write red diff mask for humans.
    mask = diff.convert("L").point(lambda v: 255 if v > 8 else 0)
    overlay = Image.new("RGB", a.size, (255, 0, 0))
    combined = Image.composite(overlay, a, mask)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    combined.save(out_path)
    return {"ok": ratio <= PIXEL_TOLERANCE, "diff_ratio": ratio,
            "changed_px": changed, "total_px": total}


async def capture(page, slug: str, viewport: str, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{slug}.png"
    await page.screenshot(path=str(path))
    return path


async def main():
    results = []
    regressions = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        for vp_name, (w, h) in VIEWPORTS.items():
            context = await browser.new_context(
                viewport={"width": w, "height": h},
                device_scale_factor=1,
                reduced_motion="reduce",
                color_scheme="light",
            )
            page = await context.new_page()
            await restore_session(context, page)

            for slug, url in ROUTES:
                try:
                    await page.goto(f"{BASE}{url}", wait_until="networkidle", timeout=20_000)
                    await page.wait_for_selector("h1", timeout=15_000)
                    await stabilize(page)
                    cur = await capture(page, slug, vp_name, CURRENT / vp_name)
                    base = BASELINES / vp_name / f"{slug}.png"
                    if UPDATE or not base.exists():
                        base.parent.mkdir(parents=True, exist_ok=True)
                        cur.replace(base) if False else __import__("shutil").copyfile(cur, base)
                        results.append({"slug": slug, "viewport": vp_name, "status": "baseline"})
                        continue
                    diff = diff_images(base, cur, DIFFS / vp_name / f"{slug}.png")
                    entry = {"slug": slug, "viewport": vp_name, **diff}
                    results.append(entry)
                    if not diff["ok"]:
                        regressions.append(entry)
                except Exception as e:
                    results.append({"slug": slug, "viewport": vp_name,
                                    "status": "error", "error": str(e)})
                    regressions.append(results[-1])
            await context.close()
        await browser.close()

    (ROOT / "report.json").write_text(json.dumps({
        "tolerance": PIXEL_TOLERANCE,
        "results": results,
        "regressions": regressions,
    }, indent=2))

    print(f"\nVisual regression: {len(results)} captures, "
          f"{len(regressions)} regressions (tolerance {PIXEL_TOLERANCE*100:.2f}%).")
    for r in regressions:
        print(f"  ✗ {r.get('viewport')}/{r.get('slug')} — {r.get('diff_ratio', r.get('error'))}")
    if regressions and not UPDATE:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
