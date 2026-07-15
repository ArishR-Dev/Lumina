import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/lumina-auth";
import { useAdminAccess, adminSessionIdleMs } from "@/lib/admin-access";
import { AdminPasswordModal } from "./AdminPasswordModal";

/** Global hidden admin entry: Ctrl+Shift+S, session keepalive, post-auth navigation. */
export function AdminAccessHost() {
  const userId = useAuth((s) => s.user?.id);
  const navigate = useNavigate();
  const hydrateFromStorage = useAdminAccess((s) => s.hydrateFromStorage);
  const modalOpen = useAdminAccess((s) => s.modalOpen);
  const pendingNavigate = useAdminAccess((s) => s.pendingNavigate);
  const setModalOpen = useAdminAccess((s) => s.setModalOpen);
  const isSessionActive = useAdminAccess((s) => s.isSessionActive);
  const touchSession = useAdminAccess((s) => s.touchSession);
  const clearSession = useAdminAccess((s) => s.clearSession);
  const expiresAt = useAdminAccess((s) => s.expiresAt);

  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage, userId]);

  useEffect(() => {
    if (!userId) {
      void clearSession();
    }
  }, [userId, clearSession]);

  // Desktop secret shortcut: Ctrl + Shift + S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!userId) return;
      const t = e.target as HTMLElement | null;
      const inField = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable;
      if (inField) return;

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        useAdminAccess.getState().requestAccess(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userId]);

  // Navigate to hidden dashboard after successful password entry
  useEffect(() => {
    if (modalOpen || !pendingNavigate) return;
    if (!isSessionActive()) return;
    setModalOpen(false);
    useAdminAccess.setState({ pendingNavigate: false });
    navigate({ to: "/app/admin/gifts" });
  }, [modalOpen, pendingNavigate, isSessionActive, setModalOpen, navigate, expiresAt]);

  // Keep server session alive on activity; expire after idle window
  useEffect(() => {
    if (!userId || !isSessionActive()) return;

    const resetIdle = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        void clearSession();
      }, adminSessionIdleMs());
    };

    const onActivity = () => {
      resetIdle();
      void touchSession();
    };

    resetIdle();
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    const interval = window.setInterval(
      () => {
        if (!isSessionActive()) void clearSession();
        else void touchSession();
      },
      5 * 60 * 1000,
    );

    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.clearInterval(interval);
    };
  }, [userId, isSessionActive, touchSession, clearSession, expiresAt]);

  return <AdminPasswordModal />;
}
