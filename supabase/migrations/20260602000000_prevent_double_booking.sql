-- Previene il double booking: due prenotazioni non annullate
-- non possono occupare lo stesso campo allo stesso orario.
-- L'indice è parziale (WHERE status <> 'cancelled') per permettere
-- più prenotazioni annullate sullo stesso slot senza conflitti.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_no_double_booking
  ON public.reservations (court_id, starts_at)
  WHERE status <> 'cancelled';
