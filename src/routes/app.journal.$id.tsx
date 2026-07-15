import { createFileRoute } from "@tanstack/react-router";
import { EntityDetail } from "@/components/lumina/EntityDetail";

function JournalDetailRoute() {
  const { id } = Route.useParams();
  return <EntityDetail kind="journal" id={id} />;
}

export const Route = createFileRoute("/app/journal/$id")({ component: JournalDetailRoute });
