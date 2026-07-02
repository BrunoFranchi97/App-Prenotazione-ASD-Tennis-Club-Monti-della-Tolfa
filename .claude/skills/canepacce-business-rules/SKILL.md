---
name: canepacce-business-rules
description: Riferimento di dominio/business logic per l'app Prenotazioni Canepacce (ASD Tennis Club Monti della Tolfa). Usa SEMPRE questa skill prima di modificare qualsiasi cosa relativa a prenotazioni campi, limiti settimanali, prenotazioni per conto terzi, blocco slot, prenotazione scuola tennis in bulk, torneo sociale, certificati medici, cerco partita/match, ruoli admin vs socio, o vincoli orari/temporali — anche quando la richiesta sembra una piccola modifica isolata (es. "cambia il limite a 3", "aggiungi un vincolo per il sabato"). Descrive ogni regola, il perché esiste, i casi limite noti, e il file/funzione esatti che la implementano (src/utils/bookingLimits.ts, src/pages/ThirdPartyBooking.tsx, src/pages/BookingCalendar.tsx, src/pages/AdminBulkBooking.tsx, src/utils/tournament.ts, supabase/migrations/), così chi tocca il codice sa cosa può rompere. Consulta anche per domande tipo "perché questo utente non riesce a prenotare" o "questo comportamento è voluto o è un bug".
---

# Le regole di dominio di Canepacce — note di un system architect

Ogni sistema di prenotazione ha regole che sembrano arbitrarie finché non conosci la
storia dietro. Qui dentro ci sono anni di piccoli aggiustamenti fatti per problemi reali
del circolo — persone che monopolizzavano i campi, prenotazioni fantasma nei tornei,
frequentatori occasionali che si comportavano da soci a tempo pieno. Ogni regola che
sembra "strana" ha quasi sempre un motivo concreto: leggilo prima di semplificarla o
rimuoverla.

Questo documento non sostituisce la lettura del codice — ti dice **dove guardare** e
**perché** quel codice è fatto così, in modo che una modifica non rompa un equilibrio che
non vedi a prima vista.

## 1. Il modello utenti — chi può fare cosa

Tabella `profiles` (tipi in `src/types/supabase.ts`, interfaccia `Profile`):

| Campo | Significato |
|---|---|
| `status` | `'pending' \| 'approved' \| 'rejected'` — stato di iscrizione |
| `approved` (bool) | **legacy**, tenuto per compatibilità: rispecchia `status === 'approved'`. Non rimuoverlo: `src/hooks/use-approval-check.tsx` legge ANCORA `approved`, non `status`, per decidere se un utente può prenotare. Se aggiorni `status` senza aggiornare `approved` in parallelo, rompi silenziosamente l'accesso alle prenotazioni. |
| `is_admin` (bool) | accesso al pannello `/admin/*` e a tutte le esenzioni admin (vedi §3) |
| `member_type` | `'socio_effettivo' \| 'frequentatore_occasionale'` — introdotto in `supabase/migrations/20260626000000_add_member_type.sql`, default `'socio_effettivo'` per tutti i profili preesistenti |

**Perché esiste `member_type`**: il circolo ha soci a tutti gli effetti (quota annuale,
accesso pieno) e "frequentatori occasionali" (accesso più limitato, es. abbonamenti
ridotti). Le regole di prenotazione sono deliberatamente più permissive per i soci
effettivi e più strette per gli occasionali — è una leva commerciale, non solo tecnica: se
allarghi i limiti degli occasionali senza che sia una decisione di business, stai
regalando benefit dei soci effettivi.

Il flusso di approvazione (`AdminApprovals.tsx`) aggiorna **entrambi** i campi insieme:
```ts
await supabase.from('profiles').update({
  approved: status === 'approved',
  status: status,
  approved_at: status === 'approved' ? new Date().toISOString() : null
});
```
Qualsiasi nuovo punto che tocca lo stato di approvazione deve seguire lo stesso pattern
duale, non uno dei due soli.

## 2. Le regole core di prenotazione — `src/utils/bookingLimits.ts`

Questo file è **la fonte di verità unica** per i limiti settimanali. Non replicare questa
logica altrove: se serve in una pagina nuova, importa `getBookingLimitsStatus()`.

### 2.1 — Il vincolo fisico: 1 riga = 1 ora

Ogni riga della tabella `reservations` rappresenta esattamente **un'ora** di gioco. Questo
non è solo una convenzione applicativa: è imposto a livello database dal check constraint
`reservations_duration_60`. L'intera app — dalla ricerca dello slot occupato
(`isEqual(parseISO(res.starts_at), slotStart)` in `BookingCalendar.tsx`,
`ThirdPartyBooking.tsx`) alla generazione degli slot in bulk
(`AdminBulkBooking.tsx`) — assume che una prenotazione di N ore sia **N righe
consecutive con lo stesso `court_id`**, non una riga con `ends_at - starts_at = N ore`.

Questo è esattamente il bug risolto in questa sessione in `AdminBlockSlots.tsx`: bloccare
uno slot di più ore inserendo una singola riga multi-ora violava
`reservations_duration_60` — la fix corretta genera N righe da un'ora ciascuna con un
ciclo `while`, pattern poi riutilizzato in `AdminBulkBooking.tsx`:
```ts
const hourlySlots = [];
let slotStart = startDateTime;
while (slotStart < endDateTime) {
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
  hourlySlots.push({ starts_at: slotStart.toISOString(), ends_at: slotEnd.toISOString() });
  slotStart = slotEnd;
}
```
**Se in futuro devi inserire una prenotazione che copre più di un'ora, usa sempre questo
pattern.** Non tentare mai di rimuovere il constraint per "semplificare" un inserimento: lo
romperesti in tutta l'app, non solo nel punto che stai modificando (vedi anche il file
`supabase_update.sql` in root, che contiene un tentativo storico di rimuovere questo
vincolo manualmente fuori dalle migration — è un segnale di drift dello schema da
verificare con l'admin del DB prima di un go-live, non un pattern da imitare).

### 2.2 — Limiti settimanali: concorrenza vs. tetto totale

`getBookingLimitsStatus(userReservations, targetDate, memberType)` calcola due cose
diverse, ed è il punto più delicato di tutta la business logic:

- **Socio Effettivo** (`concurrencyMax = 2`, `weeklyTotalMax = Infinity`): può avere fino
  a **2 prenotazioni attive contemporaneamente** in un dato momento, ma può cumularne
  quante ne vuole in una settimana **a rotazione** — appena una prenotazione passata
  termina (`endTime.getTime() > now.getTime()` diventa falso), si libera uno slot di
  concorrenza e può prenotarne un'altra, anche nella stessa settimana Lun-Dom. Questo è lo
  "slot rotativo": un socio effettivo che gioca lunedì e martedì può prenotare di nuovo
  mercoledì, perché lunedì è già concluso.
- **Frequentatore Occasionale** (`concurrencyMax = 1`, `weeklyTotalMax = 2`): oltre al
  vincolo di concorrenza (1 sola prenotazione attiva alla volta), ha anche un **tetto
  assoluto di 2 prenotazioni totali per settimana** (Lun-Dom), attive o già concluse. Il
  commit "Frequentatore occasionale: slot rotativo valido una volta sola (max 2
  prenotazioni/settimana)" ha introdotto proprio questo secondo tetto per impedire che un
  occasionale, sfruttando la rotazione, giocasse più di 2 volte a settimana.

Il calcolo raggruppa prima le prenotazioni in "blocchi logici" (`groupReservationsIntoBlocks`):
righe consecutive sullo stesso campo con differenza tra `ends_at` e il prossimo `starts_at`
inferiore a 1 secondo vengono unite in un unico blocco — così una prenotazione di 2 ore (2
righe da 1 ora) conta come **1** prenotazione ai fini del limite, non 2. Se aggiungi una
nuova sorgente di prenotazioni multi-ora, verifica che generi righe realmente consecutive
(gap < 1s), altrimenti il raggruppamento fallisce silenziosamente e il conteggio dei limiti
risulterà gonfiato.

**Perché due tetti diversi (concorrenza vs. totale)**: il socio effettivo paga una quota
che gli dà accesso pieno — l'unico freno è non poter monopolizzare i campi *nello stesso
momento*. Il frequentatore occasionale ha un accesso proporzionato a un utilizzo più
saltuario, quindi ha sia un freno di concorrenza sia un tetto assoluto settimanale.

### 2.3 — Durata massima per prenotazione: 2 ore, admin esenti

`durationMax: 2` in `BookingLimitsStatus`, applicato lato UI in `handleSlotClick` di
`BookingCalendar.tsx`/`ThirdPartyBooking.tsx`:
```ts
if (!isAdmin && lastIdx - firstIdx + 1 > 2) return;
```
Gli admin bypassano questo limite ovunque appaia (`!isAdmin && ...`) — è un pattern
ricorrente in tutta l'app: **ogni nuovo vincolo di prenotazione va sempre scritto come
`if (!isAdmin && condizione) blocca`**, mai come blocco assoluto, altrimenti l'admin perde
la sua autonomia operativa (fondamentale per gestire casi eccezionali, tornei, scuola
tennis).

In `BookingCalendar.tsx` c'è anche un controllo aggiuntivo quando si selezione un blocco di
slot: se uno slot intermedio nel range è già occupato, il blocco non viene esteso e viene
mostrato un errore ("Non puoi selezionare un blocco con slot già occupati nel mezzo").
Questo evita che un socio prenoti 08:00 e 10:00 lasciando un buco alle 09:00 — i blocchi
devono essere sempre orari contigui.

### 2.4 — Orario prenotabile e slot "scaduto"

Orario: 08:00–22:00, 14 slot da un'ora per campo (`allTimeSlots`, generato con un loop
`for (let i = 8; i < 22; i++)` in ogni pagina di prenotazione). Uno slot smette di essere
prenotabile solo quando la sua **ora di fine** è già passata (`isBefore(slotEnd, now)`),
non quando inizia — quindi lo slot dell'ora corrente resta prenotabile fino al suo
termine. Questo è stato un aggiustamento esplicito ("slot ora corrente sempre
prenotabile") per non penalizzare un socio che vuole prenotare last-minute per l'ora in
corso.

### 2.5 — Anticipo massimo di prenotazione (orizzonte temporale)

- Socio effettivo: 14 giorni da oggi
- Frequentatore occasionale: 7 giorni da oggi
- **Admin: nessun limite** (`maxDate` diventa `undefined`, nessun `toDate` passato al
  componente `Calendar`) — decisione esplicita presa in questa sessione: "l'admin deve
  godere di tutte situazioni senza vincoli in quanto admin". Vale in
  `BookingCalendar.tsx`, `ThirdPartyBooking.tsx` e nel calendario di
  `ReservationFormDialog.tsx` (usato solo da `AdminReservations.tsx`, quindi lì il limite è
  stato rimosso senza bisogno di un controllo `isAdmin` — il componente è ad uso esclusivo
  admin).

### 2.6 — Restrizione superficie per frequentatori occasionali

`isSlotAvailable` in `BookingCalendar.tsx`/`ThirdPartyBooking.tsx`:
```ts
if (!isAdmin && memberType === 'frequentatore_occasionale') {
  const isDomenica = date.getDay() === 0;
  if (isDomenica && hours < 12) {
    // blocca terra/sintetico prima delle 12 di domenica
  }
}
```
La domenica mattina (prima delle 12) è tipicamente il momento di massimo utilizzo dei soci
effettivi (tornei sociali, gare a squadre) sui campi in terra/sintetico. La regola riserva
implicitamente quella fascia ai soci effettivi sui campi "pregiati", lasciando comunque
disponibile il cemento agli occasionali. Se aggiungi un nuovo campo, verifica il valore di
`surface` (case-insensitive, controllato con `.includes('sintetico')` /
`.includes('terra')`): il nome deve contenere una di queste parole per essere soggetto alla
restrizione.

## 3. Il ruolo Admin — principio di esenzione totale

L'admin (`is_admin: true`) è strutturalmente esente da ogni vincolo pensato per l'utilizzo
"normale" di un socio:
- Nessun limite settimanale (`if (!isAdmin) { check limiti }`)
- Nessun limite di durata (2h) per prenotazione
- Nessun limite di orizzonte temporale
- Nessuna restrizione di superficie/orario per frequentatori (non si applica, essendo
  admin per definizione non "frequentatore")

Il pattern di verifica ruolo è identico in ogni pagina admin (`AdminDashboard.tsx`,
`AdminBlockSlots.tsx`, `AdminBulkBooking.tsx`, `AdminTournament.tsx`): query
`profiles.select('is_admin').eq('id', user.id).single()`, se `!profile?.is_admin` →
`showError` + redirect a `/dashboard`. **Questo controllo è solo lato client**: la vera
barriera di sicurezza deve essere nelle Row Level Security policy di Supabase sulle
tabelle sensibili (`reservations`, `profiles`, `medical_certificates`) — se stai
implementando una nuova funzionalità admin, verifica sempre che esista anche la policy RLS
corrispondente e non fare affidamento solo sul controllo React.

## 4. Prenotazione per conto terzi — `ThirdPartyBooking.tsx` (`/book-for-third-party`)

Permette a un socio di prenotare un campo per un altro socio ("Prenota per un Socio"),
salvando `booked_for_first_name`/`booked_for_last_name` (e, se il nome matcha
univocamente un profilo esistente via `ilike`, anche `booked_for_user_id`).

Regole:
- **Riservata ai Soci Effettivi** (introdotta in questa sessione): un frequentatore
  occasionale non admin viene bloccato all'ingresso della pagina stessa
  (`showError` + redirect a `/dashboard`), non solo al momento della conferma — così non
  perde tempo a compilare un form che verrà comunque rifiutato.
  ```ts
  if (!admin && type !== 'socio_effettivo') {
    showError("La prenotazione per conto terzi è riservata ai Soci Effettivi.");
    navigate('/dashboard'); return;
  }
  ```
- **Non concorre al limite settimanale personale del prenotante** — la nota nell'UI lo
  dice esplicitamente ("Le prenotazioni effettuate per conto di altri soci non concorrono
  al tuo limite settimanale di 2 match"). Coerentemente, `getBookingLimitsStatus` viene
  comunque interpellato prima della conferma (righe 164-169) — quindi il socio prenotante
  DEVE comunque avere posto nel proprio ciclo di concorrenza personale per poter prenotare
  per un altro, anche se quella prenotazione poi non viene "consumata" per lui allo stesso
  modo (è comunque una riga con `user_id` = prenotante, quindi entra nel suo conteggio
  `weeklyCount` di `bookingLimits.ts` — l'affermazione UI "non concorre" è più una promessa
  di UX sul non fargli perdere il proprio turno di gioco fisico, ma la riga esiste
  comunque; **prestare attenzione a questa apparente contraddizione se si modifica questa
  area**: il testo comunica l'intento, il codice applica comunque il controllo standard di
  `bookingLimits.ts` come prima barriera).
- **Max 1 prenotazione conto terzi a settimana per prenotante, admin esenti** (introdotta
  in questa sessione): calcolata con un `Set` di chiavi `data|nome|cognome` sulle proprie
  prenotazioni che abbiano un `booked_for_first_name`/`last_name` valorizzato nella
  settimana Lun-Dom corrente:
  ```ts
  const thirdPartySessions = new Set(userReservations
    .filter(r => r.status !== 'cancelled' && (r.booked_for_first_name?.trim() || r.booked_for_last_name?.trim())
      && isWithinInterval(parseISO(r.starts_at), { start: weekStart, end: weekEnd }))
    .map(r => `${format(parseISO(r.starts_at), 'yyyy-MM-dd')}|${r.booked_for_first_name}|${r.booked_for_last_name}`));
  if (thirdPartySessions.size >= 1) { showError(...); return; }
  ```
  Nota: la chiave include la data, quindi tecnicamente più slot nello stesso giorno per lo
  stesso beneficiario contano come 1 "sessione" — è corretto, perché rappresentano lo
  stesso blocco di gioco.
- Orizzonte temporale: stesso di `BookingCalendar.tsx` (14gg socio effettivo, 7gg
  occasionale, illimitato per admin).
- Limite 2 ore consecutive: stesso pattern `!isAdmin && ...`, MA qui non c'è il controllo
  "niente buchi nel mezzo" presente in `BookingCalendar.tsx` — se lo aggiungi, verifica che
  non rompa il flusso esistente.

## 5. Prenotazione Scuola Tennis — `AdminBulkBooking.tsx` (`/admin/bulk-booking`, solo admin)

Strumento per inserire in blocco gli orari ricorrenti della scuola tennis su N settimane
consecutive, evitando all'admin di creare decine di prenotazioni manuali una per una.

Flusso concettuale (`handleVerifyAndBook`):
1. L'admin costruisce un **modello settimanale** (righe: giorno + campo + ora inizio/fine,
   `TemplateRow[]`).
2. Sceglie una settimana di partenza (`startOfWeek(..., { weekStartsOn: 1 })`, Lun-Dom) e
   un numero di settimane da ripetere (1-52).
3. Il sistema genera **tutti** gli slot orari risultanti (una riga per ogni ora, coerente
   col vincolo `reservations_duration_60`, §2.1), deduplicando via `Set` su
   `courtId|timestamp` per evitare doppioni se due righe del modello si sovrappongono.
4. **Verifica di conflitto prima di qualsiasi insert**: interroga le prenotazioni non
   cancellate esistenti nel range coinvolto e le confronta con gli slot generati usando
   `new Date(...).getTime()` come chiave (non la stringa ISO grezza, per evitare falsi
   negativi dovuti a differenze di formattazione timestamptz tra `+00:00` e `Z`).
5. **Se anche un solo slot è in conflitto: ZERO inserimenti** — tutto o niente. Viene
   mostrato un `AlertDialog` con l'elenco di ogni slot in conflitto (data, orario, campo,
   nome dell'occupante) e l'invito a contattare quella persona prima di riprovare. Questo
   comportamento **non va mai cambiato in un "inserisci quello che puoi"**: è stato
   richiesto esplicitamente dall'admin del club per evitare prenotazioni scolastiche
   parzialmente create che confonderebbero il tabellone.
6. Se non ci sono conflitti: insert in chunk da 200 righe, `user_id` = admin corrente,
   `booking_type: 'lezione'`, `booked_for_first_name/last_name` = beneficiario indicato nel
   form (default "Scuola"/"Tennis", editabile).

**Perché non un parser di messaggi WhatsApp**: era stata valutata una funzione che
convertisse un messaggio testuale ("Lunedì Campo 1 dalle 16 alle 18...") direttamente in
prenotazioni. È stata scartata su richiesta esplicita del club a favore di un builder
manuale a righe — più lento da compilare la prima volta, ma senza ambiguità di parsing su
formati di messaggio non standardizzati. Non reintrodurre un parser di testo libero senza
una richiesta esplicita in tal senso.

Il nome della sezione/pagina è **"Prenotazione Scuola Tennis"** — è una scelta esplicita
del club, non rinominarla (es. in "Bulk Booking" o simili) senza conferma.

## 6. Blocca Slot — `AdminBlockSlots.tsx` (`/admin/block-slots`, solo admin)

Permette all'admin di riservare un intervallo di tempo su un campo per manutenzione o
motivi organizzativi, salvando `booked_for_first_name: 'SLOT'`, `booked_for_last_name:
'BLOCCATO'` come marcatore convenzionale (così appare come occupato nel tabellone con un
nome riconoscibile invece di un nome socio). Come discusso in §2.1, l'inserimento genera
**una riga per ogni ora** dell'intervallo bloccato, mai una riga multi-ora — è il fix
applicato in questa sessione al bug `reservations_duration_60`.

## 7. Torneo Sociale — `src/utils/tournament.ts` + `AdminTournament.tsx` + `BookingCalendar.tsx`

Tabella `tournaments`: `name`, `description`, `start_date`/`end_date`, `poster_url`,
`override_mode: 'auto' | 'on' | 'off'`.

`isTorneoAttivo(tournament)` (funzione pura, riusata ovunque serva sapere se il torneo è
"in corso"):
- `override_mode === 'on'` → sempre attivo, a prescindere dalle date (per forzare
  manualmente l'attivazione, es. il torneo continua oltre la data prevista)
- `override_mode === 'off'` → sempre disattivo (per disattivare avvisi anche se le date
  tecnicamente lo coprirebbero, es. torneo annullato)
- `override_mode === 'auto'` → attivo solo se la data odierna è compresa tra `start_date`
  e `end_date` (confronto su `Date` con `setHours(0,0,0,0)`, quindi a livello di giorno,
  non di orario)

**Effetto del torneo attivo su `BookingCalendar.tsx`**: alcuni slot vengono marcati come "a
rischio revoca" (`isTorneoSlot`), con un'icona di avviso discreta e un banner esplicativo
se il socio ne seleziona uno, MA **restano normalmente prenotabili** — l'obiettivo non è
bloccare le prenotazioni, ma avvisare onestamente che potrebbero essere spostate/annullate
dall'organizzazione per esigenze del torneo. Le regole di cosa sia "a rischio":
- **Campi in cemento sono sempre esclusi** (il torneo non si gioca lì): `court.surface`
  contiene "cemento" → mai a rischio, a prescindere da orario/giorno.
- Fascia serale 18:00–21:00 (tutti i giorni, sui campi non in cemento).
- Sabato e domenica mattina, prima delle 12:00.

Se cambi le fasce orarie del torneo o aggiungi un nuovo tipo di superficie esclusa,
modifica **solo** `isTorneoSlot` dentro `BookingCalendar.tsx` — è l'unico punto che
implementa questa logica, `isTorneoAttivo` in `tournament.ts` risponde solo "il torneo è
attivo sì/no", non "questo slot è a rischio".

## 8. Certificati Medici — `MedicalCertificates.tsx`

Tabella `medical_certificates`: `issue_date`, `expiry_date`, `certificate_type`
(`'agonistico' | 'non_agonistico'`), `file_url` (path su Supabase Storage bucket
`medical-certificates`), `is_valid` (colonna DB, calcolata/gestita separatamente — la UI
calcola comunque una validità "live" con `isAfter(parseISO(expiry_date), startOfDay(new
Date()))`, non fidandosi ciecamente del campo `is_valid` per la visualizzazione badge).

Validazioni al salvataggio: data di rilascio non nel futuro, data di scadenza successiva
alla data di rilascio, file obbligatorio. Il download avviene sempre tramite URL firmato a
vita breve (`createSignedUrl(file_url, 60)`, 60 secondi) — mai esporre un URL pubblico
diretto al file: se aggiungi un nuovo punto di accesso ai certificati, riusa questo
pattern, non generare link permanenti.

## 9. Cerco Partita / Match — `FindMatch.tsx` + `MatchBooking.tsx`

Tabella `match_requests`: stato `'open' | 'matched' | 'cancelled' | 'expired'`, tipo
`'singolare' | 'doppio'`, livello `'principiante' | 'intermedio' | 'avanzato' |
'agonista'`.

Un socio pubblica una richiesta (`FindMatch.tsx`, tab "Pubblica Sfida") con data, orario
preferito, campo, livello, tipo. Prima della pubblicazione viene verificato che il campo
non sia già prenotato in quella fascia (query su `reservations` con `.lt('starts_at',
endISO).gt('ends_at', startISO)`, l'unico posto nell'app che usa un confronto ad
intervallo invece del confronto esatto per-slot usato altrove — coerente col fatto che qui
non si crea ancora una prenotazione, solo una proposta).

Quando un altro socio "Accetta Sfida" (`MatchBooking.tsx`), avviene una **doppia verifica**
prima di confermare, proprio perché tra la pubblicazione e l'accettazione può passare
tempo:
1. Il limite settimanale dell'utente accettante viene ricontrollato con
   `getBookingLimitsStatus` (stesso identico controllo di `BookingCalendar.tsx`) — **non
   bypassa i limiti standard**, anche se la richiesta era già stata "prenotata" a livello
   di intenzione.
2. La disponibilità del campo viene **ri-verificata in tempo reale** subito prima
   dell'insert (anti race-condition: nel frattempo qualcun altro potrebbe aver prenotato
   quello stesso slot per altra via). Se anche a questo punto emergono conflitti, la
   prenotazione fallisce con un messaggio esplicito ("il campo è stato prenotato nel
   frattempo") e si torna alla bacheca.

Se estendi questo flusso, mantieni questo doppio controllo: è un pattern
difensivo deliberato contro le condizioni di gara tra "proposta" e "conferma effettiva".

## 10. Vincoli a livello database — la rete di sicurezza finale

Oltre ai controlli applicativi sopra, due meccanismi Postgres proteggono l'integrità anche
se un bug client-side lasciasse passare qualcosa:

- **`reservations_duration_60`** (check constraint): ogni riga deve coprire esattamente
  un'ora. Vedi §2.1 per l'implicazione pratica su qualsiasi nuovo insert.
- **`reservations_no_double_booking`** (`supabase/migrations/20260602000000_prevent_double_booking.sql`):
  unique index su `(court_id, starts_at) WHERE status <> 'cancelled'` — impedisce due
  prenotazioni attive sullo stesso campo alla stessa ora anche in caso di race condition
  (due utenti che prenotano lo stesso slot nello stesso istante). `BookingCalendar.tsx`
  gestisce esplicitamente il codice errore Postgres `23505` (violazione unique constraint)
  per mostrare un messaggio dedicato ("Uno o più slot sono stati appena prenotati da
  qualcun altro. Ricarica la pagina e riprova.") invece di un errore generico — se
  aggiungi un nuovo punto di insert su `reservations`, gestisci sempre questo codice
  errore allo stesso modo.

Questi due vincoli sono il motivo per cui ogni generazione di prenotazioni multiple in bulk
(scuola tennis, blocco slot) fa prima un controllo applicativo dei conflitti (più
"amichevole", con nomi e dettagli) e poi si affida comunque al DB come ultima barriera.

## 11. Casi limite noti (da non "sistemare" senza motivo)

- Un socio effettivo che prenota per conto terzi consuma comunque uno slot di concorrenza
  personale (§4) — è voluto, non un bug, anche se il messaggio UI può sembrare dire il
  contrario.
- Lo slot dell'ora corrente resta prenotabile fino al suo termine (§2.4) — non "arrotondare
  per difetto" nascondendolo prima che scada davvero.
- Un torneo con `override_mode: 'off'` non mostra MAI avvisi anche se le date coprono oggi
  — è la leva esplicita per disattivare comunicazioni su un torneo rimandato/annullato
  senza dover cancellare le date già impostate.
- I campi in cemento sono sempre esclusi dagli avvisi torneo, indipendentemente da
  qualunque altra condizione — non renderlo condizionale ad altro senza conferma.
- Il file `supabase_update.sql` in root (fuori da `supabase/migrations/`) contiene un
  tentativo storico di rimuovere manualmente `reservations_duration_60` — è un segnale di
  possibile drift tra lo schema in produzione e le migration versionate: prima di
  affidarti ciecamente al fatto che quel constraint sia realmente attivo in produzione,
  verificalo sul DB reale.

## 12. Mappa rapida "dove si trova la regola"

| Regola | File |
|---|---|
| Limiti settimanali (concorrenza/tetto) | `src/utils/bookingLimits.ts` → `getBookingLimitsStatus` |
| Raggruppamento prenotazioni in blocchi | `src/utils/bookingLimits.ts` → `groupReservationsIntoBlocks` |
| Prenotazione singola/doppia, 2h max, torneo a rischio | `src/pages/BookingCalendar.tsx` |
| Prenotazione per conto terzi, restrizione soci effettivi, max 1/sett. | `src/pages/ThirdPartyBooking.tsx` |
| Blocco slot manuale (manutenzione) | `src/pages/AdminBlockSlots.tsx` |
| Prenotazione Scuola Tennis in bulk, conflict-check all-or-nothing | `src/pages/AdminBulkBooking.tsx` |
| Stato torneo attivo (auto/on/off) | `src/utils/tournament.ts` → `isTorneoAttivo` |
| Slot "a rischio" per torneo (fasce/superficie) | `src/pages/BookingCalendar.tsx` → `isTorneoSlot` |
| Gestione torneo (date, locandina, override) | `src/pages/AdminTournament.tsx` |
| Certificati medici (validità, upload, download firmato) | `src/pages/MedicalCertificates.tsx` |
| Cerco Partita: pubblicazione richiesta | `src/pages/FindMatch.tsx` |
| Cerco Partita: accettazione + doppia verifica | `src/pages/MatchBooking.tsx` |
| Verifica ruolo admin lato client | ripetuto in ogni pagina `Admin*.tsx`, pattern: `profiles.select('is_admin')` |
| Verifica approvazione socio | `src/hooks/use-approval-check.tsx` (legge `approved`, non `status`) |
| `member_type` (colonna + default + trigger signup) | `supabase/migrations/20260626000000_add_member_type.sql` |
| Vincolo 1 riga = 1 ora | check constraint `reservations_duration_60` (DB) |
| Anti doppia prenotazione stesso slot | unique index `reservations_no_double_booking`, `supabase/migrations/20260602000000_prevent_double_booking.sql` |
| Tipi condivisi (Reservation, Profile, MemberType, ecc.) | `src/types/supabase.ts` |
