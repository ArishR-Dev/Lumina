import { createFileRoute } from "@tanstack/react-router";
import { EntityDetail } from "@/components/lumina/EntityDetail";

function CapsuleDetailRoute() {
  const { id } = Route.useParams();
  return <EntityDetail kind="capsule" id={id} />;
}

export const Route = createFileRoute("/app/capsules/$id")({ component: CapsuleDetailRoute });
