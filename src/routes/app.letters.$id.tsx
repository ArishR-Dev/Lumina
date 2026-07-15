import { createFileRoute } from "@tanstack/react-router";
import { EntityDetail } from "@/components/lumina/EntityDetail";

function LetterDetailRoute() {
  const { id } = Route.useParams();
  return <EntityDetail kind="letter" id={id} />;
}

export const Route = createFileRoute("/app/letters/$id")({ component: LetterDetailRoute });
