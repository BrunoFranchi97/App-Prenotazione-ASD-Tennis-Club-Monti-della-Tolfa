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
