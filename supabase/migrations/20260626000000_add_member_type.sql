-- Aggiunge la colonna member_type alla tabella profiles
-- Valori: 'socio_effettivo' | 'frequentatore_occasionale'
-- Default: 'socio_effettivo' (tutti i profili esistenti diventano soci effettivi)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'socio_effettivo'
  CHECK (member_type IN ('socio_effettivo', 'frequentatore_occasionale'));

-- Aggiorna il trigger handle_new_user per includere member_type dai metadati signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    terms_accepted,
    personal_data_accepted,
    health_data_accepted,
    consent_date,
    member_type
  ) VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    (NEW.raw_user_meta_data->>'terms_accepted')::boolean,
    (NEW.raw_user_meta_data->>'personal_data_accepted')::boolean,
    (NEW.raw_user_meta_data->>'health_data_accepted')::boolean,
    NOW(),
    COALESCE(NEW.raw_user_meta_data->>'member_type', 'socio_effettivo')
  )
  ON CONFLICT (id) DO UPDATE SET
    member_type = COALESCE(EXCLUDED.member_type, 'socio_effettivo');

  RETURN NEW;
END;
$$;
