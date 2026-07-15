"""
Lumina Sanctuary — full navigation & UI regression suite.

Runs the entire N×(N-1) sidebar navigation matrix and reports on:
  - URL correctness after each navigation
  - Active-sidebar-item update
  - Page-title (document.title) change
  - Overlap of previous page during transition (previous PageHeader h1
    coexisting with the destination h1)
  - Console errors / hydration warnings / failed network requests
  - Navigation timing (ms)
  - Screenshot of every destination page

Zero UI code is modified — this is pure black-box regression.

Report:
  /mnt/documents/lumina-qa/report.md
  /mnt/documents/lumina-qa/report.json
  /mnt/documents/lumina-qa/screenshots/<slug>.png

Run:
  python3 tests/e2e/regression_suite.py
Optional environment overrides:
  QA_ORIGINS=home,notes          # limit which origin pages sweep from
  QA_SCREENSHOTS_ONLY=1          # skip transition sampling, just capture pages
"""
import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
OUT = Path("/mnt/documents/lumina-qa")
SHOTS = OUT / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
SHOTS.mkdir(parents=True, exist_ok=True)

# Sidebar destinations, in sidebar order.
PAGES = [
    ("home",         "/app/home",         "Home"),
    ("notes",        "/app/notes",        "Notes"),
    ("journal",      "/app/journal",      "Journal"),
    ("thoughts",     "/app/thoughts",     "Thoughts"),
    ("letters",      "/app/letters",      "Letters"),
    ("memories",     "/app/memories",     "Memories"),
    ("capsules",     "/app/capsules",     "Memory Capsules"),
    ("calendar",     "/app/calendar",     "Calendar"),
    ("tasks",        "/app/tasks",        "Tasks"),
    ("habits",       "/app/habits",       "Habits"),
    ("favorites",    "/app/favorites",    "Favorites"),
    ("dashboard",    "/app/dashboard",    "Dashboard"),
    ("achievements", "/app/achievements", "Achievements"),
    ("mood",         "/app/mood",         "Mood"),
    ("settings",     "/app/settings",     "Settings"),
    ("farewell",     "/app/farewell",     "Farewell"),
]
BY_SLUG = {p[0]: p for p in PAGES}


async def restore_supabase(context, page):
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


async def get_h1_texts(page):
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('h1')).map(h => (h.textContent||'').trim()).filter(Boolean)"""
    )


async def get_active_sidebar_label(page):
    return await page.evaluate(
        """() => {
          const a = document.querySelector('aside a[data-status="active"], nav a[data-status="active"]');
          return a ? (a.textContent||'').trim() : null;
        }"""
    )


async def goto_page(page, url):
    await page.goto(f"{BASE}{url}", wait_until="domcontentloaded")
    await page.wait_for_selector("h1", timeout=15_000)
    # Small settle
    await page.wait_for_timeout(150)


async def test_transition(page, origin, dest, console_errors, failed_requests):
    """Click sidebar link for dest from origin page, verify everything."""
    result = {
        "from": origin[0], "to": dest[0],
        "expected_url": dest[1],
        "final_url": None,
        "url_ok": False,
        "active_label": None,
        "active_ok": False,
        "title": None,
        "title_changed": False,
        "overlap_frames": 0,
        "duration_ms": None,
        "errors": [],
    }

    prev_title = await page.title()
    prev_h1s = await get_h1_texts(page)
    prev_h1 = prev_h1s[0] if prev_h1s else ""

    # Install RAF sampler that watches for prev h1 + dest url path coexisting.
    await page.evaluate(
        """(prevH1) => {
          window.__qa_samples = [];
          window.__qa_prev = prevH1;
          const start = performance.now();
          const tick = () => {
            const t = performance.now() - start;
            const h1s = Array.from(document.querySelectorAll('h1')).map(h => (h.textContent||'').trim());
            window.__qa_samples.push({ t, h1s, path: location.pathname });
            if (t < 3000) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }""",
        prev_h1,
    )

    # Prefer the sidebar (aside) link; fall back to any /app/<dest> link.
    # Accept both with and without a trailing slash.
    href_variants = {dest[1], dest[1] + "/", dest[1].rstrip("/")}
    href_selector = ", ".join(
        f'aside a[href="{h}"], nav a[href="{h}"]' for h in href_variants
    )
    link = page.locator(href_selector).first
    if await link.count() == 0:
        alt = ", ".join(f'a[href="{h}"]' for h in href_variants)
        link = page.locator(alt).first

    t0 = time.time()
    try:
        await link.click(timeout=5_000)
    except Exception as e:
        result["errors"].append(f"click-failed: {e}")
        return result

    # Wait for URL change.
    try:
        await page.wait_for_url(lambda u: u.rstrip("/").endswith(dest[1].rstrip("/")), timeout=8_000)
    except Exception as e:
        result["errors"].append(f"url-wait: {e}")

    # Wait for an h1 belonging to destination (any h1 after path change).
    try:
        await page.wait_for_function(
            """(prev) => {
              const h1s = Array.from(document.querySelectorAll('h1')).map(h => (h.textContent||'').trim()).filter(Boolean);
              return h1s.length > 0 && !h1s.every(t => t === prev);
            }""",
            arg=prev_h1,
            timeout=8_000,
        )
    except Exception as e:
        result["errors"].append(f"h1-wait: {e}")

    result["duration_ms"] = int((time.time() - t0) * 1000)

    # Let sampler finish some frames.
    await page.wait_for_timeout(400)
    samples = await page.evaluate("window.__qa_samples || []")

    # Overlap = frames where path is destination AND prev_h1 still visible AND
    # a *different* h1 is also visible (i.e. both pages painted).
    overlap = 0
    for s in samples:
        if s["path"] != dest[1]:
            continue
        h1s = s["h1s"]
        if prev_h1 and prev_h1 in h1s and any(t != prev_h1 for t in h1s if t):
            overlap += 1
    result["overlap_frames"] = overlap

    result["final_url"] = page.url
    result["url_ok"] = result["final_url"].rstrip("/").endswith(dest[1].rstrip("/"))
    result["active_label"] = await get_active_sidebar_label(page)
    result["active_ok"] = (result["active_label"] or "").lower() == dest[2].lower()
    result["title"] = await page.title()
    result["title_changed"] = result["title"] != prev_title

    return result


async def main():
    origins_env = os.environ.get("QA_ORIGINS")
    if origins_env:
        origins = [BY_SLUG[s] for s in origins_env.split(",") if s in BY_SLUG]
    else:
        origins = PAGES

    console_errors = []
    failed_requests = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        page.on("console", lambda m: (
            console_errors.append({"type": m.type, "text": m.text[:400]})
            if m.type in ("error",) else None
        ))
        def _on_reqfail(r):
            failure = (r.failure or "")
            # Ignore benign cancellations from rapid navigation and dev HMR.
            if "ERR_ABORTED" in failure:
                return
            failed_requests.append({"url": r.url, "failure": failure})
        page.on("requestfailed", _on_reqfail)


        await restore_supabase(context, page)

        # 1) Capture screenshot of every page + basic health.
        page_report = []
        for slug, url, label in PAGES:
            entry = {"slug": slug, "url": url, "label": label, "ok": False, "h1": None, "title": None, "error": None}
            try:
                errs_before = len(console_errors)
                await goto_page(page, url)
                entry["title"] = await page.title()
                h1s = await get_h1_texts(page)
                entry["h1"] = h1s[0] if h1s else None
                await page.screenshot(path=str(SHOTS / f"{slug}.png"))
                entry["console_errors_delta"] = len(console_errors) - errs_before
                entry["ok"] = True
            except Exception as e:
                entry["error"] = str(e)
            page_report.append(entry)
            print(f"[page] {slug:14s} ok={entry['ok']} h1={entry['h1']!r}")

        # 2) Sidebar navigation matrix: every origin → every other destination.
        transitions = []
        if not os.environ.get("QA_SCREENSHOTS_ONLY"):
            for origin in origins:
                await goto_page(page, origin[1])
                for dest in PAGES:
                    if dest[0] == origin[0]:
                        continue
                    r = await test_transition(page, origin, dest, console_errors, failed_requests)
                    transitions.append(r)
                    status = "PASS" if (r["url_ok"] and r["overlap_frames"] == 0 and not r["errors"]) else "FAIL"
                    print(
                        f"[nav] {origin[0]:>12s} -> {dest[0]:<12s} {status}"
                        f"  overlap={r['overlap_frames']:>2d} dur={r['duration_ms']}ms"
                        f" active={r['active_label']!r}"
                    )
                    # Return to origin for clean next click.
                    if dest[0] != origin[0]:
                        await goto_page(page, origin[1])

        # 3) Browser back / forward sanity.
        history_report = {}
        try:
            await goto_page(page, "/app/home")
            await page.locator('aside a[href="/app/notes"], a[href="/app/notes"]').first.click()
            await page.wait_for_url("**/app/notes", timeout=8_000)
            await page.go_back(wait_until="domcontentloaded")
            back_url = page.url
            await page.go_forward(wait_until="domcontentloaded")
            fwd_url = page.url
            history_report = {
                "back_ok": back_url.endswith("/app/home"),
                "forward_ok": fwd_url.endswith("/app/notes"),
                "back_url": back_url, "forward_url": fwd_url,
            }
        except Exception as e:
            history_report = {"error": str(e)}

        await browser.close()

    # ---- Report ----
    passed = [t for t in transitions if t["url_ok"] and t["overlap_frames"] == 0 and not t["errors"]]
    failed = [t for t in transitions if t not in passed]

    summary = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "pages_total": len(PAGES),
        "pages_ok": sum(1 for e in page_report if e["ok"]),
        "transitions_total": len(transitions),
        "transitions_passed": len(passed),
        "transitions_failed": len(failed),
        "console_errors": len(console_errors),
        "failed_requests": len(failed_requests),
        "history": history_report,
    }

    (OUT / "report.json").write_text(json.dumps({
        "summary": summary,
        "pages": page_report,
        "transitions": transitions,
        "console_errors": console_errors,
        "failed_requests": failed_requests,
    }, indent=2))

    md = []
    md.append("# Lumina Sanctuary — Navigation & UI Regression Report\n")
    md.append(f"Generated {summary['generated_at']}\n")
    md.append("## Summary\n")
    for k, v in summary.items():
        md.append(f"- **{k}**: {v}")
    md.append("\n## Pages\n")
    md.append("| slug | url | title | h1 | ok | console errors |")
    md.append("|---|---|---|---|---|---|")
    for e in page_report:
        md.append(f"| {e['slug']} | `{e['url']}` | {e.get('title')!r} | {e.get('h1')!r} | {e['ok']} | {e.get('console_errors_delta', 0)} |")
    md.append("\n## Failing transitions\n")
    if not failed:
        md.append("None — every sidebar navigation path passed.\n")
    else:
        md.append("| from | to | url_ok | active_ok | overlap_frames | duration_ms | errors |")
        md.append("|---|---|---|---|---|---|---|")
        for t in failed:
            md.append(
                f"| {t['from']} | {t['to']} | {t['url_ok']} | {t['active_ok']} |"
                f" {t['overlap_frames']} | {t['duration_ms']} | {'; '.join(t['errors']) or ''} |"
            )
    md.append("\n## Browser history\n")
    md.append(f"```\n{json.dumps(history_report, indent=2)}\n```\n")
    md.append("\n## Console errors\n")
    if not console_errors:
        md.append("None.\n")
    else:
        for c in console_errors[:50]:
            md.append(f"- **{c['type']}**: {c['text']}")
    md.append("\n## Failed network requests\n")
    if not failed_requests:
        md.append("None.\n")
    else:
        for r in failed_requests[:50]:
            md.append(f"- {r['url']} — {r['failure']}")
    md.append("\n## Screenshots\n")
    for e in page_report:
        md.append(f"- `screenshots/{e['slug']}.png` — {e['label']}")

    (OUT / "report.md").write_text("\n".join(md))

    print("\n=== SUMMARY ===")
    print(json.dumps(summary, indent=2))
    print(f"\nReport: {OUT}/report.md")
    print(f"JSON:   {OUT}/report.json")


asyncio.run(main())
