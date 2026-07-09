# CLAUDE.md — Guida Operativa per Claude Code
# ASD Tennis Club Monti della Tolfa — App Prenotazioni Canepacce

Questo file viene letto automaticamente da Claude ad ogni sessione. Contiene le regole operative, il design system, la logica di business e i protocolli di sicurezza da rispettare SEMPRE, senza eccezioni.

---

## 1. IDENTITA' DEL PROGETTO

- **Nome app:** App Prenotazioni Canepacce
- **Club:** ASD Tennis Club Monti della Tolfa
- **Indirizzo:** Via Braccianese Claudia snc, Loc. Canepacce - 00059 TOLFA
- **CF:** 91004980586
- **Email club:** tennisclubmontidellatolfa@gmail.com
- **Stack:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Supabase
- **Routing:** React Router v6, tutte le route in `src/App.tsx`
- **Backend:** Supabase (auth, database, storage, realtime, edge functions)

---

## 2. ARCHITETTURA E STRUTTURA FILE

```
src/
  pages/          # Una page per route
  components/     # Componenti riutilizzabili
  components/ui/  # shadcn/ui — NON MODIFICARE MAI questi file
  components/admin/ # Componenti specifici admin
  hooks/          # Custom hooks React
  integrations/supabase/ # Client Supabase
  types/supabase.ts # Tipi TypeScript condivisi — aggiungi qui i nuovi tipi
  utils/          # Utility pure (bookingLimits, toast, ecc.)
  globals.css     # CSS variables del design system — modificare con estrema cautela
```

### Route esistenti (NON rimuovere, NON rinominare senza conferma esplicita)
```
/                    -> Index.tsx
/login               -> Login.tsx
/register            -> Register.tsx
/forgot-password     -> ForgotPassword.tsx
/update-password     -> UpdatePassword.tsx
/dashboard           -> MemberDashboard.tsx
/profile             -> MyProfile.tsx
/book                -> BookingCalendar.tsx
/booking-confirmation -> BookingConfirmation.tsx
/history             -> BookingHistory.tsx
/edit-booking        -> EditBookingGroup.tsx
/book-for-third-party -> ThirdPartyBooking.tsx
/find-match          -> FindMatch.tsx
/match-booking       -> MatchBooking.tsx
/medical-certificates -> MedicalCertificates.tsx
/admin               -> AdminDashboard.tsx
/admin/reservations  -> AdminReservations.tsx
/admin/manage-schedules -> AdminManageSchedules.tsx
/admin/block-slots   -> AdminBlockSlots.tsx
/admin/usage-stats   -> AdminUsageStats.tsx
/admin/approvals     -> AdminApprovals.tsx
/admin/users         -> AdminUserManagement.tsx
/auth/verify         -> EmailVerificationHandler.tsx
```

---

## 3. DESIGN SYSTEM — REGOLE ASSOLUTE

### Palette colori (da globals.css — NON cambiare i valori)
```css
--primary: 138 41% 30%         /* Verde Club */
--primary-foreground: 0 0% 100%
--secondary: 138 41% 97%       /* Verde chiarissimo */
--accent: 23 72% 50%           /* Arancione Club */
--background: 0 0% 100%
--foreground: 222.2 84% 4.9%
--muted: 210 40% 96.1%
--muted-foreground: 215.4 16.3% 46.9%
--destructive: 0 84.2% 60.2%   /* Rosso errori */
--radius: 1rem                 /* 16px — stile premium */
```

### Classi CSS custom (globals.css)
- `.premium-card` — card con shadow leggera e hover lift
- `.premium-button-primary` — bottone verde sfumato con gradient
- `.premium-button-secondary` — bottone outline verde
- `.premium-input` — input con focus ring verde

### Colori Tailwind in uso nel codice
- `text-primary` / `bg-primary` / `border-primary` — verde club
- `text-club-orange` / `bg-club-orange` — arancione club (configurato in Tailwind config)
- `bg-[#F8FAFC]` — sfondo pagine principale (quasi bianco con tono freddo)
- `text-gray-900` — titoli principali
- `text-gray-500` — testi secondari / descrizioni
- `text-gray-400` — label uppercase
- `bg-white` — sfondo card
- `border-gray-100` — bordi card sottili

### Tipografia
- Titoli pagina: `text-3xl` o `text-4xl font-extrabold text-gray-900 tracking-tighter`
- Sottotitolo sezione: `text-sm font-bold text-primary uppercase tracking-[0.2em]`
- Label campi form: `text-xs font-black text-gray-400 uppercase tracking-[0.2em]`
- Testo descrizione card: `text-gray-500 text-sm leading-relaxed`
- Badge/chip: `text-[9px] font-black uppercase tracking-tighter`

### Border radius
- Card principali: `rounded-[1.5rem]` o `rounded-[2rem]`
- Bottoni principali: `rounded-xl` o `rounded-[1.5rem]`
- Slot orari / pill: `rounded-2xl`
- Tipologie partita (pill): `rounded-full`
- Avatar: `rounded-full`
- Icone box: `rounded-2xl`

### Shadow
- Card a riposo: `shadow-[0_2px_12px_rgba(0,0,0,0.06)]`
- Card on hover: `shadow-[0_8px_30px_rgba(0,0,0,0.08)]`
- Bottone primary: `shadow-lg shadow-primary/10`
- Premium var: `var(--shadow-premium)` / `var(--shadow-hover)`

### Animazioni e transizioni
- Transizione globale: `transition-all duration-300 ease-out` (su tutti gli elementi via globals.css)
- Hover card: `hover:-translate-y-2` (lift verticale)
- Hover bottone primario: `hover:scale-[1.01]`
- Active bottone: `active:scale-[0.97]` o `active:scale-[0.98]`
- Back button: `hover:scale-110 active:scale-95`
- Animazioni di ingresso: `animate-in fade-in slide-in-from-top-2` / `slide-in-from-bottom-4`
- Spinner loading: `animate-spin` su cerchio con `border-t-primary`
- Badge urgente: `animate-pulse`

---

## 4. PATTERN UI STANDARD (usare SEMPRE questi pattern)

### Layout pagina standard (utente)
```tsx
<div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
  <header className="flex justify-between items-center mb-10 max-w-7xl mx-auto">
    <div className="flex items-center gap-6">
      <Link to="/dashboard">
        <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
          <ArrowLeft size={20} />
        </Button>
      </Link>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Titolo Pagina</h1>
    </div>
    <UserNav />
  </header>
  {/* contenuto */}
</div>
```

### Layout pagina con Footer (dashboard e pagine principali)
```tsx
<div className="min-h-screen flex flex-col bg-[#F8FAFC]">
  <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
    {/* contenuto */}
  </div>
  <Footer />
</div>
```

### Card standard
```tsx
<Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-[1.5rem] transition-all duration-500 overflow-hidden bg-white hover:-translate-y-2">
  <div className="h-1.5 w-full bg-primary"></div> {/* accent bar colorata in cima */}
  <CardHeader className="pb-2">
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2 bg-primary/10 text-primary">
      <Icon size={24} />
    </div>
    <CardTitle className="text-xl font-bold tracking-tight text-gray-900">Titolo</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-gray-500 text-sm mb-6 leading-relaxed">Descrizione</p>
    <Button className="w-full h-12 rounded-xl font-bold ...">Azione</Button>
  </CardContent>
</Card>
```

### Bottone primario (azione principale)
```tsx
<Button className="w-full h-16 rounded-[1.5rem] font-black text-xl shadow-xl bg-gradient-to-br from-primary to-[#23532f] text-white hover:scale-[1.01] active:scale-[0.98] shadow-primary/20">
  Testo Azione <ChevronRight size={24} />
</Button>
```

### Bottone secondario (outline)
```tsx
<Button variant="outline" className="w-full h-12 rounded-xl font-bold border-2 border-gray-100 text-gray-700 hover:border-primary/20 hover:bg-primary/5 hover:text-primary flex items-center justify-between px-5">
  Testo <ChevronRight size={18} />
</Button>
```

### Loading spinner
```tsx
<div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
  <div className="flex flex-col items-center">
    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    <p className="mt-4 text-gray-500 font-medium">Caricamento...</p>
  </div>
</div>
```

### Skeleton loading (per sezioni parziali)
```tsx
<Skeleton className="h-12 w-64" />
<Skeleton className="h-64 w-full rounded-[1.5rem]" />
```

### Stato vuoto / empty state
```tsx
<div className="flex flex-col items-center justify-center py-20 px-6 bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100 text-gray-400">
  <Icon className="h-10 w-10 mb-4 opacity-20" />
  <p className="text-sm font-bold uppercase tracking-widest text-center">Messaggio stato vuoto</p>
</div>
```

### Header sezione con label uppercase
```tsx
<div>
  <p className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-1">Sottotitolo</p>
  <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Titolo Principale</h1>
</div>
```

### Toast / notifiche
- Sempre usare `showSuccess(msg)` e `showError(msg)` da `@/utils/toast`
- NON usare `alert()` o `console.log()` visibili all'utente

---

## 5. COMPONENTI CONDIVISI — NON DUPLICARE, SEMPRE RIUSARE

| Componente | Path | Uso |
|---|---|---|
| `UserNav` | `src/components/UserNav.tsx` | Avatar + dropdown utente — presente in OGNI header |
| `Footer` | `src/components/Footer.tsx` | Footer con info club — nelle dashboard e pagine principali |
| `AuthLayout` | `src/components/AuthLayout.tsx` | Wrapper auth — gestisce redirect automatici |
| `BookingLimitsBox` | `src/components/BookingLimitsBox.tsx` | Box limiti prenotazione settimanale |
| `BookingSuccessDialog` | `src/components/BookingSuccessDialog.tsx` | Modal conferma prenotazione |
| `ErrorBoundary` | `src/components/ErrorBoundary.tsx` | Wrappa tutta l'app in App.tsx |
| `EmailVerificationHandler` | `src/components/EmailVerificationHandler.tsx` | Gestisce verifica email |

---

## 6. LOGICA DI BUSINESS — REGOLE CRITICHE

### Prenotazioni
- **Orario prenotabile:** 08:00 - 23:00 (slot da 1 ora, 15 slot totali per campo — ultimo slot 22:00-23:00)
- **Max durata prenotazione:** 2 ore consecutive (max 2 slot selezionabili) — gli admin sono esenti
- **Limite settimanale:** 2 prenotazioni per utente per settimana (Lun-Dom)
- **Anticipo prenotazione:** max 14 giorni dalla data odierna
- **Slot scaduto:** non prenotabile solo se l'ora di fine e' gia' passata (lo slot dell'ora corrente resta prenotabile fino al suo termine)
- **Tipi prenotazione (BookingType):** `singolare` | `doppio` | `lezione`
- **Stato prenotazione:** `confirmed` | `pending` | `cancelled`
- La logica limiti e' centralizzata in `src/utils/bookingLimits.ts` — NON replicarla altrove

### Utenti / Profili
- **Status profilo:** `pending` | `approved` | `rejected` (campo `status` in profiles)
- Campo `approved: boolean` — mantenuto per compatibilita' legacy, non rimuovere
- Un utente deve essere `approved=true` per poter prenotare
- **Ruoli:** `is_admin: boolean` — gli admin accedono al pannello `/admin/*`
- La verifica admin viene fatta lato client + lato Supabase RLS

### Certificati medici
- Tipi: `agonistico` | `non_agonistico`
- Campi: `issue_date`, `expiry_date`, `file_url`, `is_valid`
- File caricati su Supabase Storage con URL firmati

### Match / Cerco Partita
- Stato richiesta: `open` | `matched` | `cancelled` | `expired`
- Le sfide scadute vengono filtrate dalla bacheca
- Tipi: `singolare` | `doppio`
- Livelli: `principiante` | `intermedio` | `avanzato` | `agonista`

### Prenotazioni per terzi (ThirdPartyBooking)
- Campi aggiuntivi: `booked_for_first_name`, `booked_for_last_name`
- NON soggette al limite settimanale dell'utente prenotante
- **Limite:** max 1 prenotazione conto terzi per utente per settimana (Lun-Dom) — gli admin sono esenti

---

## 7. DATABASE — TABELLE PRINCIPALI

| Tabella | Descrizione |
|---|---|
| `profiles` | Dati utente (full_name, phone, is_admin, approved, status, skill_level, consensi GDPR) |
| `reservations` | Prenotazioni campi (court_id, user_id, starts_at, ends_at, status, booking_type, notes) |
| `courts` | Campi da tennis (id, name, surface, is_active) |
| `match_requests` | Richieste cerco partita |
| `medical_certificates` | Certificati medici utenti |

**Tipi TypeScript** centralizzati in `src/types/supabase.ts` — aggiungere sempre qui i nuovi tipi, non definirli inline.

---

## 8. DIPENDENZE INSTALLATE (NON installare duplicati)

- `react` 18, `react-dom`, `react-router-dom` v6
- `@supabase/supabase-js` v2
- `@tanstack/react-query` v5
- `date-fns` v3 + locale `it` — usare SEMPRE per date/ore
- `lucide-react` — usare SEMPRE per icone
- `shadcn/ui` (tutti i componenti gia' installati in `src/components/ui/`)
- `react-hook-form` + `zod` + `@hookform/resolvers` — per form con validazione
- `recharts` — per grafici statistiche
- `sonner` — per toast (via `src/components/ui/sonner.tsx`)
- `tailwind-merge` + `clsx` + `cn()` — usare `cn()` da `@/lib/utils` per classi condizionali

---

## 9. PROTOCOLLO MODIFICHE — REGOLE OPERATIVE

### Regola 1 — Prima leggi, poi scrivi
SEMPRE leggere il file esistente prima di modificarlo. Non fare assunzioni sul contenuto.

### Regola 2 — Preservazione del lavoro esistente
- NON rimuovere funzionalita' gia' implementate
- NON cambiare la struttura delle route senza conferma esplicita
- NON alterare la logica di business gia' esistente (limiti settimanali, orari, tipi prenotazione, ecc.)
- NON modificare i file in `src/components/ui/` (shadcn/ui)
- NON toccare `src/integrations/supabase/client.ts` senza motivo specifico

### Regola 3 — Coerenza stilistica obbligatoria
Qualsiasi nuova pagina o componente DEVE:
- Usare `bg-[#F8FAFC]` come sfondo pagina
- Includere `UserNav` nell'header
- Usare le card con `rounded-[1.5rem]` o `rounded-[2rem]` e shadow standard
- Usare `text-primary` per colori principali (verde club)
- Usare `text-club-orange` per accenti admin/secondari
- Seguire il pattern header con back button + titolo + UserNav
- Includere `Footer` nelle pagine principali (dashboard, admin)
- Usare `cn()` per classi condizionali, MAI concatenazione stringa

### Regola 4 — Modifiche disruptive
Prima di qualsiasi modifica che:
- Cambi il layout principale di una pagina esistente
- Rimuova o sposti elementi UI visibili
- Alteri la logica di routing
- Modifichi la logica dei limiti di prenotazione
- Cambi il comportamento del flusso di autenticazione

**FARE SEMPRE:**
1. Avvisare esplicitamente l'utente della natura disruptiva
2. Descrivere esattamente cosa cambiera' e cosa NON cambiera'
3. Chiedere conferma prima di procedere
4. Proporre l'approccio meno invasivo possibile

### Regola 5 — Minimalismo degli interventi
- Modificare solo i file strettamente necessari
- Non refactorare codice funzionante non coinvolto nella richiesta
- Non aggiungere funzionalita' non richieste
- Non cambiare naming di variabili/funzioni esistenti senza motivo
- Non aggiungere commenti o docstring a codice non modificato

---

## 10. PROTOCOLLO BACKUP

Prima di ogni modifica significativa (cambio layout, refactor, nuove pagine complesse):

### Creare un backup del file modificato
```bash
cp src/pages/NomePagina.tsx src/pages/NomePagina.tsx.bak
```

### Oppure usare git per avere un punto di ripristino
```bash
git stash         # salva modifiche in corso
git stash pop     # ripristina se qualcosa va storto
```

### In caso di disastro — ripristino da git
```bash
# Ripristinare un singolo file all'ultimo commit
git checkout HEAD -- src/pages/NomePagina.tsx

# Ripristinare tutto lo stato dell'ultimo commit (ATTENZIONE: perde tutto il non-committato)
git reset --hard HEAD
```

### Commit di sicurezza prima di interventi rischiosi
Quando si sta per fare un intervento complesso, suggerire all'utente di committare lo stato attuale:
```bash
git add -A && git commit -m "Backup pre-intervento: [descrizione modifica imminente]"
```

---

## 11. CHECKLIST PRE-MODIFICA

Prima di implementare qualsiasi cambiamento, verificare mentalmente:

- [ ] Ho letto il/i file che devo modificare?
- [ ] La modifica e' coerente con la palette colori (verde primary, arancione accent)?
- [ ] Il border-radius e' allineato allo stile esistente (1.5rem / 2rem)?
- [ ] Le shadow sono quelle standard del design system?
- [ ] Ho incluso `UserNav` se e' una pagina con header?
- [ ] Ho usato `showSuccess`/`showError` per i feedback utente?
- [ ] Ho usato `date-fns` per manipolazioni di date?
- [ ] Ho usato `cn()` per classi condizionali?
- [ ] Ho aggiunto i nuovi tipi in `src/types/supabase.ts`?
- [ ] La modifica preserva tutte le funzionalita' esistenti?
- [ ] E' una modifica disruptiva che richiede conferma utente?

---

## 12. CHECKLIST POST-MODIFICA

Dopo ogni modifica, verificare:

- [ ] Il codice TypeScript e' type-safe (nessun `any` non necessario)?
- [ ] Non ho rimosso import usati da altre parti del file?
- [ ] Non ho introdotto nomi duplicati o conflitti?
- [ ] Lo stile visivo e' coerente con il resto dell'app?
- [ ] La logica di business e' intatta (limiti prenotazione, ruoli, ecc.)?

---

## 13. NOTE SPECIFICHE SULL'APP

- La lingua dell'interfaccia e' **italiano** — tutti i testi visibili all'utente DEVONO essere in italiano
- I messaggi di errore/successo devono essere chiari e in italiano
- Il club si chiama "ASD Tennis Club Monti della Tolfa", il sito si chiama "Canepacce" (nome della localita')
- Non usare terminologia tecnica nei messaggi utente
- I campi da tennis sono identificati da `id` numerico e `name` testuale
- Supabase Realtime e' attivo per aggiornamenti live (es. dashboard admin conta approvazioni)
- L'autenticazione usa Supabase Auth con verifica email
- I redirect post-login/logout sono gestiti da `AuthLayout.tsx`
