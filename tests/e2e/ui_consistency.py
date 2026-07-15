"""
Lumina — UI Consistency Checks.

Static + runtime lint pass to protect Lumina's premium polish against
regressions. Runs three independent audits:

  1. TOKEN GUARD (static) — greps src/ for hardcoded colors that bypass
     the design-token system: `text-white`, `bg-black`, `text-black`,
     `bg-[#..]`, `text-[#..]`, inline `style="color:#..."`, and raw
     rgb(...) in TSX. `index.css` / `styles.css` are the only files
     allowed to define color literals.

  2. MOTION TIMING (runtime) — walks every interactive element on every
     app route and reads computed `transition-duration`. Any duration
     outside the Lumina motion scale (0ms, 120ms, 150ms, 180ms, 200ms,
     240ms, 300ms, 400ms, 500ms, 560ms, 700ms) is flagged. Prevents
     ad-hoc 250ms / 350ms / 1s transitions creeping in.

  3. INTERACTION STATES (runtime) — for a sample of buttons + links on
     each route, verifies that :hover, :focus-visible and :active each
     produce a visible style delta (bg-color, color, box-shadow, opacity
     or transform). A control that looks identical in all four states
     fails the check.

Run:
  python3 tests/e2e/ui_consistency.py
  ROUTES=home,notes python3 tests/e2e/ui_consistency.py

Report: /mnt/documents/lumina-qa/ui-consistency.{json,md}
Exit code is non-zero on any finding so CI can gate on it.
"""
import asyncio, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
OUT = Path("/mnt/documents/lumina-qa")
OUT.mkdir(parents=True, exist_ok=True)

ALLOWED_DURATIONS_MS = {0, 120, 150, 180, 200, 240, 300, 400, 500, 560, 700}
DURATION_TOLERANCE_MS = 5  # rounding slack

ROUTES = [
    ("home", "/app/home"), ("notes", "/app/notes"),
    ("journal", "/app/journal"), ("thoughts", "/app/thoughts"),
    ("letters", "/app/letters"), ("memories", "/app/memories"),
    ("calendar", "/app/calendar"), ("tasks", "/app/tasks"),
    ("habits", "/app/habits"), ("collections", "/app/collections"),
    ("favorites", "/app/favorites"), ("dashboard", "/app/dashboard"),
    ("insights", "/app/insights"), ("mood", "/app/mood"),
    ("settings", "/app/settings"), ("farewell", "/app/farewell"),
]
if os.environ.get("ROUTES"):
    allowed = set(os.environ["ROUTES"].split(","))
    ROUTES = [r for r in ROUTES if r[0] in allowed]


# ---------- 1. Static token guard ------------------------------------------

FORBIDDEN_PATTERNS = [
    # Tailwind hardcoded neutrals (bypass semantic tokens).
    (re.compile(r'className="[^"]*\btext-white\b'), 'text-white'),
    (re.compile(r'className="[^"]*\btext-black\b'), 'text-black'),
    (re.compile(r'className="[^"]*\bbg-white\b'),   'bg-white'),
    (re.compile(r'className="[^"]*\bbg-black\b'),   'bg-black'),
    # Arbitrary color values in className.
    (re.compile(r'className="[^"]*\b(?:text|bg|border|ring|fill|stroke|from|to|via)-\[#'), 'arbitrary hex color utility'),
    # Inline hex/rgb in style="".
    (re.compile(r'style=\{\{[^}]*(?:color|background)[^}]*#[0-9a-fA-F]{3,8}'), 'inline hex color'),
    (re.compile(r'style=\{\{[^}]*rgb\('), 'inline rgb() color'),
]
# Files where hardcoded colors are legitimate (design tokens live here).
STATIC_ALLOWLIST = {
    "src/styles.css", "src/index.css", "src/App.css",
}


def static_audit(src_root: Path) -> list[dict]:
    findings = []
    for path in src_root.rglob("*"):
        if path.is_dir() or path.suffix not in {".tsx", ".ts", ".css", ".jsx"}:
            continue
        rel = str(path.relative_to(src_root.parent)).replace("\\", "/")
        if rel in STATIC_ALLOWLIST:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            for rx, label in FORBIDDEN_PATTERNS:
                if rx.search(line):
                    findings.append({"file": rel, "line": i, "rule": label,
                                     "snippet": line.strip()[:200]})
    return findings


# ---------- 2 + 3. Runtime audits ------------------------------------------

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


async def audit_motion(page, slug: str) -> list[dict]:
    """Collect every non-zero transition-duration on the page and flag any
    value outside the Lumina motion scale."""
    data = await page.evaluate(
        """() => {
          const out = [];
          const els = document.querySelectorAll('a,button,[role="button"],input,textarea,select,[data-motion]');
          els.forEach((el) => {
            const cs = getComputedStyle(el);
            const durs = cs.transitionDuration.split(',').map(s => s.trim());
            const props = cs.transitionProperty.split(',').map(s => s.trim());
            durs.forEach((d, i) => {
              const ms = d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000;
              if (!ms) return;
              out.push({
                ms: Math.round(ms),
                property: props[i] || props[0] || 'all',
                tag: el.tagName.toLowerCase(),
                cls: (el.getAttribute('class') || '').slice(0, 120),
              });
            });
          });
          return out;
        }"""
    )
    findings = []
    seen = set()
    for row in data:
        ms = row["ms"]
        if any(abs(ms - allowed) <= DURATION_TOLERANCE_MS for allowed in ALLOWED_DURATIONS_MS):
            continue
        key = (ms, row["property"], row["cls"])
        if key in seen:
            continue
        seen.add(key)
        findings.append({"route": slug, **row})
    return findings


async def audit_states(page, slug: str) -> list[dict]:
    """Sample up to 6 interactive controls per route and verify that
    hover / focus-visible / active each produce a computed-style delta."""
    findings = []
    handles = await page.query_selector_all("main a[href], main button:not([disabled])")
    sampled = handles[:6]
    for el in sampled:
        try:
            if not await el.is_visible():
                continue
            box = await el.bounding_box()
            if not box or box["width"] < 8 or box["height"] < 8:
                continue

            snap = lambda: el.evaluate(
                """(e) => {
                  const cs = getComputedStyle(e);
                  return [cs.backgroundColor, cs.color, cs.boxShadow,
                          cs.opacity, cs.transform, cs.outlineColor,
                          cs.borderColor].join('|');
                }"""
            )
            base = await snap()

            # Hover
            await el.hover()
            await page.wait_for_timeout(80)
            hover = await snap()

            # Focus (keyboard = focus-visible)
            await el.evaluate("(e) => e.blur()")
            await page.mouse.move(0, 0)
            await el.focus()
            await page.wait_for_timeout(40)
            focus = await snap()

            # Active — press but don't release.
            await page.mouse.move(box["x"] + box["width"] / 2,
                                  box["y"] + box["height"] / 2)
            await page.mouse.down()
            await page.wait_for_timeout(40)
            active = await snap()
            await page.mouse.up()

            label = (await el.text_content() or "").strip()[:60]
            tag = await el.evaluate("(e) => e.tagName.toLowerCase()")
            missing = []
            if hover == base:  missing.append("hover")
            if focus == base:  missing.append("focus-visible")
            if active == base: missing.append("active")
            if missing:
                findings.append({"route": slug, "tag": tag, "label": label,
                                 "missing_states": missing})
        except Exception:
            continue
    return findings


async def runtime_audits() -> dict:
    motion, states = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()
        await restore_session(context, page)
        for slug, url in ROUTES:
            try:
                await page.goto(f"{BASE}{url}", wait_until="networkidle", timeout=20_000)
                await page.wait_for_selector("h1", timeout=15_000)
                motion += await audit_motion(page, slug)
                states += await audit_states(page, slug)
            except Exception as e:
                motion.append({"route": slug, "error": str(e)})
        await browser.close()
    return {"motion": motion, "states": states}


def render_markdown(static_findings, motion, states) -> str:
    lines = ["# Lumina UI Consistency Report", ""]
    lines.append(f"- Token-guard findings: **{len(static_findings)}**")
    lines.append(f"- Motion-scale violations: **{len(motion)}**")
    lines.append(f"- Missing interaction states: **{len(states)}**")
    lines.append("")
    if static_findings:
        lines.append("## Hardcoded colors (bypass design tokens)")
        for f in static_findings[:200]:
            lines.append(f"- `{f['file']}:{f['line']}` — {f['rule']}\n  ```\n  {f['snippet']}\n  ```")
        lines.append("")
    if motion:
        lines.append("## Off-scale transition durations")
        lines.append(f"Allowed (ms): {sorted(ALLOWED_DURATIONS_MS)}")
        for f in motion[:200]:
            lines.append(f"- `{f.get('route')}` — {f.get('ms')}ms on `{f.get('property')}` "
                         f"({f.get('tag')}) — `{f.get('cls', '')}`")
        lines.append("")
    if states:
        lines.append("## Interactive elements missing state deltas")
        for f in states[:200]:
            lines.append(f"- `{f['route']}` {f['tag']} \"{f['label']}\" → missing {', '.join(f['missing_states'])}")
    return "\n".join(lines)


async def main():
    src_root = Path(__file__).resolve().parents[2] / "src"
    static_findings = static_audit(src_root)
    runtime = await runtime_audits()
    motion, states = runtime["motion"], runtime["states"]

    report = {
        "static": static_findings,
        "motion": motion,
        "states": states,
        "allowed_durations_ms": sorted(ALLOWED_DURATIONS_MS),
    }
    (OUT / "ui-consistency.json").write_text(json.dumps(report, indent=2))
    (OUT / "ui-consistency.md").write_text(render_markdown(static_findings, motion, states))

    total = len(static_findings) + len(motion) + len(states)
    print(f"UI consistency: {len(static_findings)} token, "
          f"{len(motion)} motion, {len(states)} state findings.")
    print(f"Report: {OUT/'ui-consistency.md'}")
    if total:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
