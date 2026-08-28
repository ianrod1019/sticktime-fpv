ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS controller_id UUID REFERENCES public.gear(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sessions_controller_id_idx ON public.sessions (controller_id);