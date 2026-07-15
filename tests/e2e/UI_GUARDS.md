# Lumina — UI regression guards

Two independent scripts protect Lumina's premium polish against silent
regressions. Both are black-box and run against the local dev server
(`http://localhost:8080`) using the injected preview Supabase session.

## 1. Visual regression — `visual_regression.py`

Captures deterministic screenshots of every app route at mobile (390),
tablet (834) and desktop (1440) viewports and diffs them pixel-by-pixel
against committed baselines in `tests/e2e/visuals/baselines/`.

Determinism controls:
- `prefers-reduced-motion` forced on the browser context
- All CSS `animation-duration` / `transition-duration` set to 0
- Caret hidden, focus blurred before capture
- `document.fonts.ready` awaited, `networkidle` before screenshot
- Add `data-visual-volatile` to any element with live timestamps to
  hide it from the frame

Commands:
```bash
python3 tests/e2e/visual_regression.py                 # diff against baseline
UPDATE_BASELINES=1 python3 tests/e2e/visual_regression.py   # refresh baselines
ROUTES=home,notes python3 tests/e2e/visual_regression.py    # subset
PIXEL_TOLERANCE=0.005 python3 tests/e2e/visual_regression.py
```

Outputs: `tests/e2e/visuals/{baselines,current,diffs}/<viewport>/<slug>.png`
plus `report.json`. Non-zero exit code on any regression.

Baselines are committed; `current/` and `diffs/` are gitignored.

## 2. UI consistency — `ui_consistency.py`

Three audits in one pass:

1. **Token guard (static)** — greps `src/` for hardcoded colors that
   bypass the design-token system (`text-white`, `bg-black`,
   `bg-[#..]`, inline hex/rgb). Only `src/styles.css` / `src/index.css`
   / `src/App.css` may declare color literals.
2. **Motion timing (runtime)** — reads computed `transition-duration`
   on every interactive element on every route and flags anything
   outside the Lumina scale (`0, 120, 150, 180, 200, 240, 300, 400,
   500, 560, 700 ms`).
3. **Interaction states (runtime)** — samples buttons/links and
   verifies `:hover`, `:focus-visible` and `:active` each produce a
   computed-style delta from the default. A control that looks
   identical in all four states fails.

Commands:
```bash
python3 tests/e2e/ui_consistency.py
ROUTES=home,notes python3 tests/e2e/ui_consistency.py
```

Report: `/mnt/documents/lumina-qa/ui-consistency.{json,md}`. Non-zero
exit code on any finding.

## When to run

- Locally before any large UI change (baseline drift catches unintended
  cascade edits).
- Refresh baselines (`UPDATE_BASELINES=1`) only when a design change is
  intentional; review the diff PNGs before committing new baselines.
- Both scripts are safe to wire into CI — they exit non-zero on findings.
