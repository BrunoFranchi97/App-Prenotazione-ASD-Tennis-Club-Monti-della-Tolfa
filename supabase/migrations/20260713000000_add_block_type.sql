-- Colonna per la tipologia di blocco slot admin (Lezione / Manutenzione / Torneo).
-- Resta NULL per tutte le prenotazioni normali dei soci: non tocca booking_type.
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS block_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_block_type_check') THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_block_type_check
      CHECK (block_type IS NULL OR block_type IN ('lezione', 'manutenzione', 'torneo'));
  END IF;
END $$;
