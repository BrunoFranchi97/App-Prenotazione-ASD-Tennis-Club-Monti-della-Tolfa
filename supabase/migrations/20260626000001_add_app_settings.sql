-- Tabella impostazioni globali dell'app (key-value)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT 'false',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Valore iniziale: torneo non in corso
INSERT INTO public.app_settings (key, value)
VALUES ('torneo_in_corso', 'false')
ON CONFLICT (key) DO NOTHING;

-- RLS: lettura pubblica, scrittura solo admin via service role
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura pubblica app_settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Scrittura solo admin app_settings"
  ON public.app_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
