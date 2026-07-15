/**
 * MatchFire — a lit matchstick you can position/rotate anywhere,
 * plus a helper to drag it along the edge of a target element
 * (e.g. to light a paper/letter).
 *
 * This module is the supplied MatchFire JavaScript, adapted only enough
 * to be a TypeScript ES module (types on public options, ES exports).
 * All internal logic — DOM template, easing, wobble, lean, timing,
 * lifecycle, callbacks — is intentionally identical to the source.
 */

function mfRand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MatchFire {
  length: number;
  el: HTMLDivElement;
  flameLeanEl: HTMLElement | null;
  private _lean: number;

  constructor(opts: { length?: number } = {}) {
    this.length = opts.length || 130;

    this.el = document.createElement("div");
    this.el.className = "match-fire";
    this.el.innerHTML =
      '<div class="mf-tremor">' +
        '<div class="mf-stick" style="width:' + this.length + 'px"></div>' +
        '<div class="mf-flame-lean">' +
          '<div class="mf-flame">' + this._burnDivs(50, -75, 75, 1, 10, 500, 1500) + '</div>' +
          '<div class="mf-flame-core">' + this._burnDivs(28, -40, 40, 1, 6, 350, 850) + '</div>' +
          this._smokeDivs(4) +
          this._sparkDivs(6) +
        '</div>' +
      '</div>';

    this.flameLeanEl = this.el.querySelector<HTMLElement>(".mf-flame-lean");
    this._lean = 0;
  }

  private _burnDivs(
    n: number, mlMin: number, mlMax: number,
    hMin: number, hMax: number, durMin: number, durMax: number,
  ): string {
    let html = "";
    for (let i = 0; i < n; i++) {
      const h = Math.round(mfRand(hMin, hMax));
      const ml = Math.round(mfRand(mlMin, mlMax));
      const dur = Math.round(mfRand(durMin, durMax));
      const delay = -Math.round(mfRand(0, durMax));
      html += '<div class="mf-burn" style="height:' + h + "px;" +
        "margin-left:" + ml + "px;" +
        "animation-duration:" + dur + "ms;" +
        "animation-delay:" + delay + 'ms"></div>';
    }
    return html;
  }

  private _smokeDivs(n: number): string {
    let html = "";
    for (let i = 0; i < n; i++) {
      const left = Math.round(mfRand(-15, 20));
      const dur = Math.round(mfRand(2200, 3200));
      const delay = -Math.round(mfRand(0, dur));
      html += '<div class="mf-smoke" style="left:' + left + "px;" +
        "animation-duration:" + dur + "ms;" +
        "animation-delay:" + delay + 'ms"></div>';
    }
    return html;
  }

  private _sparkDivs(n: number): string {
    let html = "";
    for (let i = 0; i < n; i++) {
      const left = Math.round(mfRand(-15, 15));
      const sx = Math.round(mfRand(-35, 45));
      const sy = -Math.round(mfRand(35, 90));
      const dur = Math.round(mfRand(700, 1150));
      const delay = -Math.round(mfRand(0, dur));
      html += '<div class="mf-spark" style="left:' + left + "px;" +
        "--sx:" + sx + "px;--sy:" + sy + "px;" +
        "animation-duration:" + dur + "ms;" +
        "animation-delay:" + delay + 'ms"></div>';
    }
    return html;
  }

  mount(parent?: HTMLElement | null): this {
    (parent || document.body).appendChild(this.el);
    return this;
  }

  ignite(): this {
    this.el.classList.add("is-lit");
    return this;
  }

  extinguish(): this {
    this.el.classList.remove("is-lit");
    return this;
  }

  /** Position the flame tip at (x, y) in page coordinates, rotated by angleDeg. */
  setPosition(x: number, y: number, angleDeg?: number): this {
    this.el.style.transform =
      "translate(" + x + "px, " + y + "px) rotate(" + (angleDeg || 0) + "deg)";
    return this;
  }

  /** Extra local rotation applied only to the flame, so it can lean/trail
   *  independently of the stick — e.g. opposite to the direction of travel. */
  setLean(deg: number): this {
    if (this.flameLeanEl) {
      this.flameLeanEl.style.transform = "rotate(" + deg + "deg)";
    }
    this._lean = deg;
    return this;
  }

  destroy(): void {
    this.el.remove();
  }
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export type BurnEdge = "top" | "bottom" | "left" | "right";

export type BurnLetterOptions = {
  edge?: BurnEdge;
  duration?: number;
  holdBefore?: number;
  angle?: number;
  lean?: boolean;
  wobble?: boolean;
  length?: number;
  parent?: HTMLElement | null;
  onStart?: () => void;
  onProgress?: (p: { x: number; y: number; progress: number }) => void;
  onComplete?: () => void;
};

/**
 * Drag a lit match along one edge of `target`, from one corner to the other.
 */
export function burnLetter(target: HTMLElement, options: BurnLetterOptions = {}): MatchFire {
  const edge: BurnEdge = options.edge || "bottom";
  const duration = options.duration != null ? options.duration : 1800;
  const holdBefore = options.holdBefore != null ? options.holdBefore : 250;
  const useLean = options.lean !== false;
  const useWobble = options.wobble !== false;

  const rect = target.getBoundingClientRect();
  const sx = window.scrollX, sy = window.scrollY;

  const EDGES: Record<BurnEdge, { start: { x: number; y: number }; end: { x: number; y: number }; angle: number }> = {
    bottom: {
      start: { x: rect.left + sx, y: rect.bottom + sy },
      end:   { x: rect.right + sx, y: rect.bottom + sy },
      angle: 70,
    },
    top: {
      start: { x: rect.left + sx, y: rect.top + sy },
      end:   { x: rect.right + sx, y: rect.top + sy },
      angle: -110,
    },
    left: {
      start: { x: rect.left + sx, y: rect.top + sy },
      end:   { x: rect.left + sx, y: rect.bottom + sy },
      angle: 160,
    },
    right: {
      start: { x: rect.right + sx, y: rect.top + sy },
      end:   { x: rect.right + sx, y: rect.bottom + sy },
      angle: -20,
    },
  };

  const chosen = EDGES[edge] || EDGES.bottom;
  const start = chosen.start, end = chosen.end;
  const angle = options.angle != null ? options.angle : chosen.angle;

  // perpendicular unit vector to the travel path, for the hand-wobble
  const dx = end.x - start.x, dy = end.y - start.y;
  const pathLen = Math.hypot(dx, dy) || 1;
  const perpX = -dy / pathLen, perpY = dx / pathLen;
  const wobbleCycles = 2 + Math.random();
  const wobblePhase = Math.random() * Math.PI * 2;
  const wobbleAmp = 3;

  const match = new MatchFire(options).mount(options.parent);
  match.setPosition(start.x, start.y, angle);

  requestAnimationFrame(() => match.ignite());
  options.onStart && options.onStart();

  setTimeout(() => {
    const t0 = performance.now();
    let prevX = start.x, prevY = start.y;
    let smoothedLean = 0;

    function frame(now: number) {
      const t = Math.min((now - t0) / duration, 1);
      const eased = easeInOutQuad(t);

      let x = start.x + dx * eased;
      let y = start.y + dy * eased;

      if (useWobble) {
        const wobble = wobbleAmp * Math.sin(eased * Math.PI * wobbleCycles + wobblePhase) * Math.sin(eased * Math.PI);
        x += perpX * wobble;
        y += perpY * wobble;
      }

      if (useLean) {
        const vx = x - prevX, vy = y - prevY;
        if (Math.hypot(vx, vy) > 0.05) {
          const travelBackward = Math.atan2(-vy, -vx) * 180 / Math.PI;
          // flame's neutral local orientation points "up" (-90deg absolute
          // before the stick's own rotation is applied)
          const targetAbsolute = travelBackward;
          const neutralAbsolute = -90 + angle;
          let leanTarget = shortestAngleDelta(neutralAbsolute, targetAbsolute);
          leanTarget = Math.max(-32, Math.min(32, leanTarget * 0.5));
          smoothedLean += (leanTarget - smoothedLean) * 0.25;
        } else {
          smoothedLean += (0 - smoothedLean) * 0.1;
        }
        match.setLean(smoothedLean);
      }

      match.setPosition(x, y, angle);
      options.onProgress && options.onProgress({ x: x, y: y, progress: eased });

      prevX = x; prevY = y;

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        match.extinguish();
        setTimeout(() => {
          match.destroy();
          options.onComplete && options.onComplete();
        }, 250);
      }
    }

    requestAnimationFrame(frame);
  }, holdBefore);

  return match;
}
