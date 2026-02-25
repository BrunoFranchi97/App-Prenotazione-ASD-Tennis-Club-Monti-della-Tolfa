-- 1. Aggiornamento Tabella Profiles per gestire gli stati
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

-- Migrazione dati esistenti: se approved è true -> approved, altrimenti pending
UPDATE public.profiles SET status = 'approved' WHERE approved = true;
UPDATE public.profiles SET status = 'pending' WHERE approved = false;

-- 2. Rimozione vincolo durata fissa (se esiste) per permettere blocchi admin multi-ora
-- Nota: Il nome del constraint potrebbe variare, lo rimuoviamo se presente
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_duration_60') THEN
        ALTER TABLE public.reservations DROP CONSTRAINT reservations_duration_60;
    END IF;
END $$;

-- 3. Trigger per gestire il nuovo status alla creazione
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name, 
    status,
    terms_accepted, 
    personal_data_accepted, 
    health_data_accepted, 
    consent_date
  )
  VALUES (
    new.id, 
    new.raw_user_meta_data ->> 'full_name',
    'pending',
    COALESCE((new.raw_user_meta_data ->> 'terms_accepted')::boolean, FALSE),
    COALESCE((new.raw_user_meta_data ->> 'personal_data_accepted')::boolean, FALSE),
    COALESCE((new.raw_user_meta_data ->> 'health_data_accepted')::boolean, FALSE),
    NOW()
  );
  RETURN new;
END;
$$;