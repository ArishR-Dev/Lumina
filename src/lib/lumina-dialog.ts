// Global Lumina dialog + feedback API.
//
// A tiny event-based store powers the <LuminaDialogHost /> so any file in the
// app can pop a premium dialog without wiring props through the tree:
//
//   import { luminaDialog, showSuccess } from "@/lib/lumina-dialog";
//   const ok = await luminaDialog.confirm({ title: "Delete?", tone: "danger" });
//
// Toast helpers are thin wrappers over sonner for consistent phrasing/tone.

import type { ReactNode } from "react";
import { toast } from "sonner";

export type DialogTone =
  | "danger"
  | "warning"
  | "success"
  | "error"
  | "info"
  | "neutral";

export type DialogOptions = {
  id?: string;
  tone?: DialogTone;
  title: string;
  description?: ReactNode;
  /** Optional custom body content rendered between description and buttons (e.g. a file card). */
  body?: ReactNode;
  /** Custom icon; falls back to a tone-appropriate default. */
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Hide the cancel button — turns this into an acknowledgement dialog. */
  showCancel?: boolean;
  /** Clicking backdrop / ESC dismisses (default: true). */
  dismissible?: boolean;
  /** If provided, runs on confirm; throwing keeps dialog open. */
  onConfirm?: () => void | Promise<void>;
};

export type DialogRecord = DialogOptions & {
  id: string;
  tone: DialogTone;
  resolve: (confirmed: boolean) => void;
};

type Listener = (state: { queue: DialogRecord[] }) => void;

let queue: DialogRecord[] = [];
let dialogSnapshot: { queue: DialogRecord[] } = { queue };
const listeners = new Set<Listener>();

function emit() {
  dialogSnapshot = { queue: [...queue] };
  listeners.forEach((l) => l(dialogSnapshot));
}

function makeId() {
  return `dlg_${Math.random().toString(36).slice(2, 10)}`;
}

function push(opts: DialogOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const record: DialogRecord = {
      showCancel: true,
      dismissible: true,
      ...opts,
      id: opts.id ?? makeId(),
      tone: opts.tone ?? "neutral",
      resolve,
    };
    queue = [...queue, record];
    emit();
  });
}

function close(id?: string, confirmed = false) {
  if (!id) {
    // close top-most
    const top = queue[queue.length - 1];
    if (!top) return;
    top.resolve(confirmed);
    queue = queue.slice(0, -1);
  } else {
    const found = queue.find((d) => d.id === id);
    if (!found) return;
    found.resolve(confirmed);
    queue = queue.filter((d) => d.id !== id);
  }
  emit();
}

export const luminaDialog = {
  /** Show a fully-custom dialog. Resolves true on confirm, false on dismiss. */
  show: (opts: DialogOptions) => push(opts),
  confirm: (opts: Omit<DialogOptions, "tone"> & { tone?: DialogTone }) =>
    push({ tone: "neutral", ...opts }),
  danger: (opts: Omit<DialogOptions, "tone">) => push({ ...opts, tone: "danger" }),
  warning: (opts: Omit<DialogOptions, "tone">) => push({ ...opts, tone: "warning" }),
  success: (opts: Omit<DialogOptions, "tone">) =>
    push({ ...opts, tone: "success", showCancel: false, confirmLabel: opts.confirmLabel ?? "Okay" }),
  error: (opts: Omit<DialogOptions, "tone">) =>
    push({ ...opts, tone: "error", showCancel: false, confirmLabel: opts.confirmLabel ?? "Close" }),
  info: (opts: Omit<DialogOptions, "tone">) =>
    push({ ...opts, tone: "info", showCancel: false, confirmLabel: opts.confirmLabel ?? "Okay" }),
  close,
  /**
   * Show a global glass loading overlay. Returns a handle with `update()` and
   * `close()` — call `close()` when work finishes. Use `progress` (0..1) for
   * determinate work, or `skeleton: n` for shimmering placeholder rows.
   */
  showLoading: (opts: LoadingOptions = {}) => openLoading(opts),
};

// Internal for the host component
export function subscribeDialogs(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getDialogSnapshot(): { queue: DialogRecord[] } {
  return dialogSnapshot;
}

/* ------------------------------------------------------------------ */
/* Loading overlay store                                              */
/* ------------------------------------------------------------------ */

export type LoadingOptions = {
  id?: string;
  title?: string;
  description?: ReactNode;
  /** Determinate progress in 0..1. Omit for indeterminate shimmer. */
  progress?: number;
  /** true → 3 skeleton rows; number → that many rows. */
  skeleton?: boolean | number;
};

export type LoadingRecord = LoadingOptions & { id: string };

export type LoadingHandle = {
  id: string;
  update: (patch: Partial<LoadingOptions>) => void;
  close: () => void;
};

type LoadingListener = (state: { stack: LoadingRecord[] }) => void;
let loadingStack: LoadingRecord[] = [];
let loadingSnapshot: { stack: LoadingRecord[] } = { stack: loadingStack };
const loadingListeners = new Set<LoadingListener>();
const emitLoading = () => {
  loadingSnapshot = { stack: [...loadingStack] };
  loadingListeners.forEach((l) => l(loadingSnapshot));
};

function openLoading(opts: LoadingOptions): LoadingHandle {
  const id = opts.id ?? `ld_${Math.random().toString(36).slice(2, 10)}`;
  const record: LoadingRecord = { ...opts, id };
  loadingStack = [...loadingStack, record];
  emitLoading();
  return {
    id,
    update(patch) {
      loadingStack = loadingStack.map((r) => (r.id === id ? { ...r, ...patch } : r));
      emitLoading();
    },
    close() {
      const before = loadingStack.length;
      loadingStack = loadingStack.filter((r) => r.id !== id);
      if (loadingStack.length !== before) emitLoading();
    },
  };
}

export function subscribeLoading(l: LoadingListener) {
  loadingListeners.add(l);
  return () => { loadingListeners.delete(l); };
}
export function getLoadingSnapshot(): { stack: LoadingRecord[] } {
  return loadingSnapshot;
}
export function closeAllLoading() {
  if (loadingStack.length === 0) return;
  loadingStack = [];
  emitLoading();
}

/* ------------------------------------------------------------------ */
/* Toasts — thin sonner wrappers so every module speaks one language. */
/* ------------------------------------------------------------------ */

type ToastOpts = { description?: string; duration?: number };

export const showSuccess = (msg: string, opts?: ToastOpts) => toast.success(msg, opts);
export const showError = (msg: string, opts?: ToastOpts) => toast.error(msg, opts);
export const showWarning = (msg: string, opts?: ToastOpts) =>
  toast.warning ? toast.warning(msg, opts) : toast(msg, opts);
export const showInfo = (msg: string, opts?: ToastOpts) => toast(msg, opts);
/** Toast-based loading indicator. For the full-screen glass overlay use `luminaDialog.showLoading(...)`. */
export const showLoadingToast = (msg: string) => toast.loading(msg);
export const dismissToast = (id?: string | number) => toast.dismiss(id);

/* ------------------------------------------------------------------ */
/* Convenience aliases mentioned in the product spec.                 */
/* ------------------------------------------------------------------ */
export const showConfirm = luminaDialog.confirm;
export const closeDialog = luminaDialog.close;
export const showLoading = luminaDialog.showLoading;
