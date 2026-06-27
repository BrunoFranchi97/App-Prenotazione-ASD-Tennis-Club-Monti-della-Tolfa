-- Tabella torneo: configurazione singola del torneo sociale (nome, date, locandina)
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  description TEXT,
  start_date DATE,
  end_date DATE,
  poster_url TEXT,
  -- 'auto' = attivo in base alle date, 'on' = forza attivo, 'off' = forza disattivo
  override_mode TEXT NOT NULL DEFAULT 'auto' CHECK (override_mode IN ('auto', 'on', 'off')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Riga iniziale di configurazione (singola)
INSERT INTO public.tournaments (name, override_mode)
SELECT '', 'off'
WHERE NOT EXISTS (SELECT 1 FROM public.tournaments);

-- RLS: lettura pubblica (i soci vedono lo stato torneo), scrittura solo admin
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura pubblica tournaments"
  ON public.tournaments FOR SELECT
  USING (true);

CREATE POLICY "Inserimento solo admin tournaments"
  ON public.tournaments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "Aggiornamento solo admin tournaments"
  ON public.tournaments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Storage bucket pubblico per le locandine del torneo
INSERT INTO storage.buckets (id, name, public)
VALUES ('tournament-posters', 'tournament-posters', true)
ON CONFLICT (id) DO NOTHING;

-- Lettura pubblica delle locandine
CREATE POLICY "Lettura pubblica locandine torneo"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tournament-posters');

-- Upload locandine solo admin
CREATE POLICY "Upload locandine torneo solo admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tournament-posters'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Aggiornamento locandine solo admin
CREATE POLICY "Aggiornamento locandine torneo solo admin"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'tournament-posters'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Eliminazione locandine solo admin
CREATE POLICY "Eliminazione locandine torneo solo admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'tournament-posters'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
