-- SCHEMA BASE per il progetto di STAGING (pihibucdmdvmexxwxvws). NON eseguire in produzione.
--
-- Ricostruito dalla struttura reale di produzione (inspect_schema.sql, 18/09/2026).
-- Contiene solo ciò che in produzione esiste ma NON è creato dalle migration in
-- supabase/migrations/. Ordine di esecuzione su staging:
--   1. questo file
--   2. tutte le migration in supabase/migrations/, in ordine di nome
--   3. supabase/staging/01_seed_staging.sql (campi)
--
-- Esclusioni volute:
--  - trigger "cancellation-notify" su reservations: in produzione chiama la Edge Function di
--    PRODUZIONE (notifiche WhatsApp reali). In staging non va collegato.
--  - funzione notify_admin_on_new_profile: in produzione non è collegata a nessun trigger.
--  - tabelle/policy create dalle migration (app_settings, tournaments, member_names, ...).
--
-- DA CONFERMARE con inspect_schema_extra.sql: valori degli enum e corpo di private.is_admin/is_approved.

-- ---------------------------------------------------------------------------
-- Estensioni e tipi
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$ BEGIN
  CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'pending', 'cancelled'); -- DA CONFERMARE
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.court_surface AS ENUM ('terra', 'sintetico', 'cemento'); -- DA CONFERMARE
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

CREATE OR REPLACE FUNCTION private.is_admin() -- DA CONFERMARE
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION private.is_approved() -- DA CONFERMARE
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT p.approved FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(), private.is_approved() TO authenticated;

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
