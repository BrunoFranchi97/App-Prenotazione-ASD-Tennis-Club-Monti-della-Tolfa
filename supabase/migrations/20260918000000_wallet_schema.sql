-- Portafoglio (wallet) e pagamenti in-app — schema.
-- Piano completo: docs/piano-wallet-pagamenti.md
--
-- Principi:
--  - Importi sempre in centesimi interi.
--  - Il saldo (wallets) non si scrive mai direttamente: ogni variazione passa da
--    public.wallet_post(), che registra il movimento in wallet_ledger e aggiorna il
--    saldo nella stessa transazione.
--  - Nessuna policy di INSERT/UPDATE/DELETE per i soci sulle nuove tabelle: si scrive
--    solo tramite funzioni SECURITY DEFINER (migration successiva).
--  - Nessuna modifica alle policy esistenti di reservations (rischio R1 accettato).

-- ---------------------------------------------------------------------------
-- Impostazioni (tabella esistente app_settings)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value) VALUES
  ('pagamenti_attivi', 'false'),            -- feature flag globale
  ('ricarica_tagli', '[1000,2000,5000]'),   -- tagli suggeriti, centesimi
  ('luci_soglia_minuti', '30'),             -- X: minuti di gioco dopo il tramonto oltre i quali l'ora paga le luci
  ('modifica_cutoff_minuti', '1')           -- il socio modifica/disdice fino a inizio - N minuti
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helper ruolo admin (usato da policy e funzioni)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_is_admin(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = p_user), false);
$$;

-- ---------------------------------------------------------------------------
-- Tariffe con storico: mai UPDATE, si inserisce una nuova riga
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.court_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valid_from timestamptz NOT NULL UNIQUE,
  rate_day_cents integer NOT NULL CHECK (rate_day_cents >= 0),
  rate_lights_cents integer NOT NULL CHECK (rate_lights_cents >= 0),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.court_rates (valid_from, rate_day_cents, rate_lights_cents, note)
SELECT '2026-01-01 00:00:00+01', 300, 500, 'Tariffa iniziale: €3 senza luci, €5 con luci (per persona/ora)'
WHERE NOT EXISTS (SELECT 1 FROM public.court_rates);

-- ---------------------------------------------------------------------------
-- Correzione manuale luci per un giorno (es. giornata molto nuvolosa)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lights_overrides (
  day date PRIMARY KEY,
  force_lights boolean NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Prenotazione come entità: raggruppa le righe orarie di reservations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  court_id integer NOT NULL,
  booking_type text NOT NULL CHECK (booking_type IN ('singolare', 'doppio', 'lezione')),
  coach_name text,
  coach_fee_cents integer CHECK (coach_fee_cents IS NULL OR coach_fee_cents >= 0), -- predisposto, non usato (D2)
  booker_pays_all boolean NOT NULL DEFAULT false,
  -- wallet = pagata dal wallet; free = creata con pagamenti spenti; legacy/admin riservati
  payment_mode text NOT NULL CHECK (payment_mode IN ('wallet', 'free', 'legacy', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_coach_required CHECK (booking_type <> 'lezione' OR NULLIF(btrim(coach_name), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS bookings_booker_idx ON public.bookings (booker_id);

CREATE TABLE IF NOT EXISTS public.booking_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT, -- NULL = ospite non socio
  guest_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_participants_member_or_guest
    CHECK ((user_id IS NOT NULL) <> (NULLIF(btrim(guest_name), '') IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_participants_unique_member
  ON public.booking_participants (booking_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS booking_participants_user_idx ON public.booking_participants (user_id);

-- Colonne aggiunte a reservations (nessuna rimossa, vincoli esistenti intatti).
-- booking_id resta NULL per le righe create dal pannello admin e per quelle legacy.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lights boolean,
  ADD COLUMN IF NOT EXISTS unit_price_cents integer CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS rate_id uuid REFERENCES public.court_rates(id);

CREATE INDEX IF NOT EXISTS reservations_booking_idx ON public.reservations (booking_id);

-- ---------------------------------------------------------------------------
-- Wallet e ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  balance_cents integer NOT NULL DEFAULT 0 CHECK (balance_cents >= 0), -- mai sotto zero (D14)
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  provider text NOT NULL,
  provider_ref text UNIQUE,
  checkout_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded', 'chargeback')),
  unrecovered_cents integer NOT NULL DEFAULT 0 CHECK (unrecovered_cents >= 0), -- storno non recuperabile dal saldo (D14)
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_topups_user_idx ON public.wallet_topups (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_topups_pending_idx ON public.wallet_topups (created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents <> 0), -- + accredito, - addebito
  balance_after_cents integer NOT NULL CHECK (balance_after_cents >= 0),
  kind text NOT NULL CHECK (kind IN (
    'topup_card', 'topup_cash', 'booking_charge', 'booking_cover',
    'booking_refund', 'admin_correction', 'chargeback'
  )),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  topup_id uuid REFERENCES public.wallet_topups(id) ON DELETE RESTRICT,
  covers_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT, -- quota di chi sta coprendo il prenotante
  created_by uuid, -- NULL = sistema (webhook, cron)
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ledger_note_required
    CHECK (kind NOT IN ('admin_correction', 'topup_cash') OR NULLIF(btrim(note), '') IS NOT NULL),
  CONSTRAINT wallet_ledger_booking_required
    CHECK (kind NOT IN ('booking_charge', 'booking_cover', 'booking_refund') OR booking_id IS NOT NULL),
  CONSTRAINT wallet_ledger_topup_required
    CHECK (kind NOT IN ('topup_card', 'chargeback') OR topup_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS wallet_ledger_user_idx ON public.wallet_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_ledger_booking_idx ON public.wallet_ledger (booking_id) WHERE booking_id IS NOT NULL;

-- Il ledger è immutabile, anche per errore dall'SQL editor
CREATE OR REPLACE FUNCTION public.wallet_ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger è immutabile: registra un movimento correttivo invece di modificare lo storico';
END;
$$;

DROP TRIGGER IF EXISTS wallet_ledger_no_update ON public.wallet_ledger;
CREATE TRIGGER wallet_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.wallet_ledger_immutable();

DROP TRIGGER IF EXISTS wallet_ledger_no_truncate ON public.wallet_ledger;
CREATE TRIGGER wallet_ledger_no_truncate
  BEFORE TRUNCATE ON public.wallet_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.wallet_ledger_immutable();

-- Audit dei webhook ricevuti (idempotenza)
CREATE TABLE IF NOT EXISTS public.payment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  topup_id uuid REFERENCES public.wallet_topups(id) ON DELETE SET NULL,
  status text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text,
  UNIQUE (provider, event_id)
);

-- Saldo vs somma dei movimenti: deve restare sempre vuota
CREATE OR REPLACE VIEW public.wallet_reconciliation AS
  SELECT w.user_id, w.balance_cents, COALESCE(l.total, 0) AS ledger_total_cents
  FROM public.wallets w
  LEFT JOIN (
    SELECT user_id, SUM(amount_cents)::integer AS total
    FROM public.wallet_ledger
    GROUP BY user_id
  ) l ON l.user_id = w.user_id
  WHERE w.balance_cents <> COALESCE(l.total, 0);

-- ---------------------------------------------------------------------------
-- Row Level Security: soci in sola lettura sui propri dati, admin su tutto.
-- Nessuna policy di scrittura: si scrive solo tramite funzioni SECURITY DEFINER.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_can_see_booking(p_booking uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.wallet_is_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = p_booking AND b.booker_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.booking_participants p WHERE p.booking_id = p_booking AND p.user_id = auth.uid());
$$;

ALTER TABLE public.court_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lights_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.court_rates, public.lights_overrides, public.bookings, public.booking_participants,
  public.wallets, public.wallet_topups, public.wallet_ledger, public.payment_events,
  public.wallet_reconciliation
  FROM anon, authenticated;

GRANT SELECT ON public.court_rates, public.lights_overrides, public.bookings, public.booking_participants,
  public.wallets, public.wallet_topups, public.wallet_ledger
  TO authenticated;
-- payment_events e wallet_reconciliation: solo service_role (Edge Function)

CREATE POLICY "Lettura tariffe" ON public.court_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura override luci" ON public.lights_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Lettura prenotazioni proprie" ON public.bookings FOR SELECT TO authenticated
  USING (public.wallet_can_see_booking(id));
CREATE POLICY "Lettura partecipanti proprie prenotazioni" ON public.booking_participants FOR SELECT TO authenticated
  USING (public.wallet_can_see_booking(booking_id));

CREATE POLICY "Lettura proprio saldo" ON public.wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.wallet_is_admin(auth.uid()));
CREATE POLICY "Lettura proprie ricariche" ON public.wallet_topups FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.wallet_is_admin(auth.uid()));
CREATE POLICY "Lettura propri movimenti" ON public.wallet_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.wallet_is_admin(auth.uid()));
