-- Migrazione: aggiunge il campo is_paid alla tabella reservations
-- Eseguire questo script nel SQL Editor di Supabase

ALTER TABLE public.reservations
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE;

-- Commento esplicativo sulla colonna
COMMENT ON COLUMN public.reservations.is_paid IS 'Indica se questa ora di prenotazione e'' stata pagata dal socio. Gestito dagli admin dalla bacheca prenotazioni.';
