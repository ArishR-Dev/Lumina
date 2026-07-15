import { toast } from "sonner";

/**
 * Tiny wrappers so every mutation across Lumina gets consistent, calm
 * language. Keep the surface small on purpose — noisy toasts break the
 * sanctuary feel.
 */
export const notify = {
  saved: (what = "Saved") => toast.success(what),
  created: (what: string) => toast.success(`${what} created`),
  deleted: (what: string) => toast(`${what} removed`, { description: "Gone with care." }),
  archived: (what: string) => toast(`${what} archived`),
  restored: (what: string) => toast.success(`${what} restored`),
  favorited: (isFav: boolean) => toast(isFav ? "Added to favorites" : "Removed from favorites"),
  completed: (what: string) => toast.success(`${what} complete`),
  reopened: (what: string) => toast(`${what} reopened`),
  error: (msg = "Something went wrong") => toast.error(msg),
};
