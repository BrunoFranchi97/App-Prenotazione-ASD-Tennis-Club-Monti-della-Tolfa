-- Test del wallet: logica di prezzo, cascata, modifiche, disdette, ricariche, permessi.
--
-- ATTENZIONE: eseguire SOLO sul progetto di STAGING, mai in produzione.
--
-- Tutto il test è UN'UNICA istruzione (un blocco DO): crea i suoi strumenti e i dati di prova,
-- esegue i controlli e alla fine si annulla da solo sollevando un errore voluto.
-- Così funziona allo stesso modo nell'SQL Editor di Supabase, in psql o altrove, e non lascia dati.
--
-- Esito:
--   - errore che inizia con "OK - TUTTI I TEST SUPERATI"  → tutto bene (l'errore serve ad annullare i dati)
--   - errore che inizia con "TEST FALLITO:"               → un controllo non è passato
--   - qualsiasi altro errore                               → problema nello script o nello schema
--
-- Casi non coperti qui perché richiedono due sessioni parallele (T20, concorrenza sui saldi):
-- vedi docs/piano-wallet-pagamenti.md §6.

DO $test$
BEGIN
-- ---------------------------------------------------------------------------
-- Strumenti di test (schema wallet_test, annullato alla fine insieme a tutto il resto)
-- ---------------------------------------------------------------------------
CREATE SCHEMA wallet_test;
GRANT USAGE ON SCHEMA wallet_test TO authenticated;
CREATE TABLE wallet_test.ids (k text PRIMARY KEY, v text);

CREATE FUNCTION wallet_test.check(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FALLITO: %', p_msg;
  END IF;
  RAISE NOTICE 'ok  %', p_msg;
END;
$f$;

CREATE FUNCTION wallet_test.as_user(p_user uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$f$;

CREATE FUNCTION wallet_test.bal(p_user uuid) RETURNS integer LANGUAGE sql AS $f$
  SELECT COALESCE((SELECT balance_cents FROM public.wallets WHERE user_id = p_user), 0);
$f$;

-- Esegue p_sql e verifica che fallisca con l'HINT (codice) o lo SQLSTATE atteso (alternative separate da |)
CREATE FUNCTION wallet_test.expect_error(p_sql text, p_expected text, p_msg text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_hint text;
  v_state text;
  v_text text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT, v_state = RETURNED_SQLSTATE, v_text = MESSAGE_TEXT;
    PERFORM wallet_test.check(v_hint = ANY (string_to_array(p_expected, '|')) OR v_state = ANY (string_to_array(p_expected, '|')),
      format('%s (atteso %s, ottenuto %s/%s: %s)', p_msg, p_expected, v_hint, v_state, v_text));
    RETURN;
  END;
  PERFORM wallet_test.check(false, p_msg || ' (nessun errore sollevato)');
END;
$f$;

-- Ora locale (Europe/Rome) del giorno di test
CREATE FUNCTION wallet_test.at(p_day date, p_hour integer) RETURNS timestamptz LANGUAGE sql AS $f$
  SELECT (p_day + make_time(p_hour, 0, 0)) AT TIME ZONE 'Europe/Rome';
$f$;

GRANT SELECT ON wallet_test.ids TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA wallet_test TO authenticated;

DECLARE
  v_court integer;
  v_day date := current_date + 300; -- lontano, per non collidere con prenotazioni reali
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('00000000-0000-4000-8000-00000000000a', 'test-a@example.invalid', '{"full_name":"Test Anna"}'),
    ('00000000-0000-4000-8000-00000000000b', 'test-b@example.invalid', '{"full_name":"Test Bruno"}'),
    ('00000000-0000-4000-8000-00000000000c', 'test-c@example.invalid', '{"full_name":"Test Carla"}'),
    ('00000000-0000-4000-8000-00000000000d', 'test-d@example.invalid', '{"full_name":"Test Dario"}'),
    ('00000000-0000-4000-8000-00000000000e', 'test-e@example.invalid', '{"full_name":"Test Elena"}'),
    ('00000000-0000-4000-8000-0000000000ad', 'test-admin@example.invalid', '{"full_name":"Test Admin"}'),
    ('00000000-0000-4000-8000-0000000000ff', 'test-pending@example.invalid', '{"full_name":"Test InAttesa"}');

  UPDATE public.profiles SET approved = true, status = 'approved'
   WHERE id::text LIKE '00000000-0000-4000-8000-0000000000%' AND id <> '00000000-0000-4000-8000-0000000000ff';
  UPDATE public.profiles SET is_admin = true WHERE id = '00000000-0000-4000-8000-0000000000ad';
  UPDATE public.profiles p SET full_name = u.raw_user_meta_data ->> 'full_name'
    FROM auth.users u WHERE u.id = p.id AND p.id::text LIKE '00000000-0000-4000-8000-0000000000%';

  INSERT INTO public.courts (name, surface, is_active) VALUES ('Campo Test Wallet', enum_first(NULL::public.court_surface), true)
  RETURNING id INTO v_court;
  INSERT INTO wallet_test.ids VALUES ('court', v_court::text), ('day', v_day::text);

  -- Tariffa nota e deterministica per i test
  INSERT INTO public.court_rates (valid_from, rate_day_cents, rate_lights_cents, note)
  VALUES (now(), 300, 500, 'test');

  -- Giorno di test senza luci (override), il giorno dopo con luci
  INSERT INTO public.lights_overrides (day, force_lights, reason) VALUES (v_day, false, 'test'), (v_day + 1, true, 'test');

  UPDATE public.app_settings SET value = 'true' WHERE key = 'pagamenti_attivi';
  UPDATE public.app_settings SET value = '30' WHERE key = 'luci_soglia_minuti';
  UPDATE public.app_settings SET value = '1' WHERE key = 'modifica_cutoff_minuti';
END;

-- Saldi iniziali tramite ricarica contanti admin (verifica anche admin_wallet_topup_cash)
BEGIN
  PERFORM wallet_test.as_user('00000000-0000-4000-8000-0000000000ad');
  PERFORM public.admin_wallet_topup_cash('00000000-0000-4000-8000-00000000000a', 2000, 'test contanti');
  PERFORM public.admin_wallet_topup_cash('00000000-0000-4000-8000-00000000000b', 1000, 'test contanti');
  PERFORM public.admin_wallet_topup_cash('00000000-0000-4000-8000-00000000000c', 200, 'test contanti');
  PERFORM public.admin_wallet_topup_cash('00000000-0000-4000-8000-00000000000d', 500, 'test contanti');
  PERFORM public.admin_wallet_topup_cash('00000000-0000-4000-8000-0000000000ad', 5000, 'test contanti');
  PERFORM wallet_test.check(wallet_test.bal('00000000-0000-4000-8000-00000000000a') = 2000, 'ricarica contanti: saldo A = 20,00');
  PERFORM wallet_test.expect_error($q$SELECT public.admin_wallet_topup_cash('00000000-0000-4000-8000-00000000000a', 100, '  ')$q$,
    'NOTA', 'ricarica contanti senza nota rifiutata');
  PERFORM wallet_test.as_user('00000000-0000-4000-8000-00000000000a');
  PERFORM wallet_test.expect_error($q$SELECT public.admin_wallet_topup_cash('00000000-0000-4000-8000-00000000000a', 100, 'x')$q$,
    'NON_AUTORIZZATO', 'ricarica contanti da non-admin rifiutata');
END;

-- ---------------------------------------------------------------------------
-- Tramonto e luci
-- ---------------------------------------------------------------------------
DECLARE
  v_ss timestamptz;
  v_local time;
  v_a time;
  v_b time;
BEGIN
  v_local := (public.sunset_at('2026-06-21') AT TIME ZONE 'Europe/Rome')::time;
  PERFORM wallet_test.check(v_local BETWEEN '20:40' AND '20:58', 'tramonto 21/06 ≈ 20:49 (calcolato ' || v_local || ')');
  v_local := (public.sunset_at('2026-12-21') AT TIME ZONE 'Europe/Rome')::time;
  PERFORM wallet_test.check(v_local BETWEEN '16:36' AND '16:52', 'tramonto 21/12 ≈ 16:44 (calcolato ' || v_local || ')');
  v_local := (public.sunset_at('2026-09-18') AT TIME ZONE 'Europe/Rome')::time;
  PERFORM wallet_test.check(v_local BETWEEN '19:07' AND '19:23', 'tramonto 18/09 ≈ 19:15 (calcolato ' || v_local || ')');

  -- T5: cambio ora legale (25/10/2026): l'orologio locale del tramonto arretra di circa un'ora
  v_a := (public.sunset_at('2026-10-24') AT TIME ZONE 'Europe/Rome')::time;
  v_b := (public.sunset_at('2026-10-25') AT TIME ZONE 'Europe/Rome')::time;
  PERFORM wallet_test.check(v_a - v_b BETWEEN interval '55 minutes' AND interval '65 minutes',
    format('T5 ora legale: tramonto 24/10 %s, 25/10 %s', v_a, v_b));

  -- T2/T3: soglia X = 30 minuti di gioco dopo il tramonto (giorno senza override)
  v_ss := public.sunset_at(DATE '2026-09-18');
  PERFORM wallet_test.check(public.hour_needs_lights(v_ss - interval '1 hour' + interval '31 minutes'),
    'T2 ora che finisce 31 min dopo il tramonto: luci');
  PERFORM wallet_test.check(NOT public.hour_needs_lights(v_ss - interval '1 hour' + interval '29 minutes'),
    'T3 ora che finisce 29 min dopo il tramonto: niente luci');
  PERFORM wallet_test.check(NOT public.hour_needs_lights(wallet_test.at(DATE '2026-09-18', 10)), 'ore 10: niente luci');
  PERFORM wallet_test.check(public.hour_needs_lights(wallet_test.at(DATE '2026-09-18', 22)), 'ore 22: luci');

  -- T6: override admin
  PERFORM wallet_test.check(public.hour_needs_lights(wallet_test.at((SELECT v::date + 1 FROM wallet_test.ids WHERE k = 'day'), 10)),
    'T6 override "luci sì": luci anche alle 10');
  PERFORM wallet_test.check(NOT public.hour_needs_lights(wallet_test.at((SELECT v::date FROM wallet_test.ids WHERE k = 'day'), 22)),
    'T6 override "luci no": niente luci alle 22');
END;

-- ---------------------------------------------------------------------------
-- Prenotazione standard e cascata
-- ---------------------------------------------------------------------------
DECLARE
  v_court integer := (SELECT v::integer FROM wallet_test.ids WHERE k = 'court');
  v_day date := (SELECT v::date FROM wallet_test.ids WHERE k = 'day');
  A uuid := '00000000-0000-4000-8000-00000000000a';
  B uuid := '00000000-0000-4000-8000-00000000000b';
  C uuid := '00000000-0000-4000-8000-00000000000c';
  D uuid := '00000000-0000-4000-8000-00000000000d';
  E uuid := '00000000-0000-4000-8000-00000000000e';
  v_res jsonb;
  v_bookings_before integer;
BEGIN
  PERFORM wallet_test.as_user(A);

  -- Anteprima: nessuna scrittura
  SELECT count(*) INTO v_bookings_before FROM public.bookings;
  v_res := public.quote_booking(v_court, ARRAY[wallet_test.at(v_day, 10)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('user_id', B)));
  PERFORM wallet_test.check((v_res ->> 'ok')::boolean AND (v_res ->> 'quota_cents')::integer = 300,
    'anteprima: ok, quota 3,00');
  PERFORM wallet_test.check((SELECT count(*) FROM public.bookings) = v_bookings_before
    AND wallet_test.bal(A) = 2000 AND wallet_test.bal(B) = 1000, 'anteprima: nessuna scrittura, saldi invariati');

  -- T1: singolare 1h senza luci, entrambi pagano la propria quota
  v_res := public.create_booking(v_court, ARRAY[wallet_test.at(v_day, 10)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('user_id', B)));
  INSERT INTO wallet_test.ids VALUES ('b1', v_res ->> 'booking_id');
  PERFORM wallet_test.check(wallet_test.bal(A) = 1700 AND wallet_test.bal(B) = 700, 'T1 singolare: 3,00 a testa');
  PERFORM wallet_test.check((SELECT bool_and(NOT lights AND unit_price_cents = 300 AND is_paid)
    FROM public.reservations WHERE booking_id = (v_res ->> 'booking_id')::uuid), 'T1 riga: niente luci, 3,00, is_paid');

  -- T19: stesso slot già occupato
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz], 'singolare',
      '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court, wallet_test.at(v_day, 10), A, B),
    '23505|23P01', 'T19 slot già occupato: bloccato dai vincoli anti-sovrapposizione');
  PERFORM wallet_test.check(wallet_test.bal(A) = 1700, 'T19 nessun addebito sul tentativo fallito');
  v_res := public.quote_booking(v_court, ARRAY[wallet_test.at(v_day, 10)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('user_id', B)));
  PERFORM wallet_test.check(v_res ->> 'code' = 'SLOT_OCCUPATO', 'T19 anteprima segnala slot occupato');

  -- T8: C ha 2,00 e deve 3,00 → C non toccato, il prenotante copre tutta la quota
  v_res := public.create_booking(v_court, ARRAY[wallet_test.at(v_day, 11)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('user_id', C)));
  INSERT INTO wallet_test.ids VALUES ('b_cover', v_res ->> 'booking_id');
  PERFORM wallet_test.check(wallet_test.bal(C) = 200 AND wallet_test.bal(A) = 1100, 'T8 cascata: C intatto, A paga 3,00 + 3,00');
  PERFORM wallet_test.check((SELECT count(*) FROM public.wallet_ledger
    WHERE booking_id = (v_res ->> 'booking_id')::uuid AND kind = 'booking_cover' AND covers_user_id = C AND amount_cents = -300) = 1,
    'T8 movimento di copertura registrato per C');

  -- T9: D (5,00) prenota con E (0): servirebbero 6,00 → tutto rifiutato
  PERFORM wallet_test.as_user(D);
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz], 'singolare',
      '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court, wallet_test.at(v_day, 12), D, E),
    'SALDO_INSUFFICIENTE', 'T9 prenotante non copre: rifiutata');
  PERFORM wallet_test.check(wallet_test.bal(D) = 500 AND wallet_test.bal(E) = 0
    AND NOT EXISTS (SELECT 1 FROM public.bookings WHERE booker_id = D)
    AND NOT EXISTS (SELECT 1 FROM public.reservations WHERE court_id = v_court AND starts_at = wallet_test.at(v_day, 12) AND status <> 'cancelled'),
    'T9 nessun movimento, nessuna prenotazione, nessuna riga');

  -- T10: "pago io per tutti" (D non gioca): paga solo il prenotante
  PERFORM wallet_test.as_user(A);
  v_res := public.create_booking(v_court, ARRAY[wallet_test.at(v_day, 13)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', B), jsonb_build_object('user_id', E)), NULL, true);
  PERFORM wallet_test.check(wallet_test.bal(A) = 500 AND wallet_test.bal(B) = 700 AND wallet_test.bal(E) = 0,
    'T10 pago io per tutti: A paga 6,00, B ed E intatti');

  -- T11: ospite → la sua quota la paga il prenotante
  PERFORM wallet_test.as_user(B);
  v_res := public.create_booking(v_court, ARRAY[wallet_test.at(v_day, 14)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', B), jsonb_build_object('guest_name', 'Ospite Rossi')));
  PERFORM wallet_test.check(wallet_test.bal(B) = 100, 'T11 ospite: B paga 3,00 + 3,00');

  -- Validazioni
  PERFORM wallet_test.as_user(A);
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz], 'doppio',
      '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court, wallet_test.at(v_day, 15), A, B),
    'PARTECIPANTI', 'doppio con 2 giocatori rifiutato');
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz], 'lezione',
      '[{"user_id":"%s"}]')$q$, v_court, wallet_test.at(v_day, 15), A),
    'MAESTRO', 'lezione senza maestro rifiutata');
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz], 'singolare',
      '[{"user_id":"%s"},{"user_id":"00000000-0000-4000-8000-0000000000ff"}]')$q$, v_court, wallet_test.at(v_day, 15), A),
    'PARTECIPANTI', 'partecipante non approvato rifiutato');
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz], 'singolare',
      '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court, wallet_test.at(v_day, 15) + interval '30 minutes', A, B),
    'SLOT', 'orario non allineato all''ora rifiutato');
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz, %L::timestamptz, %L::timestamptz],
      'singolare', '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court,
      wallet_test.at(v_day, 15), wallet_test.at(v_day, 16), wallet_test.at(v_day, 17), A, B),
    'SLOT', 'socio: 3 ore rifiutate');
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz, %L::timestamptz],
      'singolare', '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court,
      wallet_test.at(v_day, 15), wallet_test.at(v_day, 17), A, B),
    'SLOT', 'ore non consecutive rifiutate');
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz],
      'singolare', '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court, wallet_test.at(current_date - 1, 10), A, B),
    'SLOT', 'orario già passato rifiutato');
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz],
      'singolare', '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court, wallet_test.at(v_day, 7), A, B),
    'SLOT', 'orario prima delle 08:00 rifiutato');
  PERFORM wallet_test.as_user('00000000-0000-4000-8000-0000000000ff');
  PERFORM wallet_test.expect_error(format($q$SELECT public.create_booking(%s, ARRAY[%L::timestamptz],
      'singolare', '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, v_court, wallet_test.at(v_day, 15), A, B),
    'NON_APPROVATO', 'socio non approvato non può prenotare');
END;

-- ---------------------------------------------------------------------------
-- Luci miste su 2 ore (T4) e admin che prenota dal flusso socio (T34)
-- ---------------------------------------------------------------------------
DECLARE
  v_court integer := (SELECT v::integer FROM wallet_test.ids WHERE k = 'court');
  v_day date := (SELECT v::date FROM wallet_test.ids WHERE k = 'day') + 2; -- nessun override: vale il tramonto
  ADM uuid := '00000000-0000-4000-8000-0000000000ad';
  A uuid := '00000000-0000-4000-8000-00000000000a';
  v_sunset_hour integer;
  v_res jsonb;
  v_expected integer;
  v_before integer := wallet_test.bal(ADM);
BEGIN
  -- due ore a cavallo del passaggio giorno → luci: la prima senza, la seconda con
  SELECT h INTO v_sunset_hour FROM generate_series(8, 21) h
   WHERE NOT public.hour_needs_lights(wallet_test.at(v_day, h)) AND public.hour_needs_lights(wallet_test.at(v_day, h + 1))
   ORDER BY h LIMIT 1;
  PERFORM wallet_test.as_user(ADM);
  v_res := public.create_booking(v_court, ARRAY[wallet_test.at(v_day, v_sunset_hour), wallet_test.at(v_day, v_sunset_hour + 1)],
    'singolare', jsonb_build_array(jsonb_build_object('user_id', ADM), jsonb_build_object('user_id', A)), NULL, true);
  v_expected := 300 + 500;
  PERFORM wallet_test.check((v_res ->> 'quota_cents')::integer = v_expected
    AND (SELECT count(DISTINCT lights) FROM public.reservations WHERE booking_id = (v_res ->> 'booking_id')::uuid) = 2,
    format('T4 ore %s-%s: prima senza luci, seconda con luci, quota 3,00 + 5,00', v_sunset_hour, v_sunset_hour + 2));
  PERFORM wallet_test.check(wallet_test.bal(ADM) = v_before - 2 * v_expected, 'T34 admin dal flusso socio: paga come tutti');

  -- Admin: nessun limite di 2 ore
  v_res := public.create_booking(v_court, ARRAY[wallet_test.at(v_day, 8), wallet_test.at(v_day, 9), wallet_test.at(v_day, 10)],
    'singolare', jsonb_build_array(jsonb_build_object('user_id', ADM), jsonb_build_object('guest_name', 'Ospite')));
  PERFORM wallet_test.check((v_res ->> 'quota_cents')::integer > 0, 'admin: 3 ore consentite');
END;

-- ---------------------------------------------------------------------------
-- Modifiche (T12, T13, T14, T21) e disdette (T17)
-- ---------------------------------------------------------------------------
DECLARE
  v_court integer := (SELECT v::integer FROM wallet_test.ids WHERE k = 'court');
  v_day date := (SELECT v::date FROM wallet_test.ids WHERE k = 'day');
  b1 uuid := (SELECT v::uuid FROM wallet_test.ids WHERE k = 'b1'); -- A + B alle 10, 3,00 a testa
  A uuid := '00000000-0000-4000-8000-00000000000a';
  B uuid := '00000000-0000-4000-8000-00000000000b';
  C uuid := '00000000-0000-4000-8000-00000000000c';
  D uuid := '00000000-0000-4000-8000-00000000000d';
  E uuid := '00000000-0000-4000-8000-00000000000e';
  v_version integer;
  v_a integer;
  v_b integer;
  v_d integer;
  v_res jsonb;
BEGIN
  PERFORM wallet_test.as_user(A);
  SELECT version INTO v_version FROM public.bookings WHERE id = b1;
  v_a := wallet_test.bal(A); v_b := wallet_test.bal(B); v_d := wallet_test.bal(D);

  -- T12: sostituisco B con D (D ha saldo) → B rimborsato, D addebitato
  v_res := public.update_booking(b1, v_version, ARRAY[wallet_test.at(v_day, 10)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('user_id', D)));
  PERFORM wallet_test.check(wallet_test.bal(B) = v_b + 300 AND wallet_test.bal(D) = v_d - 300 AND wallet_test.bal(A) = v_a,
    'T12 sostituzione: B +3,00, D -3,00, A invariato');

  -- T21: versione vecchia → rifiutata
  PERFORM wallet_test.expect_error(format($q$SELECT public.update_booking(%L, %s, ARRAY[%L::timestamptz], 'singolare',
      '[{"user_id":"%s"},{"user_id":"%s"}]')$q$, b1, v_version, wallet_test.at(v_day, 10), A, B),
    'VERSIONE', 'T21 modifica con versione superata rifiutata');

  -- T14: aggiungo un'ora → solo l'ora nuova per ciascuno (D ricarica prima, così paga da sé)
  v_version := v_version + 1;
  PERFORM wallet_test.as_user('00000000-0000-4000-8000-0000000000ad');
  PERFORM public.admin_wallet_topup_cash(D, 1000, 'test T14');
  PERFORM wallet_test.as_user(A);
  v_a := wallet_test.bal(A); v_d := wallet_test.bal(D);
  v_res := public.update_booking(b1, v_version, ARRAY[wallet_test.at(v_day, 9), wallet_test.at(v_day, 10)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('user_id', D)));
  PERFORM wallet_test.check(wallet_test.bal(A) = v_a - 300 AND wallet_test.bal(D) = v_d - 300 AND (v_res ->> 'quota_cents')::integer = 600,
    'T14 ora aggiunta: 3,00 in più a testa');

  -- T13: C ed E senza saldo sufficiente e A che non copre → modifica rifiutata per intero
  v_version := v_version + 1;
  PERFORM wallet_test.as_user('00000000-0000-4000-8000-0000000000ad');
  PERFORM public.admin_wallet_adjust(A, -wallet_test.bal(A), 'test: azzera saldo A');
  PERFORM wallet_test.as_user(A);
  v_d := wallet_test.bal(D);
  PERFORM wallet_test.expect_error(format($q$SELECT public.update_booking(%L, %s, ARRAY[%L::timestamptz, %L::timestamptz], 'doppio',
      '[{"user_id":"%s"},{"user_id":"%s"},{"user_id":"%s"},{"user_id":"%s"}]')$q$,
      b1, v_version, wallet_test.at(v_day, 9), wallet_test.at(v_day, 10), A, D, C, E),
    'SALDO_INSUFFICIENTE', 'T13 aggiunta senza copertura: modifica rifiutata');
  PERFORM wallet_test.check((SELECT version FROM public.bookings WHERE id = b1) = v_version
    AND (SELECT count(*) FROM public.booking_participants WHERE booking_id = b1) = 2
    AND wallet_test.bal(D) = v_d AND wallet_test.bal(C) = 200,
    'T13 stato identico a prima');

  -- T17: disdetta → rimborso integrale, saldo netto della prenotazione = 0
  v_res := public.cancel_booking(b1);
  PERFORM wallet_test.check((SELECT COALESCE(SUM(amount_cents), 0) FROM public.wallet_ledger WHERE booking_id = b1) = 0
    AND (SELECT status FROM public.bookings WHERE id = b1) = 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM public.reservations WHERE booking_id = b1 AND status <> 'cancelled'),
    'T17 disdetta: tutto rimborsato, righe annullate');
  PERFORM wallet_test.check(wallet_test.bal(A) = 600, 'T17 A riceve indietro le sue 2 quote (6,00)');

  -- Solo il prenotante può modificare/disdire
  PERFORM wallet_test.as_user(B);
  PERFORM wallet_test.expect_error(format($q$SELECT public.cancel_booking(%L)$q$, (SELECT v FROM wallet_test.ids WHERE k = 'b_cover')),
    'NON_AUTORIZZATO', 'un partecipante non può disdire la prenotazione altrui');
END;

-- ---------------------------------------------------------------------------
-- Cutoff (T15): solo se in questo momento l'ora corrente è prenotabile (08-22)
-- ---------------------------------------------------------------------------
<<t15>>
DECLARE
  v_court integer := (SELECT v::integer FROM wallet_test.ids WHERE k = 'court');
  v_now_local timestamp := now() AT TIME ZONE 'Europe/Rome';
  v_start timestamptz := date_trunc('hour', v_now_local) AT TIME ZONE 'Europe/Rome';
  A uuid := '00000000-0000-4000-8000-00000000000a';
  v_res jsonb;
BEGIN
  IF extract(hour FROM v_now_local) NOT BETWEEN 8 AND 22 OR v_now_local - date_trunc('hour', v_now_local) < interval '2 minutes' THEN
    RAISE NOTICE 'skip T15: fuori dall''orario prenotabile';
    EXIT t15;
  END IF;
  PERFORM wallet_test.as_user('00000000-0000-4000-8000-0000000000ad');
  PERFORM public.admin_wallet_topup_cash(A, 1000, 'test cutoff');
  PERFORM wallet_test.as_user(A);
  v_res := public.create_booking(v_court, ARRAY[v_start], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('guest_name', 'Ospite')));
  PERFORM wallet_test.check(v_res ->> 'booking_id' IS NOT NULL, 'ora corrente ancora prenotabile');
  PERFORM wallet_test.expect_error(format($q$SELECT public.cancel_booking(%L)$q$, v_res ->> 'booking_id'),
    'CUTOFF', 'T15 socio: disdetta dopo l''inizio rifiutata');
  PERFORM wallet_test.as_user('00000000-0000-4000-8000-0000000000ad');
  PERFORM public.admin_cancel_booking((v_res ->> 'booking_id')::uuid, 'test');
  PERFORM wallet_test.check((SELECT status FROM public.bookings WHERE id = (v_res ->> 'booking_id')::uuid) = 'cancelled',
    'T15/T16 admin: annullamento anche dopo l''inizio');
END;

-- ---------------------------------------------------------------------------
-- Pannello admin (T18, T35)
-- ---------------------------------------------------------------------------
DECLARE
  v_court integer := (SELECT v::integer FROM wallet_test.ids WHERE k = 'court');
  v_day date := (SELECT v::date FROM wallet_test.ids WHERE k = 'day') + 3;
  A uuid := '00000000-0000-4000-8000-00000000000a';
  B uuid := '00000000-0000-4000-8000-00000000000b';
  ADM uuid := '00000000-0000-4000-8000-0000000000ad';
  v_res jsonb;
  v_first uuid;
  v_panel uuid;
  v_a integer;
  v_b integer;
  v_ledger integer;
BEGIN
  PERFORM wallet_test.as_user(ADM);
  PERFORM public.admin_wallet_topup_cash(B, 1000, 'test pannello');
  PERFORM wallet_test.as_user(A);
  v_a := wallet_test.bal(A);
  v_b := wallet_test.bal(B);
  v_res := public.create_booking(v_court, ARRAY[wallet_test.at(v_day, 10), wallet_test.at(v_day, 11)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('user_id', B)));
  PERFORM wallet_test.check(wallet_test.bal(A) = v_a - 600, 'prenotazione 2 ore: 6,00 a testa');

  -- T18: l'admin annulla un'ora dal pannello → rimborso di quell'ora
  SELECT id INTO v_first FROM public.reservations
   WHERE booking_id = (v_res ->> 'booking_id')::uuid AND starts_at = wallet_test.at(v_day, 10);
  PERFORM wallet_test.as_user(ADM);
  PERFORM public.admin_cancel_reservations(ARRAY[v_first], NULL);
  PERFORM wallet_test.check(wallet_test.bal(A) = v_a - 300
    AND (SELECT status FROM public.bookings WHERE id = (v_res ->> 'booking_id')::uuid) = 'active',
    'T18 annullamento admin di un''ora: rimborso 3,00, prenotazione ancora attiva');

  -- T35: riga creata dal pannello (scrittura diretta, senza booking_id) → nessun movimento
  INSERT INTO public.reservations (court_id, user_id, starts_at, ends_at, status, booking_type)
  VALUES (v_court, ADM, wallet_test.at(v_day, 15), wallet_test.at(v_day, 16), 'confirmed', 'singolare')
  RETURNING id INTO v_panel;
  SELECT count(*) INTO v_ledger FROM public.wallet_ledger;
  PERFORM public.admin_cancel_reservations(ARRAY[v_panel], NULL);
  PERFORM wallet_test.check((SELECT count(*) FROM public.wallet_ledger) = v_ledger
    AND (SELECT status FROM public.reservations WHERE id = v_panel) = 'cancelled',
    'T35 riga da pannello: annullata senza movimenti');

  -- Correzione admin di una prenotazione (D3): tolgo B, nota obbligatoria
  PERFORM wallet_test.expect_error(format($q$SELECT public.admin_update_booking(%L, '', ARRAY[%L::timestamptz], 'singolare',
      '[{"user_id":"%s"},{"guest_name":"Ospite"}]')$q$, v_res ->> 'booking_id', wallet_test.at(v_day, 11), A),
    'NOTA', 'correzione admin senza motivo rifiutata');
  PERFORM public.admin_update_booking((v_res ->> 'booking_id')::uuid, 'B non si è presentato, sostituito da ospite',
    ARRAY[wallet_test.at(v_day, 11)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', A), jsonb_build_object('guest_name', 'Ospite')));
  PERFORM wallet_test.check(wallet_test.bal(A) = v_a - 600 AND wallet_test.bal(B) = v_b,
    'correzione admin: B rimborsato, A paga la quota dell''ospite');
END;

-- ---------------------------------------------------------------------------
-- Pagamenti spenti (T36)
-- ---------------------------------------------------------------------------
DECLARE
  v_court integer := (SELECT v::integer FROM wallet_test.ids WHERE k = 'court');
  v_day date := (SELECT v::date FROM wallet_test.ids WHERE k = 'day') + 4;
  A uuid := '00000000-0000-4000-8000-00000000000a';
  E uuid := '00000000-0000-4000-8000-00000000000e';
  v_res jsonb;
  v_ledger integer;
BEGIN
  UPDATE public.app_settings SET value = 'false' WHERE key = 'pagamenti_attivi';
  SELECT count(*) INTO v_ledger FROM public.wallet_ledger;
  PERFORM wallet_test.as_user(E); -- saldo zero
  v_res := public.create_booking(v_court, ARRAY[wallet_test.at(v_day, 10)], 'singolare',
    jsonb_build_array(jsonb_build_object('user_id', E), jsonb_build_object('user_id', A)));
  PERFORM wallet_test.check(v_res ->> 'payment_mode' = 'free' AND (SELECT count(*) FROM public.wallet_ledger) = v_ledger,
    'T36 pagamenti spenti: prenotazione gratuita, nessun movimento');
  PERFORM public.cancel_booking((v_res ->> 'booking_id')::uuid);
  PERFORM wallet_test.check((SELECT count(*) FROM public.wallet_ledger) = v_ledger, 'T36 disdetta gratuita: nessun movimento');
  UPDATE public.app_settings SET value = 'true' WHERE key = 'pagamenti_attivi';
END;

-- ---------------------------------------------------------------------------
-- Ricariche con carta (T25-T28) e storni (T31) — come le chiama la Edge Function
-- ---------------------------------------------------------------------------
DECLARE
  E uuid := '00000000-0000-4000-8000-00000000000e';
  v_topup uuid;
  v_topup2 uuid;
  v_res jsonb;
  v_before integer := wallet_test.bal(E);
BEGIN
  INSERT INTO public.wallet_topups (user_id, amount_cents, provider, provider_ref)
  VALUES (E, 2000, 'test', 'test_ref_1') RETURNING id INTO v_topup;

  PERFORM wallet_test.check(wallet_test.bal(E) = v_before, 'T26 ricarica creata ma non confermata: nessun accredito');
  PERFORM wallet_test.expect_error(format($q$SELECT public.wallet_credit_topup(%L, 1999)$q$, v_topup),
    'IMPORTO', 'T28 importo diverso da quello richiesto: rifiutato');
  PERFORM wallet_test.check(public.wallet_credit_topup(v_topup, 2000) = 'accreditata'
    AND wallet_test.bal(E) = v_before + 2000, 'T25 conferma provider: accreditati 20,00');
  PERFORM wallet_test.check(public.wallet_credit_topup(v_topup, 2000) = 'gia_elaborata'
    AND wallet_test.bal(E) = v_before + 2000, 'T27 conferma ripetuta: un solo accredito');

  -- ricarica scaduta ma poi pagata: accreditata comunque
  INSERT INTO public.wallet_topups (user_id, amount_cents, provider, provider_ref)
  VALUES (E, 500, 'test', 'test_ref_2') RETURNING id INTO v_topup2;
  PERFORM public.wallet_close_topup(v_topup2, 'expired');
  PERFORM wallet_test.check(public.wallet_credit_topup(v_topup2, 500) = 'accreditata', 'pagamento arrivato dopo la scadenza: accreditato');

  -- T31: E spende e poi la prima ricarica viene stornata → saldo a zero, mai negativo
  PERFORM wallet_test.as_user('00000000-0000-4000-8000-0000000000ad');
  PERFORM public.admin_wallet_adjust(E, -(wallet_test.bal(E) - 800), 'test: simula spesa');
  v_res := public.wallet_reverse_topup(v_topup, 'chargeback', 2000);
  PERFORM wallet_test.check(wallet_test.bal(E) = 0 AND (v_res ->> 'unrecovered_cents')::integer = 1200
    AND (SELECT unrecovered_cents FROM public.wallet_topups WHERE id = v_topup) = 1200,
    'T31 storno 20,00 con saldo 8,00: saldo 0, 12,00 non recuperati');
  v_res := public.wallet_reverse_topup(v_topup, 'chargeback', 2000);
  PERFORM wallet_test.check(v_res ->> 'result' = 'gia_elaborata', 'T31 storno ripetuto ignorato');
END;

-- ---------------------------------------------------------------------------
-- Integrità e permessi (T22, T23, T24, T32, T33)
-- ---------------------------------------------------------------------------
DECLARE
  A uuid := '00000000-0000-4000-8000-00000000000a';
BEGIN
  PERFORM wallet_test.expect_error('UPDATE public.wallet_ledger SET amount_cents = 1', 'P0001', 'T32 ledger: UPDATE vietato');
  PERFORM wallet_test.expect_error('DELETE FROM public.wallet_ledger', 'P0001', 'T32 ledger: DELETE vietato');
  PERFORM wallet_test.expect_error($q$UPDATE public.wallets SET balance_cents = -1$q$, '23514', 'saldo negativo impossibile');
  PERFORM wallet_test.check(NOT EXISTS (SELECT 1 FROM public.wallet_reconciliation), 'T33 saldi = somma dei movimenti');

  -- Da qui come utente dell'app (ruolo authenticated)
  PERFORM wallet_test.as_user(A);
  SET LOCAL ROLE authenticated;
  PERFORM wallet_test.expect_error(format($q$SELECT public.wallet_credit_topup(%L, 100)$q$, gen_random_uuid()),
    '42501', 'T23 socio non può accreditare ricariche');
  PERFORM wallet_test.expect_error(format($q$SELECT public.wallet_post(%L, 100000, 'topup_cash', NULL, NULL, NULL, 'x', NULL)$q$, A),
    '42501', 'T23 socio non può scrivere movimenti');
  PERFORM wallet_test.expect_error(format($q$UPDATE public.wallets SET balance_cents = 999999 WHERE user_id = %L$q$, A),
    '42501', 'T24 socio non può modificare il proprio saldo');
  PERFORM wallet_test.expect_error(format($q$INSERT INTO public.wallet_ledger (user_id, amount_cents, balance_after_cents, kind, note) VALUES (%L, 100, 100, 'topup_cash', 'x')$q$, A),
    '42501', 'T24 socio non può inserire movimenti');
  PERFORM wallet_test.expect_error(format($q$SELECT public.admin_wallet_adjust(%L, 100, 'x')$q$, A),
    'NON_AUTORIZZATO', 'T23 socio non può correggere saldi');
  PERFORM wallet_test.check((SELECT count(*) FROM public.wallet_ledger WHERE user_id <> A) = 0,
    'RLS: il socio vede solo i propri movimenti');
  PERFORM wallet_test.check((SELECT count(*) FROM public.wallets) = 1, 'RLS: il socio vede solo il proprio saldo');
  PERFORM wallet_test.expect_error('SELECT * FROM public.payment_events', '42501', 'payment_events non leggibile dai soci');
  RESET ROLE;
END;

-- Fine: errore voluto per annullare tutti i dati di prova
RAISE EXCEPTION USING ERRCODE = 'WT000',
  MESSAGE = 'OK - TUTTI I TEST SUPERATI. Questo "errore" è voluto: annulla tutti i dati di prova.';
END $test$;
