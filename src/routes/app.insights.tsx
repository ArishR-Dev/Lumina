import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/insights")({
  beforeLoad: () => {
    throw redirect({ to: "/app/dashboard" });
  },
});
