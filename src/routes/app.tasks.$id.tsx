import { createFileRoute } from "@tanstack/react-router";
import { EntityDetail } from "@/components/lumina/EntityDetail";

function TaskDetailRoute() {
  const { id } = Route.useParams();
  return <EntityDetail kind="task" id={id} />;
}

export const Route = createFileRoute("/app/tasks/$id")({ component: TaskDetailRoute });
