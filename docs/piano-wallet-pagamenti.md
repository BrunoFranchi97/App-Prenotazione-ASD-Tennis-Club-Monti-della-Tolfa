# Piano — Portafoglio (wallet) e pagamenti in-app

> Stato: **backend preparato sul branch, non ancora applicato a nessun database**. Pagine dell'app non ancora toccate.
> Branch di lavoro: `feature/payments-wallet`. Data: 18/09/2026.
> Messa in staging: [wallet-staging.md](wallet-staging.md).

---

## 0. Cosa ho trovato nel codice (e perché conta)

| Fatto | Dove | Conseguenza per il wallet |
|---|---|---|
| Le prenotazioni sono scritte **direttamente dal client** con `supabase.from('reservations').insert/update` | `BookingCalendar.tsx:272`, `ThirdPartyBooking.tsx:234`, `EditBookingGroup.tsx:220-254`, `BookingHistory.tsx:161`, `MatchBooking.tsx:126` | Finché un socio può scrivere su `reservations` dal browser, può prenotare **senza pagare**. Le pagine socio passano alle RPC Postgres, che addebitano. Il permesso di scrittura diretta **non** viene tolto (decisione di Bruno, vedi §7, rischio R1 accettato). |
| Non esiste un'entità "prenotazione": un blocco di 2 ore sono **2 righe** raggruppate a posteriori per orari consecutivi | `bookingLimits.ts → groupReservationsIntoBlocks`, vincolo `reservations_duration_60` | Serve una tabella di testata `bookings` a cui agganciare partecipanti e addebiti. Le righe da 1 ora restano come sono (vincoli intatti). |
| La modifica (`EditBookingGroup`) fa 3 chiamate separate (annulla / aggiorna / inserisce) senza transazione né controllo errori | `EditBookingGroup.tsx:212-256` | Con i soldi di mezzo va sostituita da **una sola RPC atomica**. |
| Le pagine admin scrivono già direttamente su `reservations` | `AdminReservations.tsx`, `AdminBlockSlots.tsx`, `AdminBulkBooking.tsx` | Separazione naturale dei due percorsi: **RPC = percorso socio (paga)**, **scrittura diretta con RLS admin = pannello admin (non paga)**. |
| Esiste già `reservations.is_paid` + toggle manuale in `AdminReservations` | `supabase_is_paid_migration.sql`, `AdminReservations.tsx:283` | Resta per le prenotazioni da pannello/legacy. Le prenotazioni wallet risultano pagate per costruzione. |
| La RLS di `reservations` e `profiles` **non è nelle migration** versionate (schema creato a mano, più `supabase_update.sql` fuori dalle migration) | `supabase/migrations/` | Prima di tutto va fatto un dump dello schema/policy reali di produzione (rischio R2). |
| Le Edge Function esistenti usano `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, naming kebab-case, interruttori in `app_settings`, e **non verificano chi le chiama** | `cancellation-notify`, `daily-summary` | Riuso naming e pattern `app_settings`. Le nuove funzioni invece **devono** verificare il chiamante (JWT o firma del provider). |
| Nessun framework di test nel progetto, nessun `supabase/config.toml` (niente stack locale) | `package.json`, `supabase/` | Il piano di test prevede un progetto Supabase di staging + modalità test del provider (§6). |

---

## 1. Decisioni sulle domande aperte

Tutte le domande sono chiuse. Decisioni confermate da Bruno il 18/09/2026.

**D1 — Luci a cavallo del tramonto.** ✅ Confermato. Bruno regolerà X in seguito se serve.

> Ogni ora (= ogni riga `reservations`) si valuta a sé. L'ora paga la tariffa **luci per intero** se dopo il tramonto restano **più di X minuti di gioco**, cioè se `tramonto < fine_ora − X`. Altrimenti tariffa **giorno per intero**. **X = 30 minuti** di default, modificabile dall'admin (`app_settings.luci_soglia_minuti`).
>
> Esempio: tramonto 19:10, X=30. Ora 18–19: giorno. Ora 19–20: 19:10 < 19:30 → luci. Con tramonto 19:40 l'ora 19–20 sarebbe giorno.

Niente calcolo proporzionale (complica rimborsi e ricevute), nessun blocco delle prenotazioni.
**Tramonto:** calcolato **in locale** (algoritmo NOAA, coordinate di Canepacce ~42.15 N, 11.93 E, fuso Europe/Rome) da una funzione SQL pura: nessuna API esterna, nessuna cache, nessun cron da mantenere. L'admin può forzare luci sì/no per un giorno (`lights_overrides`, idea §6 del brief).

**D2 — Costo maestro.** ✅ Per ora **il maestro si paga fuori app**. In app: nome maestro obbligatorio sulla lezione, i partecipanti pagano solo il campo come una prenotazione normale. Lo schema prevede già `bookings.coach_fee_cents` (nullable, non usato) per attivare in futuro la divisione del costo maestro senza migrazioni distruttive.

**D3 — "Fino a un minuto prima".** Letterale: il socio può modificare/disdire fino a `inizio − 1 minuto` (parametro `modifica_cutoff_minuti = 1`). L'**admin** può modificare sempre, **anche a prenotazione passata**, per correggere errori: lo fa con una RPC admin dedicata che ricalcola gli addebiti e scrive il motivo nel ledger.

**D4 — Conto terzi.** Stesso meccanismo della selezione partecipanti. In più: chi prenota **non deve per forza essere tra i partecipanti**, e c'è un'opzione esplicita **"Pago io per tutti"** con riepilogo chiaro ("Verranno scalati €X dal tuo saldo per N persone"). Se non la spunta, pagano i partecipanti selezionati (con la cascata verso di lui).

**D5 — Aggiunta in modifica senza saldo.** Stessa cascata della creazione; se il prenotante non copre, **fallisce l'intera modifica** (rollback totale).

**D6 — Saldo a zero con prenotazioni future.** Non esiste: tutto è **prepagato** al momento della prenotazione.

### Domande emerse dal codice — decisioni

**D7 — Cascata.** ✅ Ognuno paga **la propria quota intera**, se ha saldo sufficiente. Se non ce l'ha, **l'intera quota** di quel partecipante passa al prenotante; il saldo del partecipante resta intatto (nessun addebito parziale). Se neanche il prenotante copre → prenotazione rifiutata.
*Interpretazione di "ognuno, se possibile, paga la propria quota": se intendevi invece "paga quello che ha e il prenotante il resto", è una modifica di poche righe nella funzione di addebito.*

**D8 — Consenso dei partecipanti.** ✅ **Nessuna approvazione** preventiva. L'addebito compare comunque nello storico movimenti del socio addebitato (con prenotazione e prenotante), così resta verificabile; eventuali errori li corregge l'admin (D3, §5.7). Nessuna notifica dedicata in questa fase.

**D9 — Ospiti non soci.** ✅ La quota dell'ospite la paga **il prenotante**.

**D10 — Disdetta.** ✅ Per ora rimborso **integrale** a chi ha pagato (stesso cutoff di 1 minuto).
**Penalità futura (già prevista dall'architettura):** disdetta a meno di X minuti dall'inizio → nessun rimborso (prenotazione pagata per intero); prima → rimborso integrale. Sarà un nuovo parametro `disdetta_penalita_minuti` più una condizione in `cancel_booking` ("dovuto = 100%" invece di "dovuto = 0"). Nessuna modifica di schema.

**D11 — Disdetta da pannello admin di una prenotazione pagata.** ✅ Rimborso automatico. Lo spostamento orario/campo da pannello **non ricalcola** (resta il prezzo pagato).

**D12 — Frequentatori occasionali.** ✅ Stessa tariffa. La colonna `court_rates.member_type` viene **tolta** dallo schema (niente complessità anticipata).

**D13 — Sfida accettata (`MatchBooking`).** ✅ Ogni partecipante paga la propria quota (chi ha pubblicato + chi accetta), con la regola D7 e chi accetta come prenotante.

**D14 — Chargeback / storno carta.** ✅ **Il saldo non va mai sotto zero, senza eccezioni.** In caso di storno si scala al massimo il saldo disponibile (fino a 0); l'eventuale parte non recuperata viene registrata sulla ricarica (`wallet_topups.unrecovered_cents`) e segnalata all'admin, che la gestisce fuori app. Il vincolo diventa un `CHECK (balance_cents >= 0)` direttamente sulla tabella.

**D15 — Limiti ricarica.** ✅ Nessun limite dell'app (niente minimo, massimo o frequenza). Resta solo il minimo tecnico imposto dal provider scelto (dell'ordine di €0,50–€1), letto dalla configurazione dell'adapter. Da tenere presente: con una commissione fissa di circa €0,25 a transazione, le ricariche piccole costano al club in proporzione di più.

---

## 2. Schema dati proposto

Importi sempre in **centesimi interi** (`integer`), mai decimali calcolati dal client.

### 2.1 Configurazione — `app_settings` (tabella esistente, nuove chiavi)

| key | default | uso |
|---|---|---|
| `pagamenti_attivi` | `false` | feature flag globale: `false` = le RPC prenotano a costo 0 (stesso codice, nessun fork) |
| `ricarica_tagli` | `[1000,2000,5000]` | tagli suggeriti (JSON, centesimi) |
| `luci_soglia_minuti` | `30` | la X di D1 |
| `modifica_cutoff_minuti` | `1` | D3 |
| `saldo_basso_soglia_cents` | `500` | notifica opzionale |

### 2.2 `court_rates` — tariffe con storico

```
id uuid PK
valid_from timestamptz NOT NULL             -- la tariffa vale da qui in poi
rate_day_cents int NOT NULL CHECK >= 0      -- €/persona/ora senza luci (oggi 300)
rate_lights_cents int NOT NULL CHECK >= 0   -- con luci (oggi 500)
created_by uuid, created_at timestamptz, note text
```

Tariffa applicata = l'ultima con `valid_from <= now()` **al momento dell'addebito** (prepagato). Mai UPDATE: si inserisce una nuova riga. Il prezzo applicato viene "congelato" sulla riga di prenotazione, quindi il cambio tariffa non tocca il passato.

### 2.3 `lights_overrides` — correzione manuale luci

`day date PK, force_lights boolean, reason text, created_by, created_at`.

### 2.4 `wallets` — saldo corrente (una riga per socio)

```
user_id uuid PK → profiles(id)
balance_cents int NOT NULL DEFAULT 0 CHECK (balance_cents >= 0)   -- mai sotto zero, nessuna eccezione (D14)
updated_at timestamptz
```

Nessun INSERT/UPDATE/DELETE concesso ai ruoli `authenticated`/`anon`; SELECT solo della propria riga (admin: tutte).

### 2.5 `wallet_ledger` — storico immutabile

```
id bigint identity PK
user_id uuid NOT NULL
amount_cents int NOT NULL CHECK (amount_cents <> 0)   -- + accredito, − addebito
balance_after_cents int NOT NULL
kind text NOT NULL CHECK IN ('topup_card','topup_cash','booking_charge','booking_cover',
                             'booking_refund','admin_correction','chargeback')
booking_id uuid NULL → bookings
topup_id uuid NULL → wallet_topups
covers_user_id uuid NULL      -- per 'booking_cover': di chi è la quota che il prenotante sta coprendo
created_by uuid NOT NULL      -- chi ha causato il movimento (socio, admin o sistema)
note text                     -- obbligatoria per admin_correction e topup_cash
created_at timestamptz DEFAULT now()
```

- Trigger `BEFORE UPDATE OR DELETE → RAISE EXCEPTION` (immutabile anche per errore dall'SQL editor).
- Unica porta d'ingresso: funzione interna `wallet_post(user, amount, kind, refs…)` che fa `SELECT … FOR UPDATE` sul wallet, controlla il saldo, inserisce la riga di ledger e aggiorna `wallets` **nella stessa transazione**.
- Vista `wallet_reconciliation`: `wallets.balance_cents` vs `SUM(ledger)` per socio → deve essere sempre vuota.

### 2.6 `wallet_topups` — ricariche con carta

```
id uuid PK
user_id uuid NOT NULL
amount_cents int NOT NULL
provider text NOT NULL            -- 'stripe' | 'mollie'
provider_ref text UNIQUE          -- id sessione/pagamento del provider
status text CHECK IN ('pending','paid','failed','expired','refunded','chargeback')
unrecovered_cents int NOT NULL DEFAULT 0   -- parte di uno storno non recuperabile dal saldo (D14)
created_at, paid_at timestamptz
```

L'accredito è una transizione `pending → paid` fatta **una sola volta** (idempotenza).

### 2.7 `payment_events` — audit webhook

`provider text, event_id text, received_at, payload jsonb, processed_at, error text`, `UNIQUE(provider, event_id)`. Un webhook ripetuto dal provider viene riconosciuto e ignorato.

### 2.8 `bookings` — la "prenotazione" come entità

```
id uuid PK
booker_id uuid NOT NULL          -- chi ha cliccato "prenota"
court_id int NOT NULL
booking_type text                -- singolare | doppio | lezione
coach_name text NULL             -- obbligatorio se lezione
coach_fee_cents int NULL         -- predisposto, non usato in fase 1 (D2)
booker_pays_all boolean DEFAULT false   -- D4
payment_mode text CHECK IN ('wallet','free','legacy','admin')
      -- wallet = pagata; free = flag pagamenti spento; legacy = creata prima del wallet; admin = pannello
status text CHECK IN ('active','cancelled')
version int NOT NULL DEFAULT 1   -- controllo ottimistico sulle modifiche
created_at, updated_at
```

### 2.9 `reservations` — colonne aggiunte (nessuna rimossa)

```
booking_id uuid NULL → bookings     -- NULL per righe create dal pannello admin
lights boolean NULL                 -- decisione luci congelata
unit_price_cents int NULL           -- €/persona per quest'ora, congelato
rate_id uuid NULL → court_rates
```

Vincoli esistenti intatti: `reservations_duration_60`, `reservations_no_double_booking`.

### 2.10 `booking_participants`

```
booking_id uuid → bookings
user_id uuid NULL → profiles
is_guest boolean DEFAULT false      -- D9 (ospite: la quota va al prenotante)
guest_name text NULL
added_at timestamptz, removed_at timestamptz NULL
```

Quanto ha pagato ognuno **non** si salva qui: si ricava dal ledger (`booking_id` + `user_id`/`covers_user_id`). Una sola fonte di verità.

### 2.11 Tipi TypeScript

Tutti i nuovi tipi (`Wallet`, `WalletLedgerEntry`, `WalletTopup`, `CourtRate`, `Booking`, `BookingParticipant`, `BookingQuote`) in `src/types/supabase.ts`, come da CLAUDE.md.

---

## 3. Logica lato database (RPC Postgres)

Tutta la logica che tocca soldi sta in funzioni `SECURITY DEFINER` con `search_path` fissato, che usano `auth.uid()` (mai uno user id passato dal client) e ricalcolano il prezzo da zero.

| RPC | Chi | Cosa fa |
|---|---|---|
| `sunset_at(day date) → timestamptz` | interna | Calcolo NOAA, puro e deterministico |
| `hour_needs_lights(starts_at) → bool` | interna | override del giorno se presente, altrimenti `tramonto < ends_at − X` |
| `quote_booking(court, starts[], participants[], booker_pays_all)` | socio | **Solo anteprima** (nessuna scrittura): prezzo per ora, luci sì/no, quota di ognuno, chi finirebbe in cascata, se il saldo basta. La UI mostra questo, ma non viene mai usato per addebitare. |
| `create_booking(court, starts[], type, participants[], coach_name, booker_pays_all)` | socio | Validazioni server (slot allineati all'ora 08–23 Europe/Rome, contigui, non scaduti, ≤2h per non-admin, partecipanti soci approvati, numero coerente col tipo) → lock → insert `bookings` + righe `reservations` → addebiti con cascata → tutto o niente |
| `update_booking(booking_id, expected_version, starts[], participants[], …)` | prenotante (fino a inizio − 1 min) | Calcola gli addebiti "dovuti" nella nuova configurazione, li confronta con quelli già nel ledger e scrive **solo le differenze** (rimborsi a chi esce o paga meno, addebiti a chi entra, con cascata). Se il prenotante non copre → rollback di tutto |
| `cancel_booking(booking_id)` | prenotante (fino a inizio − 1 min) | = `update_booking` verso "niente dovuto": rimborso integrale (D10) |
| `admin_update_booking(...)`, `admin_cancel_booking(...)` | admin | Come sopra ma senza cutoff, anche a posteriori (D3), nota obbligatoria |
| `admin_wallet_topup_cash(user, amount, note)` | admin | Movimento `topup_cash`, traccia admin + nota |
| `admin_wallet_adjust(user, amount ±, note)` | admin | `admin_correction`, nota obbligatoria, mai negativo |
| `admin_set_court_rate(...)`, `admin_set_lights_override(...)` | admin | Inserisce nuove righe (mai UPDATE) |
| `wallet_credit_topup(topup_id, amount)` | solo `service_role` (webhook) | `pending → paid` + `topup_card`, idempotente, verifica che l'importo coincida |
| `wallet_close_topup(topup_id, stato)` / `wallet_reverse_topup(topup_id, stato, amount)` | solo `service_role` | Storno (D14): scala `min(saldo, importo)`, il resto va in `unrecovered_cents` + avviso admin |

**"Solo le differenze" è ciò che rende possibile la futura penalità** (§3.6 del brief): una disdetta con penalità del 50% sarà semplicemente "dovuto = 50%" invece di "dovuto = 0", con la stessa macchina di rimborso.

### Concorrenza

1. **Slot:** l'indice unico `reservations_no_double_booking` resta l'ultima barriera; l'errore `23505` viene tradotto nel messaggio già in uso ("Uno o più slot sono stati appena prenotati…").
2. **Saldi:** `SELECT … FROM wallets WHERE user_id = ANY(...) ORDER BY user_id FOR UPDATE`, con ordine fisso per evitare deadlock tra due prenotazioni che coinvolgono gli stessi soci.
3. **Modifiche:** `bookings.version` — `update_booking` fallisce con "La prenotazione è stata modificata nel frattempo, ricarica la pagina" se la versione non è quella attesa.
4. **Webhook doppi:** `UNIQUE(provider, event_id)` + transizione di stato unica sul topup.

### Algoritmo di addebito (creazione)

```
per ogni ora h: unit(h) = tariffa_giorno o tariffa_luci (congelata sulla riga)
quota = Σ unit(h)                        -- uguale per ogni partecipante
se booker_pays_all: il prenotante paga quota × N
altrimenti, per ogni partecipante p:
    ospite            → tutta la quota al prenotante
    p ≠ prenotante    → se saldo_p >= quota: p paga la quota
                        altrimenti: tutta la quota → 'booking_cover' sul prenotante, p non viene toccato (D7)
    p = prenotante    → paga la sua quota
se in qualunque momento il saldo del prenotante non basta → RAISE → rollback totale
```

Poiché totale = persone × ore × tariffa, la quota di ognuno è esatta: nessun arrotondamento di centesimi.

---

## 4. Edge Function

Stesso stile di quelle esistenti (`serve`, `corsHeaders`, `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, interruttori in `app_settings`).

```
supabase/functions/
  _shared/payments/
    provider.ts        interfaccia PaymentProvider
    stripe.ts          adapter Stripe
    mollie.ts          adapter Mollie
    index.ts           getProvider(): legge PAYMENT_PROVIDER
  wallet-create-checkout/
  payment-webhook/
  wallet-reconcile/
```

**Interfaccia `PaymentProvider`**

```ts
interface PaymentProvider {
  name: 'stripe' | 'mollie';
  createCheckout(i: {
    topupId: string; amountCents: number; email: string;
    successUrl: string; cancelUrl: string;
  }): Promise<{ providerRef: string; checkoutUrl: string }>;

  // Verifica + normalizza. Stripe: firma HMAC nell'header.
  // Mollie: il webhook porta solo l'id, la verifica consiste nel rileggere
  // il pagamento dall'API con la chiave segreta.
  verifyWebhook(req: Request): Promise<{
    eventId: string; providerRef: string;
    status: 'paid' | 'failed' | 'expired' | 'refunded' | 'chargeback';
    amountCents: number;
  }>;

  // Per la riconciliazione dei webhook persi
  getStatus(providerRef: string): Promise<{ status: string; amountCents: number }>;
}
```

Il dominio (wallet, prenotazioni) non sa quale provider c'è: cambiare provider = scrivere un file + cambiare `PAYMENT_PROVIDER`.

| Function | Auth | Cosa fa |
|---|---|---|
| `wallet-create-checkout` | JWT del socio obbligatorio (verificato) | Legge l'importo, controlla solo che sia un intero ≥ minimo tecnico del provider, crea `wallet_topups` `pending`, chiama `createCheckout`, restituisce l'URL. Non accredita nulla. |
| `payment-webhook` | `verify_jwt = false`, **verifica del provider obbligatoria** | Salva `payment_events` (idempotente), chiama `wallet_credit_topup` / `wallet_close_topup` / `wallet_reverse_topup` con service role. Risponde 200 anche per eventi già visti. |
| `wallet-reconcile` | chiamata da pg_cron con un secret condiviso | Ogni ora: topup `pending` più vecchi di 30 min → `getStatus` (copre webhook persi); topup mai pagati → `expired`; controlla `wallet_reconciliation`; opzionale: avviso saldo basso via Green API (stesse env `GREEN_API_*`). |

Env nuove: `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MOLLIE_API_KEY`, `APP_BASE_URL`, `CRON_SECRET`.

Per le prenotazioni **non** servono Edge Function: sono tutte RPC (una transazione DB vera, non simulata).

---

## 5. Flussi passo passo

### 5.1 Prenotazione standard (singolo/doppio)
1. Il socio sceglie campo, ore e tipo (come oggi) e seleziona i partecipanti dall'elenco soci (vista `member_names`, già esistente): 2 per singolo, 4 per doppio, prenotante incluso salvo "non gioco io".
2. La UI chiama `quote_booking` e mostra: prezzo per ora (con icona luci), quota di ciascuno, chi andrà in cascata, saldo dopo.
3. Controllo limiti settimanali lato client come oggi (`bookingLimits.ts`, invariato).
4. "Conferma" → `create_booking`. Il server ricalcola tutto; se nel frattempo i saldi sono cambiati il risultato può differire dall'anteprima → messaggio chiaro, nessun addebito.
5. Successo → `BookingSuccessDialog` con riepilogo addebiti; ogni socio addebitato vede il movimento nel proprio storico (D8).

### 5.2 Lezione con maestro
Come 5.1, tipo `lezione`, nome maestro obbligatorio, 1–N partecipanti, in app si paga solo il campo (D2).

### 5.3 Conto terzi
Come 5.1 con il prenotante non tra i partecipanti. Checkbox "Pago io per tutti" → riepilogo "Verranno scalati €X dal tuo saldo". Il limite "1 conto terzi a settimana" resta com'è in `ThirdPartyBooking.tsx`.

### 5.4 Modifica
1. Il prenotante apre `/edit-booking` (fino a inizio − 1 min; dopo, il tasto è disabilitato con spiegazione).
2. Cambia ore e/o partecipanti → anteprima del delta ("Rimborso a Mario €5, addebito a Luca €5").
3. `update_booking(expected_version)` → differenze nel ledger, tutto o niente (D5).
4. Admin: stessa logica senza cutoff, con motivazione.

### 5.5 Ricarica con carta
1. Profilo → "Ricarica": tagli da `ricarica_tagli` + importo libero.
2. `wallet-create-checkout` → redirect alla pagina ospitata del provider.
3. Ritorno in app su `/profile?ricarica=in-corso`: la pagina mostra "Pagamento in verifica" e attende il saldo via Realtime/polling breve. **Il ritorno non accredita nulla.**
4. Il provider chiama `payment-webhook` → verifica → `credit_topup` → saldo aggiornato.
5. Webhook perso → lo recupera `wallet-reconcile` entro un'ora.

### 5.6 Ricarica in contanti (admin)
Pannello admin → nuova sezione "Portafogli soci": cerca socio → "Accredita contanti" → importo + nota → `admin_wallet_topup_cash`. Nello storico: admin, data, importo, nota.

### 5.7 Correzione saldo (admin)
Stessa sezione → "Correggi saldo" (+/−) con motivazione obbligatoria → `admin_correction`. Mai modifica diretta del numero.

### 5.8 Pannello admin (invariato)
`AdminReservations`, `AdminBlockSlots`, `AdminBulkBooking` continuano a scrivere direttamente → `booking_id` NULL → nessun pagamento. Unica aggiunta (D11): annullare da pannello una prenotazione `wallet` passa per `admin_cancel_booking` e rimborsa.

---

## 6. Rollout e test

### Ambiente
- **Progetto Supabase di staging** (o Supabase Branching) con le stesse migration; Vercel preview del branch puntata lì tramite env.
- Provider in **modalità test** (Stripe test mode / Mollie test key) + webhook verso la function di staging.
- Prima migration del branch: **dump dello schema e delle policy reali di produzione** in `supabase/migrations/` (R2).

### Fasi (ognuna mergiabile e reversibile)
1. Schema + RPC + `pagamenti_attivi = false`. Le pagine socio passano alle RPC (prezzo 0). Nessun cambiamento visibile, ma tutte le scritture socio passano già dal server.
2. Wallet visibile, ricariche contanti/carta attive, prenotazioni ancora gratuite (i soci caricano il saldo).
3. `pagamenti_attivi = true`.

(La revoca della scrittura diretta su `reservations` ai non-admin è stata scartata: vedi R1.)

### Test automatici
- **SQL (pgTAP o script `supabase/tests/*.sql` su staging):** logica di prezzo, cascata, rollback, ledger immutabile, riconciliazione.
- **Deno test** per gli adapter (payload webhook di esempio, firma valida/non valida) e per `sunset_at` (confronto con effemeridi note, ±2 min).
- `vitest` solo se servono test sui componenti (nuova dipendenza, da confermare).

### Casi di test

| # | Area | Caso | Atteso |
|---|---|---|---|
| T1 | Prezzo | 1h alle 10, 2 persone, tariffe 3/5 | €3 a testa, `lights=false` |
| T2 | Tramonto | tramonto 19:10, X=30, ora 19–20 | luci |
| T3 | Tramonto | tramonto 19:40, X=30, ora 19–20 | giorno |
| T4 | Tramonto | 2h 18–20 a cavallo | ora 1 giorno, ora 2 luci, quota = 3+5 |
| T5 | Tramonto | cambio ora legale (ultima domenica di ottobre/marzo) | fuso Europe/Rome corretto |
| T6 | Tramonto | override admin "luci sì" | luci anche a mezzogiorno |
| T7 | Tariffe | cambio tariffa dopo una prenotazione | la prenotazione conserva il prezzo; una modifica successiva usa la nuova tariffa solo per le ore nuove |
| T8 | Cascata | B ha €3, deve €5, prenotante ha €10 | B non toccato (resta €3); prenotante −5 (sua quota) −5 (copertura di B) |
| T8b | Cascata | B ha €5, deve €5 | B −5, prenotante solo la sua quota |
| T9 | Cascata | come T8 ma prenotante ha €9 | **errore, nessun movimento, nessuna riga reservations** |
| T10 | Cascata | tutti a saldo 0, "pago io per tutti", saldo sufficiente | addebitato solo il prenotante |
| T11 | Ospite | doppio con 1 ospite | quota ospite al prenotante |
| T12 | Modifica | sostituisco B con C | B rimborsato di quanto pagato (e il prenotante della sua copertura), C addebitato |
| T13 | Modifica | aggiungo C senza saldo, prenotante non copre | modifica rifiutata per intero, stato identico a prima |
| T14 | Modifica | aggiungo un'ora | addebitata solo l'ora nuova a ciascuno |
| T15 | Modifica | a inizio − 30 s (socio) | rifiutata; da admin accettata |
| T16 | Modifica | admin su prenotazione di ieri | accettata, nota nel ledger |
| T17 | Disdetta | socio annulla | rimborso integrale a chi ha pagato; somma ledger della prenotazione = 0 |
| T18 | Disdetta | admin annulla da pannello una prenotazione wallet | rimborso |
| T19 | Concorrenza | 2 soci prenotano lo stesso slot in parallelo | uno riesce, l'altro `23505`, nessun addebito al secondo |
| T20 | Concorrenza | 2 prenotazioni parallele che usano il saldo di B (basta per una) | una passa, l'altra va in cascata o fallisce; mai saldo negativo |
| T21 | Concorrenza | 2 modifiche simultanee della stessa prenotazione | la seconda fallisce per `version` |
| T22 | Sicurezza | socio fa `insert` diretto su `reservations` dalla console | consentito (R1 accettato): la riga nasce senza `booking_id` e senza addebito |
| T23 | Sicurezza | socio chiama `credit_topup` o `admin_*` | negato |
| T24 | Sicurezza | socio tenta di passare prezzo/`user_id` | impossibile: le RPC non hanno questi parametri |
| T25 | Ricarica | pago e chiudo il browser prima del ritorno | accreditato dal webhook |
| T26 | Ricarica | apro la success URL senza pagare | nessun accredito |
| T27 | Ricarica | stesso webhook ripetuto 3 volte | un solo accredito |
| T28 | Ricarica | webhook con firma falsa / id inesistente | rifiutato, nessun accredito |
| T29 | Ricarica | webhook perso | recuperato da `wallet-reconcile` |
| T30 | Ricarica | importo sotto il minimo tecnico del provider, importo non intero/negativo | rifiutata; nessun altro limite (D15) |
| T31 | Chargeback | storno di €20 con saldo residuo €8 | saldo → 0 (mai negativo), `unrecovered_cents = 1200`, admin avvisato |
| T32 | Ledger | UPDATE/DELETE su `wallet_ledger` dall'SQL editor | eccezione |
| T33 | Riconciliazione | a fine suite | `wallet_reconciliation` vuota |
| T34 | Admin | admin prenota dal flusso socio | paga come tutti |
| T35 | Admin | admin da `AdminReservations` / `AdminBlockSlots` / `AdminBulkBooking` | nessun movimento wallet |
| T36 | Flag | `pagamenti_attivi = false` | prenotazioni `free`, nessun movimento |
| T37 | Regressione | limiti settimanali, 2h max, orizzonte 14/7 gg, torneo, conto terzi 1/sett. | invariati |
| T38 | Legacy | modifica di una prenotazione creata prima del wallet | nessun addebito retroattivo |

---

## 7. Rischi

| # | Rischio | Mitigazione |
|---|---|---|
| R1 | **Bypass del pagamento** scrivendo direttamente su `reservations` dalla console del browser. **Rischio accettato** da Bruno (18/09/2026): richiede competenze tecniche che i soci non hanno. | Nessun blocco. Le prenotazioni così create si riconoscono (`booking_id` NULL, `user_id` non admin) e, se servisse in futuro, si possono chiudere con una sola policy RLS senza toccare il codice. |
| R2 | Le RLS reali non sono versionate; `supabase_update.sql` indica drift dello schema. | Dump di produzione come prima migration del branch, confronto con staging. |
| R3 | Addebito a un socio a sua insaputa (D8: rischio accettato, nessuna approvazione). | Movimento visibile nello storico del socio con nome del prenotante; correzione admin (§5.7). |
| R9 | Storno carta dopo che il saldo è già stato speso (D14). | Parte non recuperata tracciata in `unrecovered_cents` e segnalata all'admin; gestione fuori app. |
| R4 | Limiti settimanali solo lato client (`bookingLimits.ts`): anche con le RPC restano aggirabili come oggi. | Fuori scope; spostabili lato server in seguito (CLAUDE.md vieta di duplicarli ora). |
| R5 | Obblighi fiscali ASD su incassi elettronici e saldi prepagati (ricevute, rendicontazione). | Da verificare col commercialista **prima** del go-live; ledger + export tesoriere lo agevolano. |
| R6 | Eliminazione profilo con saldo (`AdminUserManagement` fa DELETE su `profiles`). | Blocco eliminazione se saldo ≠ 0 o ci sono movimenti; FK del ledger senza cascade. |
| R7 | Fuso orario: oggi gli orari si calcolano nel browser. | Il server valida in `Europe/Rome`; test T5. |
| R8 | Edge Function esistenti senza verifica del chiamante. | Le nuove verificano sempre; le vecchie sono un tema separato (non le tocco). |

---

## 8. Idee aggiuntive del brief — cosa consiglio

| Idea | Consiglio |
|---|---|
| Storico tariffe | **Sì, già nello schema** (`court_rates`) |
| Feature flag globale | **Sì, già nello schema** (`pagamenti_attivi`); è anche il meccanismo di rollout |
| Override luci | **Sì, solo admin** (`lights_overrides`); dal socio no, per evitare contestazioni |
| Rate limit ricariche | **No** (D15) |
| Report tesoriere | **Sì, fase 2**: vista SQL + export CSV dal pannello admin |
| Notifica saldo basso | **Opzionale**, dentro `wallet-reconcile`; serve il telefono del socio (oggi Green API scrive solo sul gruppo) |

---

## 9. Prossimo passo

Tutte le decisioni sono prese (D1–D15, R1 scartata).

**Fatto sul branch (18/09/2026):**

| File | Contenuto |
|---|---|
| `supabase/migrations/20260918000000_wallet_schema.sql` | tabelle, colonne aggiunte a `reservations`, RLS, ledger immutabile, nuove chiavi `app_settings` |
| `supabase/migrations/20260918000001_wallet_functions.sql` | tramonto/luci, `wallet_post`, addebiti con cascata, prenotazione/modifica/disdetta/anteprima, funzioni admin, funzioni ricarica |
| `supabase/functions/_shared/payments/` | interfaccia `PaymentProvider` + adapter Stripe e Mollie (+ test) |
| `supabase/functions/wallet-create-checkout`, `payment-webhook`, `wallet-reconcile` | le tre Edge Function |
| `supabase/functions/_shared/adminAlert.ts` | avvisi email all'admin (Brevo, come `notify-admin-on-signup`) |
| `supabase/tests/wallet_test.sql` | test SQL (T1–T38 esclusi T20/T22/T29/T37/T38, vedi sotto) |
| `src/types/supabase.ts` | nuovi tipi |

**Verifiche eseguite in locale** (nessun database reale): migration + test SQL in un Postgres in memoria (PGlite) con uno schema base che imita Supabase → tutti i test superati; adapter di pagamento → 14/14 test (Node e Deno); Edge Function → controllo tipi Deno superato.

**Non ancora coperti dai test automatici:** T20 (concorrenza, serve due sessioni: da provare su staging), T22 (bypass accettato), T29 (webhook perso: serve il provider in modalità test), T37 (regressione limiti, lato pagine), T38 (legacy, lato pagine).

**Prossimi passi:**
1. Bruno crea il progetto di staging → si applicano schema di produzione + migration e si rilanciano i test SQL lì ([wallet-staging.md](wallet-staging.md)).
2. Scelta Stripe/Mollie in modalità test → deploy Edge Function su staging e prova di una ricarica vera (senza soldi reali).
3. Pagine dell'app (fase 1 del rollout): prenotazione, conto terzi, modifica, disdetta, sfida → RPC; saldo e storico nel profilo; sezione admin "Portafogli soci" e tariffe.
