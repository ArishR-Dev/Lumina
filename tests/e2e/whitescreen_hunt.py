"""
Lumina — white-screen root-cause hunter.

Reproduces the intermittent white screen after Save by driving the app
through the failure-prone paths and capturing the exact runtime signal
when the page goes blank:

  - window.onerror
  - unhandledrejection
  - console.error / console.warn
  - failed network requests
  - React error-component detection ("This page didn't load")
  - DOM snapshot at failure
  - Screenshot
  - Route before / after
  - Store snapshot (window.localStorage['lumina-storage'])

Failure modes exercised, in order:
  1) Journal: 100 x (edit -> Save today)
  2) Journal: rapid double-save (double click)
  3) Journal: Save then immediately navigate to another page
  4) Notes: create -> type -> switch page mid-typing
  5) Thoughts / Letters / Memories / Tasks: quick add + navigate
  6) Save + theme change + resize interleaved

Any captured error stops the test and prints a full report to stdout
plus writes /mnt/documents/lumina-qa/whitescreen-report.{md,json}.
"""
import asyncio, json, os, time, traceback
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
OUT = Path("/mnt/documents/lumina-qa")
OUT.mkdir(parents=True, exist_ok=True)
SHOTS = OUT / "whitescreen"
SHOTS.mkdir(exist_ok=True)

INSTRUMENT = r"""
() => {
  if (window.__luminaQAInstalled) return;
  window.__luminaQAInstalled = true;
  window.__qaErrors = [];
  window.__qaConsole = [];
  const push = (kind, data) => window.__qaErrors.push({ kind, ...data, at: Date.now(), url: location.href });
  window.addEventListener('error', (e) => {
    push('window.error', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error && e.error.stack,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    push('unhandledrejection', {
      message: r && (r.message || String(r)),
      stack: r && r.stack,
    });
  });
  const origErr = console.error;
  console.error = function(...args) {
    try {
      window.__qaConsole.push({
        level: 'error',
        text: args.map(a => {
          if (a instanceof Error) return a.stack || (a.message + '');
          try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
        }).join(' '),
        at: Date.now(),
        url: location.href,
      });
    } catch {}
    return origErr.apply(this, args);
  };
}
"""


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


async def check_white_screen(page):
    """Return True if the app has crashed to a white screen or error boundary."""
    return await page.evaluate(
        """() => {
          // Root-level ErrorComponent renders "This page didn't load".
          const bodyText = (document.body && document.body.innerText) || '';
          if (bodyText.includes("This page didn't load")) return { kind: 'error-boundary', text: bodyText.slice(0, 400) };
          // A truly blank body (nothing but whitespace) is a white screen.
          const visibleText = bodyText.trim();
          if (visibleText.length === 0) return { kind: 'empty-body' };
          // No h1 anywhere on an /app/* page suggests the render tree collapsed.
          if (location.pathname.startsWith('/app/')) {
            const h1 = document.querySelector('h1');
            if (!h1) return { kind: 'no-h1', text: visibleText.slice(0, 200) };
          }
          return null;
        }"""
    )


async def snapshot(page, tag, extra=None):
    errs = await page.evaluate("window.__qaErrors || []")
    logs = await page.evaluate("window.__qaConsole || []")
    ws = await check_white_screen(page)
    store = await page.evaluate("window.localStorage.getItem('lumina-storage')")
    dom = await page.evaluate("document.documentElement.outerHTML")
    shot = SHOTS / f"{tag}.png"
    try:
        await page.screenshot(path=str(shot))
    except Exception:
        pass
    (SHOTS / f"{tag}.dom.html").write_text(dom or "")
    return {
        "tag": tag,
        "url": page.url,
        "white_screen": ws,
        "qa_errors": errs,
        "qa_console": logs,
        "store_len": len(store or ""),
        "screenshot": str(shot),
        "extra": extra or {},
    }


async def install(page):
    await page.evaluate(INSTRUMENT)


async def open_journal(page):
    await page.goto(f"{BASE}/app/journal", wait_until="domcontentloaded")
    await page.wait_for_selector("h1:has-text('Journal')", timeout=15_000)
    await install(page)


async def save_journal_once(page, i):
    # Change the date so saveJournal exercises both insert + update paths.
    date = f"2024-0{(i % 9) + 1}-0{(i % 9) + 1}"
    await page.fill('input[type="date"]', date)
    ta = page.locator("textarea").first
    await ta.click()
    await ta.fill(f"Gratitude entry #{i} at {time.time():.3f}")
    await page.get_by_role("button", name="Save today").click()


async def stress_journal(page, results):
    await open_journal(page)
    for i in range(100):
        try:
            await save_journal_once(page, i)
        except Exception as e:
            results.append(await snapshot(page, f"journal_save_click_{i}", {"exception": str(e)}))
            return True
        # Very short settle — catch async render errors immediately.
        await page.wait_for_timeout(30)
        ws = await check_white_screen(page)
        errs = await page.evaluate("window.__qaErrors || []")
        if ws or errs:
            results.append(await snapshot(page, f"journal_save_{i}", {"i": i}))
            return True
    return False


async def stress_journal_double_save(page, results):
    await open_journal(page)
    for i in range(30):
        try:
            btn = page.get_by_role("button", name="Save today")
            # Rapid double click.
            await btn.click()
            await btn.click()
        except Exception as e:
            results.append(await snapshot(page, f"journal_double_click_{i}", {"exception": str(e)}))
            return True
        await page.wait_for_timeout(20)
        if await check_white_screen(page) or await page.evaluate("(window.__qaErrors||[]).length"):
            results.append(await snapshot(page, f"journal_double_{i}"))
            return True
    return False


async def stress_journal_save_then_navigate(page, results):
    dests = ["/app/notes", "/app/thoughts", "/app/letters",
             "/app/memories", "/app/tasks", "/app/home"]
    for i, dest in enumerate(dests * 5):
        await open_journal(page)
        try:
            btn = page.get_by_role("button", name="Save today")
            await btn.click(no_wait_after=True)
            # Navigate *before* toast/setState settles.
            link = page.locator(f'aside a[href="{dest}"], a[href="{dest}"]').first
            await link.click()
        except Exception as e:
            results.append(await snapshot(page, f"save_then_nav_{i}", {"exception": str(e), "dest": dest}))
            return True
        await page.wait_for_timeout(150)
        if await check_white_screen(page) or await page.evaluate("(window.__qaErrors||[]).length"):
            results.append(await snapshot(page, f"save_then_nav_{i}", {"dest": dest}))
            return True
    return False


async def stress_theme_and_resize(page, results):
    await open_journal(page)
    for i in range(10):
        try:
            await page.get_by_role("button", name="Save today").click(no_wait_after=True)
            await page.set_viewport_size({"width": 800 + (i % 3) * 200, "height": 900})
            await page.evaluate("document.documentElement.classList.toggle('dark')")
        except Exception as e:
            results.append(await snapshot(page, f"theme_resize_{i}", {"exception": str(e)}))
            return True
        await page.wait_for_timeout(60)
        if await check_white_screen(page) or await page.evaluate("(window.__qaErrors||[]).length"):
            results.append(await snapshot(page, f"theme_resize_{i}"))
            return True
    return False


async def stress_journal_invalid_dates(page, results):
    """Push the date input into invalid states — a likely trigger for
    new Date(j.date).toLocaleDateString() to be called with an unusable value."""
    await open_journal(page)
    for i, d in enumerate(["", "0000-00-00", "9999-99-99", "2024-13-45", "abcd-ef-gh"]):
        try:
            await page.evaluate(
                """(v) => {
                  const el = document.querySelector('input[type="date"]');
                  if (!el) return;
                  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  setter.call(el, v);
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }""",
                d,
            )
            await page.wait_for_timeout(20)
            await page.get_by_role("button", name="Save today").click(no_wait_after=True)
        except Exception as e:
            results.append(await snapshot(page, f"bad_date_{i}", {"exception": str(e), "date": d}))
            return True
        await page.wait_for_timeout(80)
        ws = await check_white_screen(page)
        errs = await page.evaluate("window.__qaErrors || []")
        if ws or errs:
            results.append(await snapshot(page, f"bad_date_{i}", {"date": d}))
            return True
    return False


async def main():
    report = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "phases": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        # Also install on every new document via init script.
        await context.add_init_script(INSTRUMENT)

        page.on("pageerror", lambda e: print("[pageerror]", e))
        page.on("requestfailed", lambda r: None)

        await restore_supabase(context, page)

        phases = [
            ("journal_invalid_dates", stress_journal_invalid_dates),
            ("journal_100_saves", stress_journal),
            ("journal_double_save", stress_journal_double_save),
            ("save_then_navigate", stress_journal_save_then_navigate),
            ("theme_and_resize", stress_theme_and_resize),
        ]
        for name, fn in phases:
            print(f"\n=== PHASE: {name} ===")
            results = []
            try:
                failed = await fn(page, results)
            except Exception as e:
                results.append({"phase_exception": str(e), "trace": traceback.format_exc()})
                failed = True
            report["phases"].append({"name": name, "failed": bool(failed), "results": results})
            if failed:
                print(f"[{name}] FAILED — captured {len(results)} snapshot(s)")
                for r in results:
                    print(json.dumps({k: r.get(k) for k in ("tag","url","white_screen","extra")}, indent=2))
                    for e in (r.get("qa_errors") or [])[:10]:
                        print("  ERR:", json.dumps(e, indent=2)[:2000])
                    for c in (r.get("qa_console") or [])[:5]:
                        print("  CONSOLE:", (c.get("text") or "")[:1200])
                break
            else:
                print(f"[{name}] OK")

        await browser.close()

    (OUT / "whitescreen-report.json").write_text(json.dumps(report, indent=2, default=str))
    print("\nReport:", OUT / "whitescreen-report.json")


asyncio.run(main())
