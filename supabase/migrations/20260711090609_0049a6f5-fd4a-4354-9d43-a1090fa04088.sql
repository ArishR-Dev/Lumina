
-- Drop old aggregate sync_docs (safe: users can re-sync from local cache on next sign-in)
DROP TABLE IF EXISTS public.sync_docs CASCADE;

CREATE TABLE public.sync_docs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity text NOT NULL,
  record_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity, record_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_docs TO authenticated;
GRANT ALL ON public.sync_docs TO service_role;

ALTER TABLE public.sync_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_docs_owner_all ON public.sync_docs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX sync_docs_user_entity_idx ON public.sync_docs (user_id, entity);
CREATE INDEX sync_docs_updated_idx ON public.sync_docs (user_id, updated_at DESC);

CREATE TRIGGER sync_docs_touch
  BEFORE UPDATE ON public.sync_docs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_docs;
ALTER TABLE public.sync_docs REPLICA IDENTITY FULL;

-- Versioned backups
CREATE TABLE public.backups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Backup',
  auto boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY backups_owner_all ON public.backups
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX backups_user_created_idx ON public.backups (user_id, created_at DESC);
