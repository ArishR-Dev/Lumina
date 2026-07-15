// Real-waveform peak extraction for voice memories.
//
// Decodes the recorded audio (data URL) once and downsamples the first
// channel into a signed envelope (top + bottom peaks per bin, 0..1
// magnitude) — the shape Voice Memos / Audition / Logic use, not
// equalizer bars. The result is cached per data-URL and shared by the
// paper texture and the DOM waveform in StandardModeScene,
// and the burn-time playback overlay, so the voice is "printed" on the
// paper once and never shifts underneath the flame.

export type VoicePeaks = {
  /** Positive-side peak magnitude per bin, 0..1. */
  top: number[];
  /** Negative-side peak magnitude per bin, 0..1. */
  bottom: number[];
  /** Convenience: max(|top|,|bottom|) per bin — used for ink halos. */
  mag: number[];
};

const peakCache = new Map<string, VoicePeaks>();
const pending = new Map<string, Promise<VoicePeaks>>();

export const DEFAULT_BINS = 600;

export async function computeVoicePeaks(
  dataUrl: string,
  bins = DEFAULT_BINS,
): Promise<VoicePeaks> {
  const key = `${bins}|${dataUrl}`;
  const cached = peakCache.get(key);
  if (cached) return cached;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const job = (async (): Promise<VoicePeaks> => {
    if (typeof window === "undefined") return flat(bins);
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return flat(bins);
    try {
      const res = await fetch(dataUrl);
      const buf = await res.arrayBuffer();
      const ctx = new AC();
      try {
        const audio = await ctx.decodeAudioData(buf.slice(0));
        // Mix all channels down so stereo recordings don't look thin.
        const chs = audio.numberOfChannels;
        const len = audio.length;
        const mixed = new Float32Array(len);
        for (let c = 0; c < chs; c++) {
          const data = audio.getChannelData(c);
          for (let i = 0; i < len; i++) mixed[i] += data[i];
        }
        if (chs > 1) for (let i = 0; i < len; i++) mixed[i] /= chs;

        const top = new Array<number>(bins);
        const bot = new Array<number>(bins);
        const mag = new Array<number>(bins);

        const block = Math.max(1, Math.floor(len / bins));
        let peakAbs = 0.0001;
        for (let i = 0; i < bins; i++) {
          const start = i * block;
          const end = Math.min(len, start + block);
          let hi = 0;
          let lo = 0;
          let sumSq = 0;
          for (let j = start; j < end; j++) {
            const v = mixed[j];
            if (v > hi) hi = v;
            else if (v < lo) lo = v;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / Math.max(1, end - start));
          // Weight: 65% true peak (preserves transients) + 35% RMS (body).
          const t = hi * 0.65 + rms * 0.35;
          const b = -lo * 0.65 + rms * 0.35;
          top[i] = t;
          bot[i] = b;
          const m = Math.max(t, b);
          mag[i] = m;
          if (m > peakAbs) peakAbs = m;
        }

        // Normalize to peak, apply gentle perceptual compression, and
        // floor to a hair above zero so silence still has ink weight.
        const compress = (v: number) => {
          const n = v / peakAbs;
          return Math.max(0.035, Math.min(1, Math.pow(n, 0.72)));
        };
        for (let i = 0; i < bins; i++) {
          top[i] = compress(top[i]);
          bot[i] = compress(bot[i]);
          mag[i] = Math.max(top[i], bot[i]);
        }

        // Light 1-2-1 smoothing so the outline reads as continuous ink,
        // not a spiky bar chart — while transients above still show.
        const smooth = (arr: number[]) => {
          const out = arr.slice();
          for (let i = 1; i < arr.length - 1; i++) {
            out[i] = arr[i - 1] * 0.22 + arr[i] * 0.56 + arr[i + 1] * 0.22;
          }
          return out;
        };
        const result: VoicePeaks = {
          top: smooth(top),
          bottom: smooth(bot),
          mag: smooth(mag),
        };
        peakCache.set(key, result);
        return result;
      } finally {
        try {
          await ctx.close();
        } catch {
          /* ignore */
        }
      }
    } catch {
      const fallback = flat(bins);
      peakCache.set(key, fallback);
      return fallback;
    }
  })();

  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}

export function getCachedVoicePeaks(
  dataUrl: string,
  bins = DEFAULT_BINS,
): VoicePeaks | null {
  return peakCache.get(`${bins}|${dataUrl}`) ?? null;
}

function flat(bins: number): VoicePeaks {
  const t = Array.from({ length: bins }, () => 0.06);
  return { top: t.slice(), bottom: t.slice(), mag: t.slice() };
}

/* ------------------------------------------------------------------ */
/* Shared drawing helpers                                             */
/* ------------------------------------------------------------------ */

/**
 * Build a continuous filled envelope path (SVG "d" string) that runs the
 * top edge left→right and the bottom edge right→left, closing to form
 * a soft mirrored waveform — the shape professional audio software uses.
 * Uses Catmull-Rom → cubic-Bezier so the outline reads as a single
 * organic stroke rather than separated bars.
 */
export function envelopePath(
  peaks: VoicePeaks,
  width: number,
  height: number,
  opts: { minPx?: number; padY?: number } = {},
): string {
  const { top, bottom } = peaks;
  const N = top.length;
  if (N < 2) return "";
  const minPx = opts.minPx ?? 0.6;
  const padY = opts.padY ?? 0;
  const midY = height / 2;
  const halfH = Math.max(0, height / 2 - padY);
  const xs: number[] = new Array(N);
  const yT: number[] = new Array(N);
  const yB: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    xs[i] = (i / (N - 1)) * width;
    const t = Math.max(minPx, top[i] * halfH);
    const b = Math.max(minPx, bottom[i] * halfH);
    yT[i] = midY - t;
    yB[i] = midY + b;
  }
  const topD = catmullRomPath(xs, yT);
  // Bottom edge is a reversed run, appended (start with L to connect the
  // right-most top point to the right-most bottom point).
  const xsR = xs.slice().reverse();
  const yBR = yB.slice().reverse();
  const botD = catmullRomPath(xsR, yBR, /*startWith=*/"L");
  return `${topD} ${botD} Z`;
}

/** Same envelope, but split at `progress` (0..1) into a "played" path
 *  and a "remaining" path. Both share y coordinates so the two paths
 *  meet on a vertical seam at the playhead. */
export function envelopePathSplit(
  peaks: VoicePeaks,
  width: number,
  height: number,
  progress: number,
  opts: { minPx?: number; padY?: number } = {},
): { played: string; remaining: string; seamX: number; midY: number } {
  const { top, bottom } = peaks;
  const N = top.length;
  const minPx = opts.minPx ?? 0.6;
  const padY = opts.padY ?? 0;
  const midY = height / 2;
  const halfH = Math.max(0, height / 2 - padY);
  const p = Math.max(0, Math.min(1, progress));
  const seamX = p * width;

  // Interpolated seam values so the split is exact regardless of bin count.
  const idxF = p * (N - 1);
  const idx0 = Math.floor(idxF);
  const idx1 = Math.min(N - 1, idx0 + 1);
  const f = idxF - idx0;
  const seamTop = midY - Math.max(minPx, (top[idx0] * (1 - f) + top[idx1] * f) * halfH);
  const seamBot = midY + Math.max(minPx, (bottom[idx0] * (1 - f) + bottom[idx1] * f) * halfH);

  const xOf = (i: number) => (i / (N - 1)) * width;
  const tOf = (i: number) => midY - Math.max(minPx, top[i] * halfH);
  const bOf = (i: number) => midY + Math.max(minPx, bottom[i] * halfH);

  // Build "played": bins [0..idx0] plus the seam point at the right.
  const buildFilled = (
    xs: number[],
    yTs: number[],
    yBs: number[],
  ): string => {
    if (xs.length < 2) return "";
    const topD = catmullRomPath(xs, yTs);
    const botD = catmullRomPath(xs.slice().reverse(), yBs.slice().reverse(), "L");
    return `${topD} ${botD} Z`;
  };

  const playedXs: number[] = [];
  const playedYT: number[] = [];
  const playedYB: number[] = [];
  for (let i = 0; i <= idx0; i++) {
    playedXs.push(xOf(i));
    playedYT.push(tOf(i));
    playedYB.push(bOf(i));
  }
  playedXs.push(seamX);
  playedYT.push(seamTop);
  playedYB.push(seamBot);
  const played = buildFilled(playedXs, playedYT, playedYB);

  const remXs: number[] = [seamX];
  const remYT: number[] = [seamTop];
  const remYB: number[] = [seamBot];
  for (let i = idx1; i < N; i++) {
    remXs.push(xOf(i));
    remYT.push(tOf(i));
    remYB.push(bOf(i));
  }
  const remaining = buildFilled(remXs, remYT, remYB);

  return { played, remaining, seamX, midY };
}


/** Catmull-Rom (uniform, tension=0) → cubic Bezier path. */
export function catmullRomPath(xs: number[], ys: number[], startWith: "M" | "L" = "M"): string {
  const n = xs.length;
  if (n === 0) return "";
  if (n === 1) return `${startWith} ${xs[0]} ${ys[0]}`;
  let d = `${startWith} ${xs[0]} ${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i - 1] ?? xs[i];
    const y0 = ys[i - 1] ?? ys[i];
    const x1 = xs[i], y1 = ys[i];
    const x2 = xs[i + 1], y2 = ys[i + 1];
    const x3 = xs[i + 2] ?? x2;
    const y3 = ys[i + 2] ?? y2;
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return d;
}

/** Canvas equivalent: trace a Catmull-Rom polyline into the current path. */
export function traceCatmullRom(
  ctx: CanvasRenderingContext2D,
  xs: number[],
  ys: number[],
  moveTo = true,
): void {
  const n = xs.length;
  if (n === 0) return;
  if (moveTo) ctx.moveTo(xs[0], ys[0]);
  else ctx.lineTo(xs[0], ys[0]);
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i - 1] ?? xs[i];
    const y0 = ys[i - 1] ?? ys[i];
    const x1 = xs[i], y1 = ys[i];
    const x2 = xs[i + 1], y2 = ys[i + 1];
    const x3 = xs[i + 2] ?? x2;
    const y3 = ys[i + 2] ?? y2;
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
  }
}
