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
    WHEN unique_violation THEN
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
