"""
Journal timeline selection — reproduction against LIVE store state.

Works regardless of what useLuminaSync merges from Supabase: we read the
actual rendered journal[] from React's store, then verify every timeline
click ends with the editor showing that exact record's fields.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
OUT = Path("/mnt/documents/lumina-qa"); OUT.mkdir(parents=True, exist_ok=True)


async def restore_supabase(context, page):
    sk = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cj = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cj:
        cookies = json.loads(cj)
        for c in cookies: c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE, wait_until="domcontentloaded")
    if sk and sj:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(sk)}, {json.dumps(sj)})"
        )


# Seed 30 journal entries with UNIQUE, unmistakable content and DISTINCT dates
# far in the past so they don't collide with remote data. Push them into the
# live zustand store after mount so sync's initialSync can't overwrite them.
SEED_LIVE = r"""
async (count) => {
  // Grab the store via the module cache: we import it the same way route code does.
  const mod = await import('/src/lib/lumina-store.ts');
  const { useLumina } = mod;
  const uid = () => 'seed_' + Math.random().toString(36).slice(2, 10);
  const baseYear = 1990; // safely far past — no remote collisions
  const entries = [];
  for (let i = 0; i < count; i++) {
    const y = baseYear + Math.floor(i / 12);
    const m = String((i % 12) + 1).padStart(2, '0');
    const d = String((i % 27) + 1).padStart(2, '0');
    entries.push({
      id: uid(),
      date: `${y}-${m}-${d}`,
      mood: '🌸',
      gratitude: `SEED_GRAT_${i}`,
      reflection: `SEED_REFL_${i}`,
      highlight: `SEED_HIGH_${i}`,
      createdAt: Date.now() - i * 1000,
    });
  }
  const state = useLumina.getState();
  useLumina.setState({ journal: [...entries, ...state.journal] });
  return entries.length;
}
"""


READ_STORE_JOURNAL = r"""
async () => {
  const mod = await import('/src/lib/lumina-store.ts');
  return mod.useLumina.getState().journal.map(j => ({
    id: j.id, date: j.date, mood: j.mood, gratitude: j.gratitude,
    reflection: j.reflection, highlight: j.highlight,
  }));
}
"""


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 1600})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"[{m.type}] {m.text[:200]}") if m.type == "error" else None)

        await restore_supabase(ctx, page)
        await page.goto(f"{BASE}/app/journal", wait_until="domcontentloaded")
        await page.wait_for_selector("h1:has-text('Journal')", timeout=15_000)
        await page.wait_for_selector("button:has-text('Save today')")
        # Give initialSync some time so we seed after it settles.
        await page.wait_for_timeout(2000)

        seeded = await page.evaluate(SEED_LIVE, 30)
        print("seeded live:", seeded)
        await page.wait_for_timeout(300)

        journal = await page.evaluate(READ_STORE_JOURNAL)
        seed_records = [j for j in journal if j["id"].startswith("seed_")]
        print("store journal total:", len(journal), " seed records:", len(seed_records))

        # Verify: for each seed record, find its Timeline button (by unique gratitude
        # text), click it, then verify editor date + fields.
        failures = []
        for idx, rec in enumerate(seed_records):
            needle = rec["gratitude"]
            clicked = await page.evaluate(r"""
              (needle) => {
                const btns = Array.from(document.querySelectorAll('main button'));
                for (const b of btns) {
                  if ((b.innerText||'').includes(needle)) {
                    b.scrollIntoView({block:'center'});
                    b.click();
                    return { ok: true, text: b.innerText.slice(0, 200) };
                  }
                }
                return { ok: false };
              }
            """, needle)
            if not clicked["ok"]:
                failures.append({"idx": idx, "date": rec["date"], "reason": "button-not-visible", "needle": needle})
                break

            await page.wait_for_timeout(60)
            state = await page.evaluate(r"""
              () => {
                const dateEl = document.querySelector('input[type="date"]');
                const tas = Array.from(document.querySelectorAll('textarea'));
                return {
                  date: dateEl ? dateEl.value : null,
                  ta0: tas[0]?.value ?? '',
                  ta1: tas[1]?.value ?? '',
                  ta2: tas[2]?.value ?? '',
                };
              }
            """)
            ok = (
                state["date"] == rec["date"]
                and state["ta0"] == rec["gratitude"]
                and state["ta1"] == rec["reflection"]
                and state["ta2"] == rec["highlight"]
            )
            if not ok:
                failures.append({
                    "idx": idx,
                    "expected_date": rec["date"], "editor_date": state["date"],
                    "expected_grat": rec["gratitude"], "editor_grat": state["ta0"][:80],
                    "expected_refl": rec["reflection"], "editor_refl": state["ta1"][:80],
                    "expected_high": rec["highlight"], "editor_high": state["ta2"][:80],
                })
                await page.screenshot(path=str(OUT / f"jt_fail_{idx}.png"))
                # Continue a few more clicks to see the pattern.
                if len(failures) >= 5: break

        report = {
            "seed_count": len(seed_records),
            "clicks_ok": len(seed_records) - len(failures),
            "failures": failures,
            "console_errors": errors[:20],
        }
        (OUT / "journal-timeline-report.json").write_text(json.dumps(report, indent=2))
        print("\n=== SUMMARY ===")
        print(f"seed_count      : {report['seed_count']}")
        print(f"clicks passed   : {report['clicks_ok']}")
        print(f"first failures  :")
        for f in failures[:5]:
            print("  ", json.dumps(f, indent=2))
        await browser.close()


asyncio.run(main())
