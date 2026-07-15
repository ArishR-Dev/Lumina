import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ImageViewer — native-feel lightbox.
 *
 *   - Pinch to zoom, anchored on the midpoint between fingers
 *   - Double-tap toggles zoom (2×) around the tap point
 *   - Pan when zoomed, clamped with elastic overshoot and spring-back
 *   - Swipe down to dismiss (only at base zoom); backdrop fades proportionally
 *   - Skeleton spinner before decode, fade-in after; no white flash
 *   - Safe-area padding for notch and bottom navigation
 *   - Escape closes on desktop
 */
type Props = {
  src: string | null;
  alt?: string;
  onClose: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_ZOOM = 2;
const DISMISS_THRESHOLD = 140;
const DOUBLE_TAP_MS = 280;

export function ImageViewer({ src, alt = "", onClose }: Props) {
  const [loaded, setLoaded] = useState(false);

  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Backdrop fades as user drags the image toward dismissal.
  const backdrop = useTransform(y, [-DISMISS_THRESHOLD, 0, DISMISS_THRESHOLD], [0.4, 1, 0.4]);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Pinch bookkeeping.
  const pinch = useRef({
    active: false,
    startDist: 0,
    startScale: 1,
    // point in image space that must stay under the fingers' midpoint
    anchorImgX: 0,
    anchorImgY: 0,
    startTx: 0,
    startTy: 0,
  });
  const lastTap = useRef(0);
  const dragging = useRef(false);

  // Reset on new image.
  useEffect(() => {
    if (!src) return;
    setLoaded(false);
    scale.set(1);
    x.set(0);
    y.set(0);
  }, [src, scale, x, y]);

  // Escape closes.
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);

  // Compute pan bounds for the current scale so the image can't fly off screen
  // (with a little elastic slack allowed during the gesture).
  const bounds = useCallback(() => {
    const el = imgRef.current;
    const s = scale.get();
    if (!el || s <= 1) return { maxX: 0, maxY: 0 };
    const rect = el.getBoundingClientRect();
    // rect already reflects current scale; base size = rect / s.
    const overflowX = Math.max(0, (rect.width - window.innerWidth) / 2);
    const overflowY = Math.max(0, (rect.height - window.innerHeight) / 2);
    return { maxX: overflowX, maxY: overflowY };
  }, [scale]);

  const clampedSet = useCallback(
    (nx: number, ny: number, elastic = 0) => {
      const { maxX, maxY } = bounds();
      const cx = Math.max(-maxX - elastic, Math.min(maxX + elastic, nx));
      const cy = Math.max(-maxY - elastic, Math.min(maxY + elastic, ny));
      x.set(cx);
      y.set(cy);
    },
    [bounds, x, y],
  );

  const springBack = useCallback(() => {
    const { maxX, maxY } = bounds();
    const tx = Math.max(-maxX, Math.min(maxX, x.get()));
    const ty = Math.max(-maxY, Math.min(maxY, y.get()));
    animate(x, tx, { type: "spring", stiffness: 320, damping: 32 });
    animate(y, ty, { type: "spring", stiffness: 320, damping: 32 });
  }, [bounds, x, y]);

  // Zoom around a screen point (clientX, clientY) to targetScale.
  const zoomTo = useCallback(
    (targetScale: number, clientX?: number, clientY?: number) => {
      const el = imgRef.current;
      if (!el) {
        animate(scale, targetScale, { type: "spring", stiffness: 260, damping: 28 });
        return;
      }
      const rect = el.getBoundingClientRect();
      const cx = clientX ?? rect.left + rect.width / 2;
      const cy = clientY ?? rect.top + rect.height / 2;
      const s = scale.get();
      // Offset from image center to tap point in current screen space.
      const dx = cx - (rect.left + rect.width / 2);
      const dy = cy - (rect.top + rect.height / 2);
      // Convert to image-local coordinate (scale-invariant).
      const localX = dx / s;
      const localY = dy / s;
      // New translation keeps that local point under the tap point.
      const newTx = x.get() + localX * (s - targetScale);
      const newTy = y.get() + localY * (s - targetScale);
      animate(scale, targetScale, { type: "spring", stiffness: 260, damping: 28 });
      const { maxX, maxY } = (() => {
        // Approximate bounds at target scale using current base rect.
        const baseW = rect.width / s;
        const baseH = rect.height / s;
        const w = baseW * targetScale;
        const h = baseH * targetScale;
        return {
          maxX: Math.max(0, (w - window.innerWidth) / 2),
          maxY: Math.max(0, (h - window.innerHeight) / 2),
        };
      })();
      animate(x, Math.max(-maxX, Math.min(maxX, targetScale === 1 ? 0 : newTx)), {
        type: "spring",
        stiffness: 260,
        damping: 28,
      });
      animate(y, Math.max(-maxY, Math.min(maxY, targetScale === 1 ? 0 : newTy)), {
        type: "spring",
        stiffness: 260,
        damping: 28,
      });
    },
    [scale, x, y],
  );

  const dist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const mid = (t: React.TouchList) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  });

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const el = imgRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const m = mid(e.touches);
        const s = scale.get();
        pinch.current = {
          active: true,
          startDist: dist(e.touches),
          startScale: s,
          anchorImgX: (m.x - (rect.left + rect.width / 2)) / s,
          anchorImgY: (m.y - (rect.top + rect.height / 2)) / s,
          startTx: x.get(),
          startTy: y.get(),
        };
      } else if (e.touches.length === 1) {
        // Double-tap
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          const s = scale.get();
          if (s > 1) zoomTo(1);
          else zoomTo(DOUBLE_ZOOM, e.touches[0].clientX, e.touches[0].clientY);
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      }
    },
    [scale, x, y, zoomTo],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (pinch.current.active && e.touches.length === 2) {
        e.preventDefault();
        const p = pinch.current;
        const d = dist(e.touches);
        const nextScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE * 0.9, (d / p.startDist) * p.startScale),
        );
        const m = mid(e.touches);
        const el = imgRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // Keep anchor image-point under current midpoint.
        const centerScreenX = rect.left + rect.width / 2 + (x.get() - p.startTx);
        const centerScreenY = rect.top + rect.height / 2 + (y.get() - p.startTy);
        const targetTx = p.startTx + (m.x - centerScreenX - p.anchorImgX * (nextScale - p.startScale));
        const targetTy = p.startTy + (m.y - centerScreenY - p.anchorImgY * (nextScale - p.startScale));
        scale.set(nextScale);
        clampedSet(targetTx, targetTy, 40);
      }
    },
    [scale, x, clampedSet],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2 && pinch.current.active) {
        pinch.current.active = false;
        // Clamp scale + spring back into bounds.
        const s = scale.get();
        if (s < MIN_SCALE) {
          animate(scale, MIN_SCALE, { type: "spring", stiffness: 260, damping: 28 });
          animate(x, 0, { type: "spring", stiffness: 260, damping: 28 });
          animate(y, 0, { type: "spring", stiffness: 260, damping: 28 });
        } else {
          springBack();
        }
      }
    },
    [scale, x, y, springBack],
  );

  // Desktop: ctrl/cmd + wheel to zoom, double-click to toggle.
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 3) return;
      e.preventDefault();
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.get() - e.deltaY * 0.01));
      zoomTo(next, e.clientX, e.clientY);
    },
    [scale, zoomTo],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const s = scale.get();
      if (s > 1) zoomTo(1);
      else zoomTo(DOUBLE_ZOOM, e.clientX, e.clientY);
    },
    [scale, zoomTo],
  );

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/85 backdrop-blur-md touch-none"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
            paddingRight: "max(0.5rem, env(safe-area-inset-right))",
          }}
        >
          {/* Backdrop tint follows dismiss drag */}
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black/85"
            style={{ opacity: backdrop }}
          />

          {!loaded && (
            <div
              className="pointer-events-none absolute inset-0 grid place-items-center text-white/80"
              aria-hidden="true"
            >
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}

          <motion.div
            className="relative flex h-full w-full items-center justify-center"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
          >
            <motion.img
              ref={imgRef}
              src={src}
              alt={alt}
              draggable={false}
              loading="eager"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onDoubleClick={onDoubleClick}
              // Enable framer drag only for the swipe-down-to-dismiss gesture at
              // base zoom. When zoomed, pan is handled by pinch math above.
              drag={"y"}
              dragListener={scale.get() <= 1}
              dragElastic={0.5}
              dragMomentum={false}
              dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
              onDragStart={() => {
                dragging.current = true;
              }}
              onDragEnd={(_, info) => {
                dragging.current = false;
                if (scale.get() <= 1 && Math.abs(info.offset.y) > DISMISS_THRESHOLD) {
                  onClose();
                  return;
                }
                animate(y, 0, { type: "spring", stiffness: 320, damping: 32 });
              }}
              style={{
                x,
                y,
                scale,
                touchAction: "none",
                willChange: "transform",
                transformOrigin: "center center",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: loaded ? 1 : 0 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.22 }}
              className="max-h-[90dvh] max-w-[96vw] select-none rounded-2xl object-contain shadow-2xl"
            />
          </motion.div>

          <button
            onClick={onClose}
            type="button"
            aria-label="Close preview"
            className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 touch-manipulation"
            style={{ top: "max(1rem, env(safe-area-inset-top))" }}
          >
            <X className="h-5 w-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
