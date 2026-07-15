import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/notes")({ component: () => <Outlet /> });
