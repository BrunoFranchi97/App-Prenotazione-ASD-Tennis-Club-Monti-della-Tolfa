# Wallet — messa in staging

Guida passo passo per provare il portafoglio su un database **separato** dalla produzione.
Piano completo: [piano-wallet-pagamenti.md](piano-wallet-pagamenti.md).

> **Regola d'oro:** in produzione (`nrnyfuqyeqcegnpoetrd`) si esegue solo la query di **lettura** del passo 2.
> Migration, test, Edge Function e impostazioni vanno **solo** sul progetto di staging.
> Prima di ogni comando `supabase` controlla il project ref a cui sei collegato.

---

## 1. Creare il progetto di staging

1. supabase.com → *New project* (piano Free; se l'organizzazione è Pro, creane prima una nuova gratuita).
2. Nome: `canepacce-staging`, regione europea (es. Frankfurt), password del database da conservare.
3. Annota il **project ref** (la parte `xxxx` in `https://xxxx.supabase.co`), la **anon key** e la **service_role key** (*Project Settings → API*).

## 2. Leggere lo schema di produzione (sola lettura)

1. Progetto di **produzione** → *SQL Editor* → incolla `supabase/staging/inspect_schema.sql` → *Run*.
2. Copia il JSON risultante e passamelo (o salvalo in `supabase/staging/schema_produzione.json`).
   Contiene solo la struttura (tabelle, vincoli, regole di accesso), nessun dato dei soci.
   Controlla però che nelle funzioni non compaiano chiavi o password.
3. Con quel JSON preparo `supabase/staging/00_base_schema.sql`: la copia fedele dello schema di produzione
   (tabelle `profiles`, `courts`, `reservations`, policy, trigger…), che oggi non è nelle migration (rischio R2).

## 3. Applicare schema e migration a staging

Progetto di **staging** → *SQL Editor* → *New query* → incolla **tutto** `supabase/staging/setup_staging_completo.sql` → *Run*.

Il file unisce, in ordine: `00_base_schema.sql` (struttura di produzione), tutte le migration, `01_seed_staging.sql` (i 4 campi).
Va eseguito una sola volta su un progetto vuoto. Esito atteso: *Success* senza errori.
Se si modifica uno dei file di origine, rigenerare il file unico (vedi intestazione).

## 4. Eseguire i test SQL su staging

*SQL Editor* di staging → incolla `supabase/tests/wallet_test.sql` → *Run*.

- Se finisce **senza errori**, tutti i test sono passati (lo script termina con `ROLLBACK`, non lascia dati).
- Se un test fallisce compare un errore `TEST FALLITO: <nome del test>`.

In locale gli stessi test sono già stati eseguiti con successo su un Postgres in memoria;
su staging verificano anche la compatibilità con lo schema reale.

## 5. Edge Function su staging

Serve la CLI di Supabase (`npx supabase …`, nessuna installazione globale).

```bash
npx supabase login
npx supabase link --project-ref pihibucdmdvmexxwxvws        # ATTENZIONE: il ref di STAGING, non di produzione

npx supabase secrets set \
  PAYMENT_PROVIDER=stripe \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  APP_BASE_URL=https://<url-preview-vercel> \
  CRON_SECRET=<stringa-casuale-lunga> \
  BREVO_API_KEY=<chiave-brevo>
# con Mollie: PAYMENT_PROVIDER=mollie e MOLLIE_API_KEY=test_... al posto delle chiavi Stripe

npx supabase functions deploy wallet-create-checkout
npx supabase functions deploy payment-webhook --no-verify-jwt
npx supabase functions deploy wallet-reconcile --no-verify-jwt
```

Se il deploy chiede Docker e sul PC non c'è, aggiungere `--use-api` ai comandi di deploy.

`payment-webhook` e `wallet-reconcile` sono senza verifica JWT perché li chiamano il fornitore e il cron,
ma sono comunque protetti: firma del fornitore e header `x-cron-secret`.

### Stripe (modalità test)
*Developers → Webhooks → Add endpoint*
- URL: `https://pihibucdmdvmexxwxvws.supabase.co/functions/v1/payment-webhook`
- Eventi: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`
- Copia il *Signing secret* (`whsec_…`) in `STRIPE_WEBHOOK_SECRET`.

### Mollie (modalità test)
Nessuna configurazione: l'indirizzo del webhook viene passato a ogni pagamento.

## 6. Controllo periodico (pg_cron)

*Database → Extensions*: abilitare `pg_cron` e `pg_net`. Poi nell'SQL Editor di staging:

```sql
SELECT cron.schedule('wallet-reconcile', '0 * * * *', $$
  SELECT net.http_post(
    url := 'https://pihibucdmdvmexxwxvws.supabase.co/functions/v1/wallet-reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
$$);
```

## 7. Collegare l'anteprima Vercel a staging

Vercel → progetto → *Settings → Environment Variables*, **solo per l'ambiente Preview**:

| Variabile | Valore |
|---|---|
| `VITE_SUPABASE_URL` | `https://pihibucdmdvmexxwxvws.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key di staging |

Production resta invariato. Poi ridistribuisci l'anteprima del branch `feature/payments-wallet`.

## 8. Attivare i pagamenti (solo staging)

Le prenotazioni restano gratuite finché:

```sql
UPDATE public.app_settings SET value = 'true' WHERE key = 'pagamenti_attivi';
```

Tariffe iniziali già caricate: €3 senza luci, €5 con luci. Soglia luci X = 30 minuti:

```sql
UPDATE public.app_settings SET value = '30' WHERE key = 'luci_soglia_minuti';
```

## Prove manuali da fare su staging

| # | Prova | Come |
|---|---|---|
| T20 | Concorrenza sui saldi | due browser, due soci con lo stesso partecipante a saldo limitato, conferma quasi simultanea: il saldo non va mai sotto zero |
| T25 | Pagamento con chiusura del browser | avvia una ricarica, paga con carta di test, chiudi la scheda prima del ritorno: il saldo si aggiorna comunque |
| T29 | Webhook perso | disattiva temporaneamente l'endpoint Stripe, paga, riattivalo e lancia `wallet-reconcile` |
| T31 | Storno | Stripe test: carta `4000 0000 0000 0259` (genera una contestazione) |
