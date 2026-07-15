import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Flower2 } from "lucide-react";
import { useLumina } from "@/lib/lumina-store";

export const Route = createFileRoute("/app/notes/new")({ component: NewNoteRoute });

function NewNoteRoute() {
  const addNote = useLumina((s) => s.addNote);
  const navigate = useNavigate();
  const created = useRef(false);

  useEffect(() => {
    if (created.current) return;
    created.current = true;
    const n = addNote({ title: "", content: "" });
    navigate({ to: "/app/notes/$id", params: { id: n.id }, replace: true });
  }, [addNote, navigate]);

  return (
    <div className="grid min-h-[50vh] w-full place-items-center text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <Flower2 className="h-6 w-6 animate-pulse text-primary" />
        <div className="font-hand text-lg">opening a fresh page…</div>
      </div>
    </div>
  );
}
