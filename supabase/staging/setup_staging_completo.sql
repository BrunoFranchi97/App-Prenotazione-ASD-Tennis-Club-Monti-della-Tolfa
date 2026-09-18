-- ============================================================================
-- SETUP COMPLETO DEL PROGETTO DI STAGING (pihibucdmdvmexxwxvws)
-- NON ESEGUIRE IN PRODUZIONE (nrnyfuqyeqcegnpoetrd).
--
-- File GENERATO unendo, in ordine: supabase/staging/00_base_schema.sql,
-- tutte le migration di supabase/migrations/, supabase/staging/01_seed_staging.sql.
-- Non modificarlo a mano: modifica i file di origine e rigeneralo.
-- Da eseguire UNA sola volta su un progetto di staging vuoto.
-- ============================================================================


-- >>>>>>>>>>>>>>>> supabase/staging/00_base_schema.sql

-- SCHEMA BASE per il progetto di STAGING (pihibucdmdvmexxwxvws). NON eseguire in produzione.
--
-- Ricostruito dalla struttura reale di produzione (inspect_schema.sql, 18/09/2026).
-- Contiene solo ciò che in produzione esiste ma NON è creato dalle migration in
-- supabase/migrations/. Ordine di esecuzione su staging:
--   1. questo file
--   2. tutte le migration in supabase/migrations/, in ordine di nome
--   3. supabase/staging/01_seed_staging.sql (i 4 campi, come in produzione)
--
-- Esclusioni volute:
--  - trigger "cancellation-notify" su reservations: in produzione chiama la Edge Function di
--    PRODUZIONE (notifiche WhatsApp reali). In staging non va collegato.
--  - funzione notify_admin_on_new_profile: in produzione non è collegata a nessun trigger.
--  - tabelle/policy create dalle migration (app_settings, tournaments, member_names, ...).
--
-- Enum e funzioni private verificati con inspect_schema_extra.sql (18/09/2026).

-- ---------------------------------------------------------------------------
-- Estensioni e tipi
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$ BEGIN
  CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.court_surface AS ENUM ('cemento', 'erba_sintetica', 'terra_sintetica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."KeepAlive" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.courts (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  surface public.court_surface NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS courts_name_uq ON public.courts USING btree (name);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  is_admin boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  skill_level text DEFAULT 'intermedio'::text,
  avatar_url text,
  membership_number text,
  updated_at timestamptz DEFAULT now(),
  terms_accepted boolean DEFAULT false,
  personal_data_accepted boolean DEFAULT false,
  health_data_accepted boolean DEFAULT false,
  consent_date timestamptz DEFAULT now(),
  status text DEFAULT 'pending'::text,
  CONSTRAINT profiles_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))
);

CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  court_id bigint NOT NULL REFERENCES public.courts(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'confirmed'::public.reservation_status,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  booked_for_first_name text,
  booked_for_last_name text,
  booking_type text DEFAULT 'singolare'::text,
  updated_at timestamptz DEFAULT now(),
  is_paid boolean DEFAULT false,
  CONSTRAINT reservations_time_check CHECK (ends_at > starts_at),
  CONSTRAINT reservations_duration_60 CHECK (ends_at = starts_at + '01:00:00'::interval),
  CONSTRAINT reservations_on_the_hour CHECK (
    date_part('minute'::text, starts_at) = (0)::double precision
    AND date_part('second'::text, starts_at) = (0)::double precision),
  CONSTRAINT reservations_opening_hours CHECK (
    ((starts_at AT TIME ZONE 'Europe/Rome'::text))::time without time zone >= '08:00:00'::time without time zone
    AND ((ends_at AT TIME ZONE 'Europe/Rome'::text))::time without time zone <= '23:00:00'::time without time zone),
  CONSTRAINT reservations_no_overlap EXCLUDE USING gist (
    court_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&)
    WHERE (status = 'confirmed'::public.reservation_status)
);
-- booked_for_user_id e block_type li aggiungono le migration
CREATE INDEX IF NOT EXISTS reservations_court_time_idx ON public.reservations USING btree (court_id, starts_at);
CREATE INDEX IF NOT EXISTS reservations_user_id_idx ON public.reservations USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS reservations_unique_active_court_slot
  ON public.reservations USING btree (court_id, starts_at) WHERE (status <> 'cancelled'::public.reservation_status);

CREATE TABLE IF NOT EXISTS public.match_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_date date NOT NULL,
  preferred_time_start time NOT NULL,
  preferred_time_end time NOT NULL,
  skill_level text NOT NULL,
  match_type text NOT NULL DEFAULT 'singolare'::text,
  notes text,
  status text NOT NULL DEFAULT 'open'::text,
  matched_with_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  matched_reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  court_id bigint REFERENCES public.courts(id)
);

CREATE TABLE IF NOT EXISTS public.medical_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issue_date date NOT NULL,
  expiry_date date NOT NULL,
  certificate_type text NOT NULL DEFAULT 'agonistico'::text,
  file_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Funzioni di supporto alle regole di accesso (schema private)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION private.is_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT p.approved FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

-- Come in produzione: nessun USAGE sullo schema private per anon/authenticated (le policy
-- risolvono le funzioni alla creazione), EXECUTE lasciato al default PUBLIC.

-- ---------------------------------------------------------------------------
-- Creazione automatica del profilo alla registrazione (versione iniziale:
-- la migration 20260626000000_add_member_type.sql la sostituisce con quella attuale)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security (identica alla produzione)
-- ---------------------------------------------------------------------------
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Courts admin manage" ON public.courts FOR ALL TO authenticated
  USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Courts readable" ON public.courts FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Profile read own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profile update own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles admin delete" ON public.profiles FOR DELETE TO authenticated USING (private.is_admin());
CREATE POLICY "Profiles admin read" ON public.profiles FOR SELECT TO authenticated USING ((SELECT private.is_admin()));
CREATE POLICY "Profiles admin update" ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY "Reservations admin manage" ON public.reservations FOR ALL TO authenticated
  USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Reservations insert own (approved)" ON public.reservations FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND (SELECT private.is_approved()));
CREATE POLICY "Reservations read own (approved)" ON public.reservations FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) AND (SELECT private.is_approved()));
CREATE POLICY "Reservations update own (approved)" ON public.reservations FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) AND (SELECT private.is_approved()))
  WITH CHECK ((auth.uid() = user_id) AND (SELECT private.is_approved()));
CREATE POLICY "Reservations visible to all authenticated users" ON public.reservations FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Users can delete their own future reservations" ON public.reservations FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) AND (starts_at > (now() + '01:00:00'::interval)));

CREATE POLICY "Users can delete their own match requests" ON public.match_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own match requests" ON public.match_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own match requests" ON public.match_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can view open match requests from others" ON public.match_requests FOR SELECT TO authenticated
  USING (status = 'open'::text);
CREATE POLICY "Users can view their own match requests" ON public.match_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own certificates" ON public.medical_certificates FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own certificates" ON public.medical_certificates FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own certificates" ON public.medical_certificates FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own certificates" ON public.medical_certificates FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: certificati medici (privato). Il bucket delle locandine lo crea la migration dei tornei.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-certificates', 'medical-certificates', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can delete their own certificates" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'medical-certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY "Users can update their own certificates" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'medical-certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY "Users can upload their own certificates" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'medical-certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY "Users can view their own certificates" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'medical-certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));



-- >>>>>>>>>>>>>>>> supabase/migrations/20260602000000_prevent_double_booking.sql

-- Previene il double booking: due prenotazioni non annullate
-- non possono occupare lo stesso campo allo stesso orario.
-- L'indice è parziale (WHERE status <> 'cancelled') per permettere
-- più prenotazioni annullate sullo stesso slot senza conflitti.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_no_double_booking
  ON public.reservations (court_id, starts_at)
  WHERE status <> 'cancelled';



-- >>>>>>>>>>>>>>>> supabase/migrations/20260602000001_add_booked_for_user_id.sql

-- Aggiunge il riferimento all'utente beneficiario nelle prenotazioni per terzi.
-- Consente di trovare le prenotazioni "ricevute" tramite ID univoco
-- invece di affidarsi solo al nome (che potrebbe matchare omonimi).
-- Il campo è nullable: NULL per prenotazioni normali o per terzi senza profilo in app.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booked_for_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;



-- >>>>>>>>>>>>>>>> supabase/migrations/20260626000000_add_member_type.sql

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



-- >>>>>>>>>>>>>>>> supabase/migrations/20260626000001_add_app_settings.sql

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



-- >>>>>>>>>>>>>>>> supabase/migrations/20260627000000_add_tournaments.sql

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



-- >>>>>>>>>>>>>>>> supabase/migrations/20260708000000_add_member_names_view.sql

-- Vista dedicata per i nomi dei soci.
--
-- Problema: la RLS su public.profiles consente a ogni socio di leggere solo la
-- propria riga. Di conseguenza, negli slot prenotati da altri soci il nome non
-- era disponibile lato client e compariva la scritta generica "Socio".
--
-- Soluzione: questa vista espone SOLO id e full_name di tutti i profili. Girando
-- con i privilegi del proprietario (comportamento di default delle view, quindi
-- "security definer"), bypassa la RLS di profiles ma limita l'accesso alle due
-- sole colonne selezionate qui sotto. Telefono, consensi GDPR e tutti gli altri
-- campi restano protetti dalla RLS su public.profiles.
--
-- Nota: l'avviso "security definer view" del security advisor di Supabase e' qui
-- atteso e intenzionale: e' proprio il comportamento che ci serve.

CREATE OR REPLACE VIEW public.member_names AS
  SELECT id, full_name
  FROM public.profiles;

-- Accesso in sola lettura ai soli utenti autenticati; gli anonimi non devono
-- poter leggere i nomi dei soci.
REVOKE ALL ON public.member_names FROM PUBLIC;
REVOKE ALL ON public.member_names FROM anon;
GRANT SELECT ON public.member_names TO authenticated;



-- >>>>>>>>>>>>>>>> supabase/migrations/20260713000000_add_block_type.sql

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



-- >>>>>>>>>>>>>>>> supabase/migrations/20260713000001_add_whatsapp_notify_setting.sql

-- Interruttore per le notifiche WhatsApp di cancellazione (cancellation-notify).
-- Disattivate di default: per riattivarle basta
-- UPDATE public.app_settings SET value = 'true' WHERE key = 'notifiche_whatsapp_disdetta_attive';
INSERT INTO public.app_settings (key, value)
VALUES ('notifiche_whatsapp_disdetta_attive', 'false')
ON CONFLICT (key) DO NOTHING;



-- >>>>>>>>>>>>>>>> supabase/migrations/20260918000000_wallet_schema.sql

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



-- >>>>>>>>>>>>>>>> supabase/migrations/20260918000001_wallet_functions.sql

-- Portafoglio (wallet) e pagamenti in-app — funzioni.
-- Piano completo: docs/piano-wallet-pagamenti.md
--
-- Tutta la logica che tocca soldi sta qui, in funzioni SECURITY DEFINER che:
--  - usano auth.uid() (mai uno user id passato dal client per identificare chi agisce);
--  - ricalcolano sempre il prezzo lato server (il client non passa mai importi di prenotazione);
--  - girano in un'unica transazione (tutto o niente).
--
-- API per l'app (ruolo authenticated):
--   quote_booking, create_booking, update_booking, cancel_booking,
--   admin_update_booking, admin_cancel_booking, admin_cancel_reservations,
--   admin_wallet_topup_cash, admin_wallet_adjust, admin_set_court_rate, admin_set_lights_override,
--   sunset_at, hour_needs_lights
-- API per le Edge Function (solo service_role):
--   wallet_credit_topup, wallet_close_topup, wallet_reverse_topup

-- ---------------------------------------------------------------------------
-- Utility
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(btrim(value), '')::integer FROM public.app_settings WHERE key = p_key), p_default);
$$;

CREATE OR REPLACE FUNCTION public.wallet_format_eur(p_cents integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '€' || replace(to_char(p_cents / 100.0, 'FM999999990.00'), '.', ',');
$$;

CREATE OR REPLACE FUNCTION public.wallet_fail(p_message text, p_code text DEFAULT 'WALLET_ERROR')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = p_message, HINT = p_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tramonto e luci
-- ---------------------------------------------------------------------------
-- Orario del tramonto (algoritmo NOAA "General Solar Position"), deterministico,
-- nessuna API esterna. Default: Loc. Canepacce, Tolfa. Precisione ~1-2 minuti.
CREATE OR REPLACE FUNCTION public.sunset_at(
  p_day date,
  p_lat double precision DEFAULT 42.15,
  p_lon double precision DEFAULT 11.93
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_days_in_year integer := make_date(extract(year FROM p_day)::integer + 1, 1, 1)
                          - make_date(extract(year FROM p_day)::integer, 1, 1);
  v_gamma double precision := 2 * pi() / v_days_in_year * (extract(doy FROM p_day) - 1);
  v_eqtime double precision;
  v_decl double precision;
  v_lat double precision := radians(p_lat);
  v_ha double precision;
  v_minutes_utc double precision;
BEGIN
  v_eqtime := 229.18 * (0.000075 + 0.001868 * cos(v_gamma) - 0.032077 * sin(v_gamma)
              - 0.014615 * cos(2 * v_gamma) - 0.040849 * sin(2 * v_gamma));
  v_decl := 0.006918 - 0.399912 * cos(v_gamma) + 0.070257 * sin(v_gamma)
            - 0.006758 * cos(2 * v_gamma) + 0.000907 * sin(2 * v_gamma)
            - 0.002697 * cos(3 * v_gamma) + 0.00148 * sin(3 * v_gamma);
  v_ha := degrees(acos(cos(radians(90.833)) / (cos(v_lat) * cos(v_decl)) - tan(v_lat) * tan(v_decl)));
  v_minutes_utc := 720 - 4 * (p_lon - v_ha) - v_eqtime;
  RETURN (p_day::timestamp + v_minutes_utc * interval '1 minute') AT TIME ZONE 'UTC';
END;
$$;

-- Un'ora che inizia a p_start paga le luci se dopo il tramonto restano più di X minuti
-- di gioco (X = app_settings.luci_soglia_minuti), salvo override admin per quel giorno.
CREATE OR REPLACE FUNCTION public.hour_needs_lights(p_start timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := (p_start AT TIME ZONE 'Europe/Rome')::date;
  v_force boolean;
BEGIN
  SELECT force_lights INTO v_force FROM public.lights_overrides WHERE day = v_day;
  IF FOUND THEN
    RETURN v_force;
  END IF;
  RETURN public.sunset_at(v_day)
       < p_start + interval '1 hour' - make_interval(mins => public.wallet_setting_int('luci_soglia_minuti', 30));
END;
$$;

-- ---------------------------------------------------------------------------
-- Unica porta di scrittura sul saldo: movimento nel ledger + aggiornamento saldo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_post(
  p_user uuid,
  p_amount integer,
  p_kind text,
  p_booking uuid,
  p_topup uuid,
  p_covers uuid,
  p_note text,
  p_actor uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_id bigint;
BEGIN
  IF p_amount = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_cents INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;

  IF v_balance + p_amount < 0 THEN
    PERFORM public.wallet_fail(format('Saldo insufficiente per %s: servono %s, disponibili %s.',
      COALESCE((SELECT full_name FROM public.profiles WHERE id = p_user), 'il socio'),
      public.wallet_format_eur(-p_amount), public.wallet_format_eur(v_balance)), 'SALDO_INSUFFICIENTE');
  END IF;

  UPDATE public.wallets SET balance_cents = v_balance + p_amount, updated_at = now() WHERE user_id = p_user;

  INSERT INTO public.wallet_ledger (user_id, amount_cents, balance_after_cents, kind, booking_id, topup_id,
                                    covers_user_id, created_by, note)
  VALUES (p_user, p_amount, v_balance + p_amount, p_kind, p_booking, p_topup, p_covers, p_actor, NULLIF(btrim(p_note), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Allinea gli addebiti di una prenotazione alla sua configurazione attuale.
-- Calcola quanto "deve" ciascuno, lo confronta con quanto già pagato (dal ledger)
-- e registra solo le differenze: prima i rimborsi, poi gli addebiti.
-- Disdetta = "dovuto zero". Una futura penalità sarà "dovuto = X%".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_settle_booking(p_booking uuid, p_actor uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_quota integer := 0;
  v_targets jsonb := '{}'::jsonb;
  v_users uuid[];
  v_participant record;
  v_self_paid integer;
  v_cover_paid integer;
  v_balance integer;
  v_key text;
  v_delta record;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_booking.payment_mode <> 'wallet' THEN
    RETURN;
  END IF;

  -- Blocca in ordine fisso tutti i wallet coinvolti (evita deadlock tra operazioni concorrenti)
  SELECT array_agg(DISTINCT u) INTO v_users FROM (
    SELECT v_booking.booker_id AS u
    UNION SELECT user_id FROM public.booking_participants WHERE booking_id = p_booking AND user_id IS NOT NULL
    UNION SELECT user_id FROM public.wallet_ledger WHERE booking_id = p_booking
  ) s WHERE u IS NOT NULL;

  INSERT INTO public.wallets (user_id) SELECT unnest(v_users) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.wallets WHERE user_id = ANY (v_users) ORDER BY user_id FOR UPDATE;

  IF v_booking.status = 'active' THEN
    SELECT COALESCE(SUM(unit_price_cents), 0)::integer INTO v_quota
    FROM public.reservations
    WHERE booking_id = p_booking AND status <> 'cancelled';

    FOR v_participant IN
      SELECT user_id FROM public.booking_participants WHERE booking_id = p_booking ORDER BY user_id NULLS LAST
    LOOP
      IF v_participant.user_id IS NULL OR v_participant.user_id = v_booking.booker_id THEN
        -- ospite (D9) o prenotante stesso: paga il prenotante
        v_key := v_booking.booker_id::text || '|';
      ELSIF v_booking.booker_pays_all THEN
        v_key := v_booking.booker_id::text || '|' || v_participant.user_id::text;
      ELSE
        SELECT COALESCE(-SUM(amount_cents), 0)::integer INTO v_self_paid FROM public.wallet_ledger
          WHERE booking_id = p_booking AND user_id = v_participant.user_id AND covers_user_id IS NULL;
        SELECT COALESCE(-SUM(amount_cents), 0)::integer INTO v_cover_paid FROM public.wallet_ledger
          WHERE booking_id = p_booking AND user_id = v_booking.booker_id AND covers_user_id = v_participant.user_id;
        SELECT balance_cents INTO v_balance FROM public.wallets WHERE user_id = v_participant.user_id;

        IF v_cover_paid > 0 AND v_self_paid = 0 THEN
          -- già coperto dal prenotante: resta così (nessun rimbalzo tra modifiche)
          v_key := v_booking.booker_id::text || '|' || v_participant.user_id::text;
        ELSIF v_balance + v_self_paid >= v_quota THEN
          -- D7: il partecipante paga la sua quota intera
          v_key := v_participant.user_id::text || '|';
        ELSE
          -- D7: non basta, l'intera quota passa al prenotante; il partecipante non viene toccato
          v_key := v_booking.booker_id::text || '|' || v_participant.user_id::text;
        END IF;
      END IF;

      v_targets := jsonb_set(v_targets, ARRAY[v_key], to_jsonb(COALESCE((v_targets ->> v_key)::integer, 0) + v_quota));
    END LOOP;
  END IF;

  FOR v_delta IN
    WITH existing AS (
      SELECT user_id::text || '|' || COALESCE(covers_user_id::text, '') AS k,
             -SUM(amount_cents)::integer AS paid
      FROM public.wallet_ledger
      WHERE booking_id = p_booking
      GROUP BY 1
    ),
    target AS (
      SELECT key AS k, value::integer AS due FROM jsonb_each_text(v_targets)
    )
    SELECT split_part(COALESCE(e.k, t.k), '|', 1)::uuid AS user_id,
           NULLIF(split_part(COALESCE(e.k, t.k), '|', 2), '')::uuid AS covers,
           COALESCE(e.paid, 0) - COALESCE(t.due, 0) AS amount
    FROM existing e
    FULL JOIN target t ON t.k = e.k
    WHERE COALESCE(e.paid, 0) <> COALESCE(t.due, 0)
    ORDER BY 3 DESC, 1, 2 -- rimborsi (positivi) prima degli addebiti
  LOOP
    PERFORM public.wallet_post(
      v_delta.user_id,
      v_delta.amount,
      CASE WHEN v_delta.amount > 0 THEN 'booking_refund'
           WHEN v_delta.covers IS NULL THEN 'booking_charge'
           ELSE 'booking_cover' END,
      p_booking, NULL, v_delta.covers, p_note, p_actor);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Creazione / modifica di una prenotazione (percorso socio e admin_update)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_save_booking(
  p_booking_id uuid,              -- NULL = nuova prenotazione
  p_is_admin_path boolean,        -- true = correzione admin: nessun cutoff, anche a posteriori
  p_expected_version integer,
  p_court_id integer,
  p_starts timestamptz[],
  p_booking_type text,
  p_participants jsonb,           -- [{"user_id": "..."} | {"guest_name": "..."}]
  p_coach_name text,
  p_booker_pays_all boolean,
  p_notes text,
  p_booked_for_first_name text,
  p_booked_for_last_name text,
  p_booked_for_user_id uuid,
  p_ledger_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_admin boolean;
  v_booking public.bookings;
  v_court integer;
  v_mode text;
  v_rate public.court_rates;
  v_starts timestamptz[];
  v_local timestamp;
  v_first_day date;
  v_count integer;
  v_cutoff integer := public.wallet_setting_int('modifica_cutoff_minuti', 1);
  v_first_start timestamptz;
  v_p jsonb;
  v_member_ids uuid[] := '{}';
  v_guests integer := 0;
  v_n integer;
  v_approved_count integer;
  v_s timestamptz;
  v_lights boolean;
BEGIN
  IF v_actor IS NULL THEN
    PERFORM public.wallet_fail('Devi effettuare l''accesso per prenotare.', 'NON_AUTENTICATO');
  END IF;
  v_actor_admin := public.wallet_is_admin(v_actor);

  IF p_is_admin_path AND NOT v_actor_admin THEN
    PERFORM public.wallet_fail('Operazione riservata agli amministratori.', 'NON_AUTORIZZATO');
  END IF;

  -- Prenotazione esistente o nuova
  IF p_booking_id IS NOT NULL THEN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM public.wallet_fail('Prenotazione non trovata.', 'NON_TROVATA');
    END IF;
    IF NOT p_is_admin_path AND v_booking.booker_id <> v_actor THEN
      PERFORM public.wallet_fail('Puoi modificare solo le prenotazioni che hai effettuato tu.', 'NON_AUTORIZZATO');
    END IF;
    IF v_booking.status <> 'active' THEN
      PERFORM public.wallet_fail('La prenotazione è già stata annullata.', 'ANNULLATA');
    END IF;
    IF p_expected_version IS NOT NULL AND p_expected_version <> v_booking.version THEN
      PERFORM public.wallet_fail('La prenotazione è stata modificata nel frattempo. Ricarica la pagina e riprova.', 'VERSIONE');
    END IF;
    IF NOT p_is_admin_path THEN
      SELECT MIN(starts_at) INTO v_first_start FROM public.reservations
        WHERE booking_id = p_booking_id AND status <> 'cancelled';
      IF v_first_start IS NOT NULL AND now() > v_first_start - make_interval(mins => v_cutoff) THEN
        PERFORM public.wallet_fail(format('Le modifiche sono consentite fino a %s %s prima dell''inizio.', v_cutoff, CASE WHEN v_cutoff = 1 THEN 'minuto' ELSE 'minuti' END), 'CUTOFF');
      END IF;
    END IF;
    v_court := v_booking.court_id;
    v_mode := v_booking.payment_mode;
  ELSE
    IF NOT v_actor_admin AND NOT COALESCE((SELECT approved FROM public.profiles WHERE id = v_actor), false) THEN
      PERFORM public.wallet_fail('Il tuo profilo non è ancora stato approvato.', 'NON_APPROVATO');
    END IF;
    v_court := p_court_id;
    v_mode := CASE WHEN (SELECT value FROM public.app_settings WHERE key = 'pagamenti_attivi') = 'true'
                   THEN 'wallet' ELSE 'free' END;
  END IF;

  -- Campo
  IF NOT COALESCE((SELECT is_active FROM public.courts WHERE id = v_court), false) THEN
    PERFORM public.wallet_fail('Il campo selezionato non è disponibile.', 'CAMPO');
  END IF;

  -- Slot: ore intere 08-23 (Europe/Rome), stesso giorno, consecutive, non scadute
  SELECT array_agg(DISTINCT s ORDER BY s) INTO v_starts FROM unnest(p_starts) s;
  v_count := COALESCE(array_length(v_starts, 1), 0);
  IF v_count = 0 THEN
    PERFORM public.wallet_fail('Seleziona almeno un orario.', 'SLOT');
  END IF;
  IF v_count > 2 AND NOT v_actor_admin THEN
    PERFORM public.wallet_fail('Non puoi superare le 2 ore consecutive.', 'SLOT');
  END IF;
  v_first_day := (v_starts[1] AT TIME ZONE 'Europe/Rome')::date;
  FOR i IN 1 .. v_count LOOP
    v_local := v_starts[i] AT TIME ZONE 'Europe/Rome';
    IF date_trunc('hour', v_local) <> v_local
       OR extract(hour FROM v_local) < 8 OR extract(hour FROM v_local) > 22
       OR v_local::date <> v_first_day THEN
      PERFORM public.wallet_fail('Orario non valido: sono prenotabili solo ore intere tra le 08:00 e le 23:00.', 'SLOT');
    END IF;
    IF i > 1 AND v_starts[i] <> v_starts[i - 1] + interval '1 hour' THEN
      PERFORM public.wallet_fail('Le ore selezionate devono essere consecutive.', 'SLOT');
    END IF;
    IF NOT p_is_admin_path AND v_starts[i] + interval '1 hour' <= now() THEN
      PERFORM public.wallet_fail('Non puoi prenotare un orario già passato.', 'SLOT');
    END IF;
  END LOOP;

  -- Partecipanti
  IF p_participants IS NULL OR jsonb_typeof(p_participants) <> 'array' THEN
    PERFORM public.wallet_fail('Seleziona i partecipanti.', 'PARTECIPANTI');
  END IF;
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
    IF NULLIF(v_p ->> 'user_id', '') IS NOT NULL THEN
      IF (v_p ->> 'user_id')::uuid = ANY (v_member_ids) THEN
        PERFORM public.wallet_fail('Lo stesso socio è stato selezionato più volte.', 'PARTECIPANTI');
      END IF;
      v_member_ids := v_member_ids || (v_p ->> 'user_id')::uuid;
    ELSIF NULLIF(btrim(v_p ->> 'guest_name'), '') IS NOT NULL THEN
      v_guests := v_guests + 1;
    ELSE
      PERFORM public.wallet_fail('Partecipante non valido.', 'PARTECIPANTI');
    END IF;
  END LOOP;
  v_n := COALESCE(array_length(v_member_ids, 1), 0) + v_guests;

  IF p_booking_type = 'singolare' AND v_n <> 2 THEN
    PERFORM public.wallet_fail('Per un singolare servono 2 giocatori.', 'PARTECIPANTI');
  ELSIF p_booking_type = 'doppio' AND v_n <> 4 THEN
    PERFORM public.wallet_fail('Per un doppio servono 4 giocatori.', 'PARTECIPANTI');
  ELSIF p_booking_type = 'lezione' AND (v_n < 1 OR v_n > 4) THEN
    PERFORM public.wallet_fail('Una lezione prevede da 1 a 4 allievi.', 'PARTECIPANTI');
  ELSIF p_booking_type NOT IN ('singolare', 'doppio', 'lezione') OR p_booking_type IS NULL THEN
    PERFORM public.wallet_fail('Tipo di prenotazione non valido.', 'TIPO');
  END IF;
  IF p_booking_type = 'lezione' AND NULLIF(btrim(p_coach_name), '') IS NULL THEN
    PERFORM public.wallet_fail('Indica il nome del maestro.', 'MAESTRO');
  END IF;

  SELECT count(*) INTO v_approved_count FROM public.profiles
    WHERE id = ANY (v_member_ids) AND approved = true;
  IF v_approved_count <> COALESCE(array_length(v_member_ids, 1), 0) THEN
    PERFORM public.wallet_fail('Uno o più partecipanti non sono soci approvati.', 'PARTECIPANTI');
  END IF;

  -- Tariffa in vigore adesso (prepagato): viene congelata sulle righe nuove
  IF v_mode = 'wallet' THEN
    SELECT * INTO v_rate FROM public.court_rates WHERE valid_from <= now() ORDER BY valid_from DESC LIMIT 1;
    IF NOT FOUND THEN
      PERFORM public.wallet_fail('Tariffe non configurate: contatta un amministratore.', 'TARIFFE');
    END IF;
  END IF;

  -- Testata
  IF p_booking_id IS NULL THEN
    INSERT INTO public.bookings (booker_id, court_id, booking_type, coach_name, booker_pays_all, payment_mode)
    VALUES (v_actor, v_court, p_booking_type, NULLIF(btrim(p_coach_name), ''), COALESCE(p_booker_pays_all, false), v_mode)
    RETURNING * INTO v_booking;
  ELSE
    UPDATE public.bookings
       SET booking_type = p_booking_type,
           coach_name = NULLIF(btrim(p_coach_name), ''),
           booker_pays_all = COALESCE(p_booker_pays_all, false),
           version = version + 1,
           updated_at = now()
     WHERE id = p_booking_id
    RETURNING * INTO v_booking;
  END IF;

  -- Righe orarie: annulla quelle tolte, aggiorna quelle mantenute, inserisce le nuove
  UPDATE public.reservations
     SET status = 'cancelled', updated_at = now()
   WHERE booking_id = v_booking.id AND status <> 'cancelled' AND NOT (starts_at = ANY (v_starts));

  UPDATE public.reservations
     SET booking_type = p_booking_type,
         notes = NULLIF(btrim(p_notes), ''),
         booked_for_first_name = NULLIF(btrim(p_booked_for_first_name), ''),
         booked_for_last_name = NULLIF(btrim(p_booked_for_last_name), ''),
         booked_for_user_id = p_booked_for_user_id,
         updated_at = now()
   WHERE booking_id = v_booking.id AND status <> 'cancelled';

  FOREACH v_s IN ARRAY v_starts LOOP
    IF NOT EXISTS (SELECT 1 FROM public.reservations
                   WHERE booking_id = v_booking.id AND status <> 'cancelled' AND starts_at = v_s) THEN
      v_lights := public.hour_needs_lights(v_s);
      INSERT INTO public.reservations (court_id, user_id, starts_at, ends_at, status, booking_type, notes,
                                       booked_for_first_name, booked_for_last_name, booked_for_user_id,
                                       booking_id, lights, unit_price_cents, rate_id, is_paid)
      VALUES (v_court, v_booking.booker_id, v_s, v_s + interval '1 hour', 'confirmed', p_booking_type,
              NULLIF(btrim(p_notes), ''),
              NULLIF(btrim(p_booked_for_first_name), ''), NULLIF(btrim(p_booked_for_last_name), ''),
              p_booked_for_user_id,
              v_booking.id, v_lights,
              CASE WHEN v_mode = 'wallet' THEN
                CASE WHEN v_lights THEN v_rate.rate_lights_cents ELSE v_rate.rate_day_cents END END,
              CASE WHEN v_mode = 'wallet' THEN v_rate.id END,
              v_mode = 'wallet');
    END IF;
  END LOOP;

  -- Partecipanti: la configurazione attuale; lo storico dei soldi resta nel ledger
  DELETE FROM public.booking_participants WHERE booking_id = v_booking.id;
  INSERT INTO public.booking_participants (booking_id, user_id, guest_name)
  SELECT v_booking.id,
         NULLIF(e ->> 'user_id', '')::uuid,
         CASE WHEN NULLIF(e ->> 'user_id', '') IS NULL THEN btrim(e ->> 'guest_name') END
  FROM jsonb_array_elements(p_participants) e;

  PERFORM public.wallet_settle_booking(v_booking.id, v_actor, p_ledger_note);
  RETURN v_booking.id;
END;
$$;

-- Riepilogo di una prenotazione e dei movimenti registrati dopo p_ledger_mark
CREATE OR REPLACE FUNCTION public.wallet_booking_summary(p_booking uuid, p_ledger_mark bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'booking_id', b.id,
    'version', b.version,
    'status', b.status,
    'payment_mode', b.payment_mode,
    'quota_cents', (SELECT COALESCE(SUM(unit_price_cents), 0) FROM public.reservations r
                    WHERE r.booking_id = b.id AND r.status <> 'cancelled'),
    'hours', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'reservation_id', r.id, 'starts_at', r.starts_at, 'ends_at', r.ends_at,
                'lights', r.lights, 'unit_price_cents', r.unit_price_cents) ORDER BY r.starts_at)
              FROM public.reservations r WHERE r.booking_id = b.id AND r.status <> 'cancelled'), '[]'::jsonb),
    'movements', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'user_id', l.user_id, 'full_name', pu.full_name,
                'amount_cents', l.amount_cents, 'kind', l.kind,
                'covers_user_id', l.covers_user_id, 'covers_full_name', pc.full_name) ORDER BY l.id)
              FROM public.wallet_ledger l
              LEFT JOIN public.profiles pu ON pu.id = l.user_id
              LEFT JOIN public.profiles pc ON pc.id = l.covers_user_id
              WHERE l.booking_id = b.id AND l.id > p_ledger_mark), '[]'::jsonb),
    'booker_balance_cents', (SELECT balance_cents FROM public.wallets w WHERE w.user_id = b.booker_id)
  )
  FROM public.bookings b
  WHERE b.id = p_booking;
$$;

CREATE OR REPLACE FUNCTION public.wallet_ledger_mark()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(id), 0) FROM public.wallet_ledger;
$$;

-- ---------------------------------------------------------------------------
-- API socio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking(
  p_court_id integer,
  p_starts timestamptz[],
  p_booking_type text,
  p_participants jsonb,
  p_coach_name text DEFAULT NULL,
  p_booker_pays_all boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_booked_for_first_name text DEFAULT NULL,
  p_booked_for_last_name text DEFAULT NULL,
  p_booked_for_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mark bigint := public.wallet_ledger_mark();
  v_id uuid;
BEGIN
  v_id := public.wallet_save_booking(NULL, false, NULL, p_court_id, p_starts, p_booking_type, p_participants,
    p_coach_name, p_booker_pays_all, p_notes, p_booked_for_first_name, p_booked_for_last_name,
    p_booked_for_user_id, NULL);
  RETURN public.wallet_booking_summary(v_id, v_mark);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_booking(
  p_booking_id uuid,
  p_expected_version integer,
  p_starts timestamptz[],
  p_booking_type text,
  p_participants jsonb,
  p_coach_name text DEFAULT NULL,
  p_booker_pays_all boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_booked_for_first_name text DEFAULT NULL,
  p_booked_for_last_name text DEFAULT NULL,
  p_booked_for_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mark bigint := public.wallet_ledger_mark();
BEGIN
  PERFORM public.wallet_save_booking(p_booking_id, false, p_expected_version, NULL, p_starts, p_booking_type,
    p_participants, p_coach_name, p_booker_pays_all, p_notes, p_booked_for_first_name, p_booked_for_last_name,
    p_booked_for_user_id, NULL);
  RETURN public.wallet_booking_summary(p_booking_id, v_mark);
END;
$$;

-- Anteprima: esegue davvero l'operazione e poi la annulla (rollback della sottotransazione).
-- Così il preventivo è calcolato dallo stesso identico codice che addebita.
-- Non viene MAI usato per addebitare: la conferma richiama create_booking/update_booking.
CREATE OR REPLACE FUNCTION public.quote_booking(
  p_court_id integer,
  p_starts timestamptz[],
  p_booking_type text,
  p_participants jsonb,
  p_coach_name text DEFAULT NULL,
  p_booker_pays_all boolean DEFAULT false,
  p_booking_id uuid DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mark bigint := public.wallet_ledger_mark();
  v_id uuid;
  v_result jsonb;
  v_hint text;
BEGIN
  BEGIN
    v_id := public.wallet_save_booking(p_booking_id, false, p_expected_version, p_court_id, p_starts,
      p_booking_type, p_participants, p_coach_name, p_booker_pays_all, NULL, NULL, NULL, NULL, NULL);
    v_result := public.wallet_booking_summary(v_id, v_mark) || jsonb_build_object('ok', true);
    RAISE EXCEPTION USING ERRCODE = 'WQ001', MESSAGE = 'rollback anteprima';
  EXCEPTION
    WHEN SQLSTATE 'WQ001' THEN
      NULL;
    WHEN unique_violation OR exclusion_violation THEN
      v_result := jsonb_build_object('ok', false, 'code', 'SLOT_OCCUPATO',
        'error', 'Uno o più slot sono stati appena prenotati da qualcun altro. Ricarica la pagina e riprova.');
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
      v_result := jsonb_build_object('ok', false, 'code', COALESCE(NULLIF(v_hint, ''), SQLSTATE), 'error', SQLERRM);
  END;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_cancel_booking(p_booking_id uuid, p_is_admin_path boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mark bigint := public.wallet_ledger_mark();
  v_booking public.bookings;
  v_first_start timestamptz;
  v_cutoff integer := public.wallet_setting_int('modifica_cutoff_minuti', 1);
BEGIN
  IF v_actor IS NULL THEN
    PERFORM public.wallet_fail('Devi effettuare l''accesso.', 'NON_AUTENTICATO');
  END IF;
  IF p_is_admin_path AND NOT public.wallet_is_admin(v_actor) THEN
    PERFORM public.wallet_fail('Operazione riservata agli amministratori.', 'NON_AUTORIZZATO');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.wallet_fail('Prenotazione non trovata.', 'NON_TROVATA');
  END IF;
  IF NOT p_is_admin_path AND v_booking.booker_id <> v_actor THEN
    PERFORM public.wallet_fail('Puoi annullare solo le prenotazioni che hai effettuato tu.', 'NON_AUTORIZZATO');
  END IF;
  IF v_booking.status = 'cancelled' THEN
    RETURN public.wallet_booking_summary(p_booking_id, v_mark);
  END IF;
  IF NOT p_is_admin_path THEN
    SELECT MIN(starts_at) INTO v_first_start FROM public.reservations
      WHERE booking_id = p_booking_id AND status <> 'cancelled';
    IF v_first_start IS NOT NULL AND now() > v_first_start - make_interval(mins => v_cutoff) THEN
      PERFORM public.wallet_fail(format('La disdetta è consentita fino a %s %s prima dell''inizio.', v_cutoff, CASE WHEN v_cutoff = 1 THEN 'minuto' ELSE 'minuti' END), 'CUTOFF');
    END IF;
  END IF;

  UPDATE public.reservations SET status = 'cancelled', updated_at = now()
   WHERE booking_id = p_booking_id AND status <> 'cancelled';
  UPDATE public.bookings SET status = 'cancelled', version = version + 1, updated_at = now()
   WHERE id = p_booking_id;

  -- D10: per ora rimborso integrale (dovuto = 0)
  PERFORM public.wallet_settle_booking(p_booking_id, v_actor, p_note);
  RETURN public.wallet_booking_summary(p_booking_id, v_mark);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.wallet_cancel_booking(p_booking_id, false, 'Disdetta');
$$;

-- ---------------------------------------------------------------------------
-- API admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_require_admin()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.wallet_is_admin(auth.uid()) THEN
    PERFORM public.wallet_fail('Operazione riservata agli amministratori.', 'NON_AUTORIZZATO');
  END IF;
  RETURN auth.uid();
END;
$$;

-- Correzione admin di una prenotazione wallet, anche a posteriori (D3)
CREATE OR REPLACE FUNCTION public.admin_update_booking(
  p_booking_id uuid,
  p_note text,
  p_starts timestamptz[],
  p_booking_type text,
  p_participants jsonb,
  p_coach_name text DEFAULT NULL,
  p_booker_pays_all boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_booked_for_first_name text DEFAULT NULL,
  p_booked_for_last_name text DEFAULT NULL,
  p_booked_for_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mark bigint := public.wallet_ledger_mark();
BEGIN
  PERFORM public.wallet_require_admin();
  IF NULLIF(btrim(p_note), '') IS NULL THEN
    PERFORM public.wallet_fail('Indica il motivo della correzione.', 'NOTA');
  END IF;
  PERFORM public.wallet_save_booking(p_booking_id, true, NULL, NULL, p_starts, p_booking_type, p_participants,
    p_coach_name, p_booker_pays_all, p_notes, p_booked_for_first_name, p_booked_for_last_name,
    p_booked_for_user_id, p_note);
  RETURN public.wallet_booking_summary(p_booking_id, v_mark);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_booking(p_booking_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.wallet_require_admin();
  RETURN public.wallet_cancel_booking(p_booking_id, true, COALESCE(NULLIF(btrim(p_note), ''), 'Annullata da amministratore'));
END;
$$;

-- Annullamento dal pannello admin di singole righe orarie (AdminReservations).
-- Righe senza booking_id (pannello/legacy): come oggi, nessun movimento.
-- Righe di una prenotazione wallet: rimborso della parte annullata (D11).
CREATE OR REPLACE FUNCTION public.admin_cancel_reservations(p_reservation_ids uuid[], p_note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.wallet_require_admin();
  v_booking_ids uuid[];
  v_booking uuid;
  v_count integer;
BEGIN
  SELECT array_agg(DISTINCT booking_id) FILTER (WHERE booking_id IS NOT NULL) INTO v_booking_ids
    FROM public.reservations WHERE id = ANY (p_reservation_ids);

  -- blocca le testate in ordine fisso prima di toccare le righe
  PERFORM 1 FROM public.bookings WHERE id = ANY (COALESCE(v_booking_ids, '{}')) ORDER BY id FOR UPDATE;

  UPDATE public.reservations SET status = 'cancelled', updated_at = now()
   WHERE id = ANY (p_reservation_ids) AND status <> 'cancelled';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  FOREACH v_booking IN ARRAY COALESCE(v_booking_ids, '{}') LOOP
    UPDATE public.bookings
       SET status = CASE WHEN EXISTS (SELECT 1 FROM public.reservations
                                      WHERE booking_id = v_booking AND status <> 'cancelled')
                         THEN status ELSE 'cancelled' END,
           version = version + 1,
           updated_at = now()
     WHERE id = v_booking;
    PERFORM public.wallet_settle_booking(v_booking, v_actor,
      COALESCE(NULLIF(btrim(p_note), ''), 'Annullata da amministratore'));
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_wallet_topup_cash(p_user_id uuid, p_amount_cents integer, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.wallet_require_admin();
  v_id bigint;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    PERFORM public.wallet_fail('L''importo deve essere maggiore di zero.', 'IMPORTO');
  END IF;
  IF NULLIF(btrim(p_note), '') IS NULL THEN
    PERFORM public.wallet_fail('Aggiungi una nota (es. "Contanti consegnati al circolo").', 'NOTA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    PERFORM public.wallet_fail('Socio non trovato.', 'NON_TROVATO');
  END IF;
  v_id := public.wallet_post(p_user_id, p_amount_cents, 'topup_cash', NULL, NULL, NULL, p_note, v_actor);
  RETURN jsonb_build_object('ledger_id', v_id,
    'balance_cents', (SELECT balance_cents FROM public.wallets WHERE user_id = p_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_wallet_adjust(p_user_id uuid, p_amount_cents integer, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.wallet_require_admin();
  v_id bigint;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents = 0 THEN
    PERFORM public.wallet_fail('L''importo della correzione non può essere zero.', 'IMPORTO');
  END IF;
  IF NULLIF(btrim(p_note), '') IS NULL THEN
    PERFORM public.wallet_fail('Indica il motivo della correzione.', 'NOTA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    PERFORM public.wallet_fail('Socio non trovato.', 'NON_TROVATO');
  END IF;
  v_id := public.wallet_post(p_user_id, p_amount_cents, 'admin_correction', NULL, NULL, NULL, p_note, v_actor);
  RETURN jsonb_build_object('ledger_id', v_id,
    'balance_cents', (SELECT balance_cents FROM public.wallets WHERE user_id = p_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_court_rate(
  p_valid_from timestamptz,
  p_rate_day_cents integer,
  p_rate_lights_cents integer,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.wallet_require_admin();
  v_id uuid;
BEGIN
  IF p_valid_from IS NULL OR p_valid_from < now() - interval '5 minutes' THEN
    PERFORM public.wallet_fail('La nuova tariffa deve decorrere da adesso o da una data futura.', 'TARIFFE');
  END IF;
  IF p_rate_day_cents IS NULL OR p_rate_day_cents < 0 OR p_rate_lights_cents IS NULL OR p_rate_lights_cents < 0 THEN
    PERFORM public.wallet_fail('Le tariffe devono essere importi validi.', 'TARIFFE');
  END IF;
  INSERT INTO public.court_rates (valid_from, rate_day_cents, rate_lights_cents, note, created_by)
  VALUES (p_valid_from, p_rate_day_cents, p_rate_lights_cents, NULLIF(btrim(p_note), ''), v_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- p_force_lights NULL = rimuove l'override e torna al calcolo automatico
CREATE OR REPLACE FUNCTION public.admin_set_lights_override(p_day date, p_force_lights boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.wallet_require_admin();
BEGIN
  IF p_force_lights IS NULL THEN
    DELETE FROM public.lights_overrides WHERE day = p_day;
  ELSE
    INSERT INTO public.lights_overrides (day, force_lights, reason, created_by)
    VALUES (p_day, p_force_lights, NULLIF(btrim(p_reason), ''), v_actor)
    ON CONFLICT (day) DO UPDATE
      SET force_lights = EXCLUDED.force_lights, reason = EXCLUDED.reason,
          created_by = EXCLUDED.created_by, created_at = now();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ricariche con carta (solo Edge Function, service_role)
-- ---------------------------------------------------------------------------
-- Accredito dopo conferma verificata del provider. Idempotente.
CREATE OR REPLACE FUNCTION public.wallet_credit_topup(p_topup_id uuid, p_amount_cents integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topup public.wallet_topups;
BEGIN
  SELECT * INTO v_topup FROM public.wallet_topups WHERE id = p_topup_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.wallet_fail('Ricarica non trovata.', 'NON_TROVATA');
  END IF;
  IF v_topup.status IN ('paid', 'refunded', 'chargeback') THEN
    RETURN 'gia_elaborata';
  END IF;
  IF p_amount_cents IS DISTINCT FROM v_topup.amount_cents THEN
    PERFORM public.wallet_fail(format('Importo pagato (%s) diverso da quello richiesto (%s).',
      p_amount_cents, v_topup.amount_cents), 'IMPORTO');
  END IF;
  -- anche da 'expired'/'failed': se il provider conferma il pagamento, i soldi sono arrivati
  UPDATE public.wallet_topups SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = p_topup_id;
  PERFORM public.wallet_post(v_topup.user_id, v_topup.amount_cents, 'topup_card', NULL, p_topup_id, NULL,
    'Ricarica con carta', NULL);
  RETURN 'accreditata';
END;
$$;

-- Chiusura di una ricarica mai pagata
CREATE OR REPLACE FUNCTION public.wallet_close_topup(p_topup_id uuid, p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('failed', 'expired') THEN
    PERFORM public.wallet_fail('Stato non valido.', 'STATO');
  END IF;
  UPDATE public.wallet_topups SET status = p_status, updated_at = now()
   WHERE id = p_topup_id AND status = 'pending';
  RETURN CASE WHEN FOUND THEN 'chiusa' ELSE 'invariata' END;
END;
$$;

-- Rimborso o storno (chargeback) di una ricarica già accreditata.
-- D14: il saldo non va mai sotto zero. Si scala al massimo il saldo disponibile;
-- la parte non recuperata resta in unrecovered_cents e va gestita dall'admin.
CREATE OR REPLACE FUNCTION public.wallet_reverse_topup(p_topup_id uuid, p_status text, p_amount_cents integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topup public.wallet_topups;
  v_balance integer;
  v_amount integer;
  v_taken integer;
BEGIN
  IF p_status NOT IN ('refunded', 'chargeback') THEN
    PERFORM public.wallet_fail('Stato non valido.', 'STATO');
  END IF;
  SELECT * INTO v_topup FROM public.wallet_topups WHERE id = p_topup_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.wallet_fail('Ricarica non trovata.', 'NON_TROVATA');
  END IF;
  IF v_topup.status <> 'paid' THEN
    RETURN jsonb_build_object('result', 'gia_elaborata', 'status', v_topup.status);
  END IF;

  v_amount := LEAST(COALESCE(p_amount_cents, v_topup.amount_cents), v_topup.amount_cents);
  INSERT INTO public.wallets (user_id) VALUES (v_topup.user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_cents INTO v_balance FROM public.wallets WHERE user_id = v_topup.user_id FOR UPDATE;
  v_taken := LEAST(v_balance, v_amount);

  IF v_taken > 0 THEN
    PERFORM public.wallet_post(v_topup.user_id, -v_taken, 'chargeback', NULL, p_topup_id, NULL,
      CASE WHEN p_status = 'refunded' THEN 'Rimborso ricarica' ELSE 'Storno carta (chargeback)' END, NULL);
  END IF;

  UPDATE public.wallet_topups
     SET status = p_status, unrecovered_cents = v_amount - v_taken, updated_at = now()
   WHERE id = p_topup_id;

  RETURN jsonb_build_object('result', 'stornata', 'taken_cents', v_taken, 'unrecovered_cents', v_amount - v_taken,
                            'user_id', v_topup.user_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Permessi di esecuzione.
-- Supabase concede di default EXECUTE ad anon/authenticated su ogni nuova funzione:
-- qui si revoca tutto e si concede solo ciò che serve.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.wallet_is_admin(uuid),
  public.wallet_can_see_booking(uuid),
  public.wallet_ledger_immutable(),
  public.wallet_setting_int(text, integer),
  public.wallet_format_eur(integer),
  public.wallet_fail(text, text),
  public.sunset_at(date, double precision, double precision),
  public.hour_needs_lights(timestamptz),
  public.wallet_post(uuid, integer, text, uuid, uuid, uuid, text, uuid),
  public.wallet_settle_booking(uuid, uuid, text),
  public.wallet_save_booking(uuid, boolean, integer, integer, timestamptz[], text, jsonb, text, boolean, text, text, text, uuid, text),
  public.wallet_booking_summary(uuid, bigint),
  public.wallet_ledger_mark(),
  public.create_booking(integer, timestamptz[], text, jsonb, text, boolean, text, text, text, uuid),
  public.update_booking(uuid, integer, timestamptz[], text, jsonb, text, boolean, text, text, text, uuid),
  public.quote_booking(integer, timestamptz[], text, jsonb, text, boolean, uuid, integer),
  public.wallet_cancel_booking(uuid, boolean, text),
  public.cancel_booking(uuid),
  public.wallet_require_admin(),
  public.admin_update_booking(uuid, text, timestamptz[], text, jsonb, text, boolean, text, text, text, uuid),
  public.admin_cancel_booking(uuid, text),
  public.admin_cancel_reservations(uuid[], text),
  public.admin_wallet_topup_cash(uuid, integer, text),
  public.admin_wallet_adjust(uuid, integer, text),
  public.admin_set_court_rate(timestamptz, integer, integer, text),
  public.admin_set_lights_override(date, boolean, text),
  public.wallet_credit_topup(uuid, integer),
  public.wallet_close_topup(uuid, text),
  public.wallet_reverse_topup(uuid, text, integer)
FROM PUBLIC, anon, authenticated;

-- Usate dentro le policy RLS: devono restare eseguibili dagli utenti autenticati
GRANT EXECUTE ON FUNCTION
  public.wallet_is_admin(uuid),
  public.wallet_can_see_booking(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.sunset_at(date, double precision, double precision),
  public.hour_needs_lights(timestamptz),
  public.quote_booking(integer, timestamptz[], text, jsonb, text, boolean, uuid, integer),
  public.create_booking(integer, timestamptz[], text, jsonb, text, boolean, text, text, text, uuid),
  public.update_booking(uuid, integer, timestamptz[], text, jsonb, text, boolean, text, text, text, uuid),
  public.cancel_booking(uuid),
  public.admin_update_booking(uuid, text, timestamptz[], text, jsonb, text, boolean, text, text, text, uuid),
  public.admin_cancel_booking(uuid, text),
  public.admin_cancel_reservations(uuid[], text),
  public.admin_wallet_topup_cash(uuid, integer, text),
  public.admin_wallet_adjust(uuid, integer, text),
  public.admin_set_court_rate(timestamptz, integer, integer, text),
  public.admin_set_lights_override(date, boolean, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.wallet_credit_topup(uuid, integer),
  public.wallet_close_topup(uuid, text),
  public.wallet_reverse_topup(uuid, text, integer)
TO service_role;



-- >>>>>>>>>>>>>>>> supabase/staging/01_seed_staging.sql

-- SEED del progetto di STAGING (pihibucdmdvmexxwxvws). NON eseguire in produzione.
-- I 4 campi come in produzione (stessi id, nomi e superfici), per provare l'app in anteprima.
-- Eseguire dopo 00_base_schema.sql e le migration.

INSERT INTO public.courts (id, name, surface, is_active) VALUES
  (1, 'Cemento 3', 'cemento', true),
  (2, 'Cemento 4', 'cemento', true),
  (3, 'Erba sintetica', 'erba_sintetica', true),
  (4, 'Terra sintetica', 'terra_sintetica', true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('public.courts_id_seq', (SELECT MAX(id) FROM public.courts));

-- Pagamenti spenti finché non si decide di provarli (vedi docs/wallet-staging.md §8)
UPDATE public.app_settings SET value = 'false' WHERE key = 'pagamenti_attivi';

