import { createFileRoute } from "@tanstack/react-router";
import { EntityDetail } from "@/components/lumina/EntityDetail";

function MemoryDetailRoute() {
  const { id } = Route.useParams();
  return <EntityDetail kind="memory" id={id} />;
}

export const Route = createFileRoute("/app/memories/$id")({ component: MemoryDetailRoute });
