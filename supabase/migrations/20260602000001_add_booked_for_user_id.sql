-- Aggiunge il riferimento all'utente beneficiario nelle prenotazioni per terzi.
-- Consente di trovare le prenotazioni "ricevute" tramite ID univoco
-- invece di affidarsi solo al nome (che potrebbe matchare omonimi).
-- Il campo è nullable: NULL per prenotazioni normali o per terzi senza profilo in app.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booked_for_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
