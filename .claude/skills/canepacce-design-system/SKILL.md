---
name: canepacce-design-system
description: Riferimento di design/UX per l'app Prenotazioni Canepacce (ASD Tennis Club Monti della Tolfa). Usa SEMPRE questa skill prima di creare una nuova pagina, un nuovo componente, un nuovo dialog/modal o prima di modificare il layout, i colori, gli stati vuoti/loading o i testi visibili all'utente — anche se la richiesta non nomina esplicitamente "design system" o "stile". Copre filosofia estetica, palette e significato dei colori, tipografia, spaziature/radius/shadow, motion e micro-interazioni, pattern standard (header, card, empty state, loading, form), tono di voce italiano, accessibilità e una checklist di coerenza con esempi di codice reali del progetto (AdminDashboard.tsx, BookingCalendar.tsx, ThirdPartyBooking.tsx, UserNav.tsx, Footer.tsx, BookingLimitsBox.tsx). Consultala anche per piccoli dettagli come "che rounded uso qui", "che colore per questo badge", "come faccio un empty state coerente".
---

# Il Design System di Canepacce — note di un design lead

Non sto scrivendo uno stile guide come tanti: sto scrivendo il modo in cui *penso* questa
app ogni volta che apro un nuovo file. Canepacce non è un gestionale. È un circolo — con
un cancello, un bar, un profumo di terra rossa bagnata la mattina presto. L'app deve
somigliare a quella sensazione: ordinata, calda, un po' esclusiva ma mai fredda. Se una
schermata sembra "aziendale" o "da SaaS B2B generico", ho sbagliato qualcosa.

Tieni questo file aperto mentre lavori. Non è teoria: ogni pattern qui sotto è preso da un
file reale del progetto, con percorso e numero di riga indicativo, così puoi copiarlo
invece di reinventarlo.

## 1. Filosofia: premium, caldo, esclusivo-ma-accogliente

Tre parole guidano ogni scelta:

- **Premium** — bordi larghi (`rounded-[1.5rem]`/`rounded-[2rem]`), ombre morbide mai
  dure, gradienti sottili sui bottoni primari, transizioni fluide su tutto (`transition-all
  duration-300 ease-out` è applicato globalmente in `src/globals.css`, quindi non serve
  quasi mai aggiungerlo manualmente — arriva "gratis").
- **Caldo** — verde bosco (non verde tennis acceso) e arancione terracotta, mai colori
  saturi da app consumer. Il bianco di sfondo (`#F8FAFC`) è leggermente freddo apposta,
  per far risaltare il verde e l'arancione come accenti caldi che "respirano" sulla pagina.
- **Esclusivo ma accogliente** — l'esclusività si vede nella cura dei dettagli (radius
  coerenti, spaziatura generosa, iconografia coerente), non in barriere o freddezza. I
  testi sono sempre cordiali, mai burocratici. Un socio che sbaglia un orario deve sentirsi
  guidato, non redarguito.

Il test che mi faccio sempre: *"Se stampassi questa schermata e la mettessi in bacheca al
circolo, i soci penserebbero che è fatta bene o che è un modulo della ASL?"* Se la risposta
non è la prima, si rifà.

## 2. Palette colori — e perché esistono

Definita in `src/globals.css` (CSS variables HSL) e mappata in `tailwind.config.ts`:

```css
--primary: 138 41% 30%;        /* Verde Club — #2E6B3D */
--secondary: 138 41% 97%;      /* Verde chiarissimo, quasi bianco */
--accent: 23 72% 50%;          /* Arancione Club — #D96B27 */
--background: 0 0% 100%;
--muted: 210 40% 96.1%;
--muted-foreground: 215.4 16.3% 46.9%;
--destructive: 0 84.2% 60.2%;
--radius: 1rem;
```

Il **verde** (`text-primary`/`bg-primary`/`border-primary`) è il colore dell'azione
principale e della fiducia: bottoni di conferma, badge "socio", accenti sulle card
"utente". È il colore del campo in erba sintetica e del logo del club — chi lo vede deve
riconoscere il club, non un'app qualsiasi.

L'**arancione** (`text-club-orange`/`bg-club-orange`, definito a parte in
`tailwind.config.ts` come colore custom, non solo via CSS variable `--accent`) è
riservato a due usi specifici e NON va sparso a caso:
1. Tutto ciò che è **amministrazione** (label "Amministrazione" uppercase in ogni header
   admin, icone nelle card di `AdminDashboard.tsx`, bordo superiore delle card admin).
2. **Avvisi/dettagli secondari non urgenti** (icone informative dentro le card, es.
   `<Info className="text-club-orange" />` in `BookingLimitsBox.tsx`).

Il **rosso** (`--destructive`) è riservato esclusivamente a: errori, azioni distruttive
(cancella, annulla, blocca), stati "urgente" (badge conteggio approvazioni pendenti in
`AdminDashboard.tsx`), slot occupati nel calendario. Non usarlo mai per enfasi generica.

Lo sfondo pagina `bg-[#F8FAFC]` (quasi bianco, tono freddo) è una scelta deliberata: fa
risaltare le card bianche pure (`bg-white`) creando una separazione visiva morbida senza
bordi netti — è il motivo per cui le card hanno solo `shadow-[0_2px_12px_rgba(0,0,0,0.06)]`
e non un bordo. Se aggiungi un bordo scuro a una card stai combattendo contro questa scelta.

**Colori di stato semantici** (visti in `AdminBulkBooking.tsx`, `AdminApprovals.tsx`,
`FindMatch.tsx`): verde chiaro `bg-green-100 text-green-700` per "disponibile/aperto",
rosso chiaro `bg-red-100 text-red-700` per "pieno/occupato", ambra `bg-amber-50
border-amber-200 text-amber-800` per avvisi non bloccanti (es. il banner del torneo in
`BookingCalendar.tsx`). Questi non sostituiscono primary/accent/destructive: sono usati
solo dentro badge/banner contestuali, mai come colore dominante di una pagina.

## 3. Tipografia — gerarchia e perché

```
Titolo pagina:            text-3xl / text-4xl font-extrabold text-gray-900 tracking-tighter
Sottotitolo sezione:      text-sm font-bold text-primary uppercase tracking-[0.2em]
Sottotitolo admin:        text-sm font-bold text-club-orange uppercase tracking-[0.2em]
Label campo form:         text-xs font-black text-gray-400 uppercase tracking-[0.2em]
Descrizione card:         text-gray-500 text-sm leading-relaxed
Badge/chip:               text-[9px] font-black uppercase tracking-tighter
```

Il `tracking-tighter` sui titoli grandi e il `tracking-[0.2em]` (molto largo) sulle label
uppercase non è un caso: è un contrasto tipografico deliberato. I titoli si stringono per
sembrare "scolpiti" e importanti; le label si allargano per sembrare eleganti come
un'etichetta di un prodotto premium (pensa alle scritte sulle racchette da tennis di fascia
alta). Se usi `tracking-wide` ovunque senza questo contrasto, la gerarchia si appiattisce.

`text-gray-400` è riservato alle label uppercase (rumore di sfondo intenzionale),
`text-gray-500` alle descrizioni leggibili, `text-gray-900` ai titoli. Non invertire questi
due ultimi: un titolo in `gray-500` sembra disabilitato, non elegante.

## 4. Spaziature, Radius, Shadow

**Radius** — la scala è a tre livelli, non improvvisare valori intermedi:
- `rounded-[1.5rem]` / `rounded-[2rem]` → card principali, contenitori di sezione
- `rounded-xl` / `rounded-2xl` → bottoni, input, pill di slot orari, icon-box
- `rounded-full` → avatar, pillole di tipologia partita (singolare/doppio/lezione)

`--radius: 1rem` nel CSS è il default di shadcn/ui (usato da `rounded-lg`/`rounded-md`
generati dai componenti base), ma nelle pagine custom si esagera deliberatamente verso
`1.5rem`/`2rem` per l'effetto "premium" — è una scelta specifica del progetto, non lasciare
che i default di shadcn/ui restino invariati in una card fatta a mano.

**Shadow** — solo due varianti, mai `shadow-md`/`shadow-lg`/`shadow-xl` di Tailwind
default sulle card:
```
Card a riposo:  shadow-[0_2px_12px_rgba(0,0,0,0.06)]
Card on hover:  shadow-[0_8px_30px_rgba(0,0,0,0.08)]
```
Sono definite anche come variabili in `globals.css` (`--shadow-premium`, `--shadow-hover`)
usate dalla classe utility `.premium-card`. La logica: un'ombra "vera" a riposo sarebbe
troppo pesante per uno sfondo già quasi-bianco; l'ombra si intensifica solo all'hover per
dare feedback di interattività, mai come decorazione statica.

**Spaziatura pagina** — il contenitore standard è sempre:
```tsx
<div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
```
con contenuto centrato `max-w-7xl mx-auto`. Non stringere il padding su desktop: la
generosità di spazio è parte della sensazione "premium".

## 5. Motion e micro-interazioni

Ogni interazione ha un feedback fisico, mai istantaneo e mai brusco:

```
Hover card:            hover:-translate-y-2               (la card "si solleva")
Hover bottone primario: hover:scale-[1.01] / hover:scale-[1.02]
Active bottone:        active:scale-[0.97] / active:scale-[0.98]  (si "schiaccia" al click)
Back button:           hover:scale-110 active:scale-95
Ingresso contenuto:    animate-in fade-in slide-in-from-top-2 / slide-in-from-bottom-4
Spinner:               w-10/12 h-10/12 border-4 border-primary/20 border-t-primary
                       rounded-full animate-spin
Badge urgente:         animate-pulse
```

Il principio: **ogni elemento cliccabile deve rispondere sia all'hover (anticipazione) sia
all'active (conferma tattile)**. Guarda `AdminDashboard.tsx` righe ~212 e ~237-243: la card
si solleva all'hover (`hover:-translate-y-2`), il bottone dentro si scala leggermente
all'hover e si schiaccia all'active. Se aggiungi un bottone senza `active:scale-*`, sembra
"morto" al tocco anche se funziona.

Le liste che appaiono dinamicamente (slot orari filtrati, righe di un form) usano
`animate-in fade-in slide-in-from-bottom-4` — vedi la griglia slot in
`BookingCalendar.tsx` riga ~381 e la sezione "tipologia partita" in `ThirdPartyBooking.tsx`
riga ~343: appaiono con un leggero movimento dal basso, non con uno scatto.

## 6. Pattern di layout — copia questi, non reinventarli

### Header pagina standard (con back button + titolo + UserNav)

Preso da `BookingCalendar.tsx` / `ThirdPartyBooking.tsx`:
```tsx
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
```

Variante con sottotitolo uppercase (usata nelle pagine admin e nella dashboard socio, es.
`AdminDashboard.tsx` righe 193-206, `AdminBulkBooking.tsx` righe 312-325):
```tsx
<div className="flex items-center gap-6">
  <Link to="/admin">
    <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
      <ArrowLeft className="h-5 w-5" />
    </Button>
  </Link>
  <div>
    <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Amministrazione</p>
    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Titolo Sezione</h1>
  </div>
</div>
```
Usa `text-primary` invece di `text-club-orange` sul sottotitolo se la pagina è lato socio,
non admin (vedi `FindMatch.tsx` riga 187: "Matchmaking" in `text-primary`).

**`UserNav` deve comparire in OGNI header** — è l'unico punto di accesso a profilo, storico
prenotazioni, pannello admin (se `is_admin`) e logout (`src/components/UserNav.tsx`). Non
duplicare mai questa logica in una pagina nuova.

### Layout con Footer (dashboard, pagine principali)

```tsx
<div className="min-h-screen flex flex-col bg-[#F8FAFC]">
  <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
    {/* contenuto */}
  </div>
  <Footer />
</div>
```
`Footer` (`src/components/Footer.tsx`) porta i dati legali del club (indirizzo, CF, email)
— va incluso nelle pagine "di destinazione" (dashboard, bacheca sfide, gestione torneo),
non nelle pagine di flusso stretto come i form di booking a schermo intero, dove
distrarrebbe dall'azione principale.

### Card standard con accent bar

Pattern completo da `AdminDashboard.tsx` righe 212-246:
```tsx
<Card className="group relative border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-[1.5rem] transition-all duration-500 overflow-hidden bg-white hover:-translate-y-2">
  <div className="h-1.5 w-full bg-primary"></div> {/* barra colorata in cima: bg-club-orange per sezioni admin/warning */}
  <CardHeader className="pb-2">
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2 bg-primary/10 text-primary">
      <Icon size={24} />
    </div>
    <CardTitle className="text-xl font-bold tracking-tight text-gray-900">Titolo</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-gray-500 text-sm mb-6 leading-relaxed">Descrizione</p>
    <Button className="w-full h-12 rounded-xl font-bold flex items-center justify-between px-5 bg-white border-2 border-gray-100 text-gray-700 hover:border-primary/20 hover:bg-primary/5 hover:text-primary" variant="outline">
      Azione <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
    </Button>
  </CardContent>
</Card>
```
Nota il dettaglio `group` sulla Card + `group-hover:translate-x-1` sulla freccia dentro il
bottone: la freccia "scivola" in avanti quando passi sopra l'intera card, non solo sul
bottone. È un dettaglio piccolo ma è esattamente il tipo di rifinitura che rende l'app
"premium" invece che "a posto".

Quando la card rappresenta uno stato urgente/attivo (es. richieste pendenti, torneo
attivo), la barra e l'icon-box cambiano colore (`bg-destructive`/`bg-amber-400` invece di
`bg-primary`) e compare un badge pulsante (`animate-pulse`) — vedi `AdminDashboard.tsx`
righe 213-228 per il pattern badge urgente vs badge torneo.

### Bottone primario (azione principale della pagina)

```tsx
<Button className="w-full h-16 rounded-[1.5rem] font-black text-xl shadow-xl bg-gradient-to-br from-primary to-[#23532f] text-white hover:scale-[1.01] active:scale-[0.98] shadow-primary/20">
  Testo Azione <ChevronRight size={24} />
</Button>
```
Il gradiente `from-primary to-[#23532f]` (un verde leggermente più scuro) dà profondità
senza sembrare piatto. Questo bottone è sempre grande (`h-16`), pesante (`font-black
text-xl`) e con ombra colorata (`shadow-primary/20`, non un grigio generico) — deve essere
inequivocabilmente L'azione della schermata. Una pagina non dovrebbe avere due bottoni con
questo stile in competizione visiva.

### Bottone secondario (outline)

```tsx
<Button variant="outline" className="w-full h-12 rounded-xl font-bold border-2 border-gray-100 text-gray-700 hover:border-primary/20 hover:bg-primary/5 hover:text-primary flex items-center justify-between px-5">
  Testo <ChevronRight size={18} />
</Button>
```

### Loading a schermo intero

```tsx
<div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
  <div className="flex flex-col items-center">
    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    <p className="mt-4 text-gray-500 font-medium">Caricamento...</p>
  </div>
</div>
```
Versione compatta senza testo, usata quando lo spinner sta dentro un contenitore piccolo
(es. `AdminBulkBooking.tsx` riga 302-305): stesso spinner, senza il paragrafo sotto.

### Skeleton (loading parziale, dentro una pagina già visibile)

```tsx
<Skeleton className="h-12 w-64" />
<Skeleton className="h-64 w-full rounded-[1.5rem]" />
```
Preferisci lo skeleton al posto dello spinner a schermo intero quando solo *parte* della
pagina sta caricando (es. header già renderizzato, griglia di card ancora in fetch) — vedi
`AdminDashboard.tsx` righe 108-124.

### Stato vuoto (empty state)

```tsx
<div className="flex flex-col items-center justify-center py-20 px-6 bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100 text-gray-400">
  <Icon className="h-10 w-10 mb-4 opacity-20" />
  <p className="text-sm font-bold uppercase tracking-widest text-center">Messaggio stato vuoto</p>
</div>
```
Bordo tratteggiato (`border-dashed`) e icona molto sbiadita (`opacity-20`): comunica "qui
non c'è ancora nulla, ma non è un errore" senza allarmare. Variante più narrativa a due
righe con sotto-testo (usata in `FindMatch.tsx` righe 206-210):
```tsx
<div className="col-span-full text-center py-24 bg-white/50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
  <Users className="mx-auto h-16 w-16 mb-4 text-gray-200" />
  <p className="text-xl font-black text-gray-900 tracking-tight">Nessuna sfida attiva</p>
  <p className="text-gray-500 font-medium mt-2">Sii il primo a rompere il ghiaccio!</p>
</div>
```
Nota il tono: "Sii il primo a rompere il ghiaccio!" non "Nessun dato disponibile". Questo è
il cuore del tono di voce (vedi sezione 7).

### Form — griglia campi e select

I form usano sempre `Label` in `text-sm font-semibold ml-1 text-gray-700` (form
amministrativi compatti, es. `AdminBulkBooking.tsx`) oppure `text-xs font-black
text-gray-400 uppercase tracking-[0.2em] ml-1` (form utente più "editoriali", es.
`ThirdPartyBooking.tsx`, `FindMatch.tsx`). La prima variante è più discreta/gestionale, la
seconda più "da esperienza premium" — scegli in base al contesto (form admin di servizio
vs. form utente-facing).

Input e Select hanno sempre `rounded-xl`/`rounded-2xl` e altezza generosa quando sono
"protagonisti" della schermata (`h-14` in `ThirdPartyBooking.tsx`), più compatti (`h-12`)
nei form amministrativi densi. Mai lasciare l'altezza di default di shadcn/ui in una
schermata protagonista.

### Griglia slot orari / pillole di selezione

Pattern ricorrente in `BookingCalendar.tsx`, `ThirdPartyBooking.tsx`,
`AdminBulkBooking.tsx`: bottoni quadrati/rettangolari con `rounded-2xl`, tre stati visivi
netti (selezionato = `bg-primary` pieno, disponibile = `bg-gray-50` neutro con hover
bordato, occupato = `bg-red-500`/`opacity-40 cursor-not-allowed` a seconda che si voglia
mostrare "chi occupa" o solo "non disponibile"). Le pillole di tipologia (singolare/doppio/
lezione) usano invece `rounded-full` con bordo colorato — la forma diversa (quadrata vs
pillola) è intenzionale: comunica "questa è una griglia di slot" vs "questa è una scelta
singola tra opzioni".

## 7. Tono di voce dei testi (italiano)

Sempre italiano, sempre cordiale ma professionale — mai burocratico, mai eccessivamente
giocoso. Alcuni esempi reali presi dal codice, buoni da imitare:

- "Sii il primo a rompere il ghiaccio!" (empty state bacheca sfide)
- "Nessun limite settimanale né di durata — puoi prenotare senza restrizioni." (badge
  admin in `BookingLimitsBox.tsx`) — diretto, chiaro, senza gergo tecnico.
- "Alcuni slot sono già occupati. Nessuna prenotazione è stata creata. Contatta gli
  utenti indicati per liberare gli slot, poi riprova." (`AdminBulkBooking.tsx`) — spiega
  cosa è successo, cosa NON è successo (nessun insert parziale), e cosa fare dopo.
- "Hai già una prenotazione in corso. Potrai prenotarne un'altra quando questa si sarà
  conclusa." (`bookingLimits.ts`) — spiega la regola E quando si sblocca, non solo il
  divieto.

Regole pratiche:
- Mai `alert()` o testi tecnici in console visibili all'utente: sempre `showSuccess()` /
  `showError()` da `@/utils/toast`.
- I messaggi di errore spiegano sempre **perché** e, se possibile, **quando/come
  risolvere** — non un secco "Errore" o "Operazione non consentita".
- Evita termini tecnici (non "constraint", non "record", non "query"): parla di
  "prenotazione", "slot", "socio", "campo".
- I titoli di conferma/errore nei dialog sono brevi e diretti ("Impossibile completare la
  prenotazione"), le descrizioni sotto spiegano il dettaglio.
- Va bene un tono leggermente caloroso nei micro-testi (empty state, success dialog), ma
  resta sobrio nei testi legali/certificati/admin.

## 8. Accessibilità

- I componenti shadcn/ui (`src/components/ui/`) portano già gestione focus/aria di base
  via Radix — **non aggirarli** con `<div onClick>` al posto di `<Button>`/`<button>`
  quando l'elemento è interattivo.
- Mantieni sempre un contrasto sufficiente: `text-gray-400` va bene per label secondarie
  su sfondo bianco, ma non usarlo per testo informativo importante — usa almeno
  `text-gray-500`/`text-gray-700`.
- Le icone usate come unico indicatore di stato (es. `AlertTriangle` per slot a rischio
  torneo in `BookingCalendar.tsx`) devono sempre avere un testo/tooltip di supporto vicino
  o nel banner collegato — non affidarti solo al colore o solo all'icona per comunicare
  uno stato critico (occupato, a rischio, urgente).
- I bottoni disabilitati vanno sempre marcati con `disabled` reale (non solo stile
  grigio), così screen reader e keyboard nav si comportano correttamente — pattern visto
  ovunque: `disabled={saving || ...}` con classi `disabled:opacity-40
  disabled:cursor-not-allowed`.
- Il focus ring verde (`focus:ring-primary/20`) definito su input/premium-input va
  preservato: non rimuovere mai `focus-visible:outline` senza sostituirlo con un
  equivalente visibile.

## 9. Checklist — "è coerente con il resto dell'app?"

Prima di considerare completa una nuova schermata o componente, verifica:

- [ ] Sfondo pagina `bg-[#F8FAFC]`, contenuto in `max-w-7xl mx-auto`, padding
      `p-6 sm:p-10 lg:p-12`?
- [ ] Header con back button (icona `ArrowLeft`, `rounded-2xl` bianco) + titolo + `UserNav`?
- [ ] Se è una pagina "di destinazione" (non un flusso stretto): `Footer` incluso?
- [ ] Card con `rounded-[1.5rem]`/`rounded-[2rem]`, `border-none`, shadow standard
      (`shadow-[0_2px_12px_rgba(0,0,0,0.06)]` a riposo)?
- [ ] Colore principale `text-primary`/`bg-primary` (verde) per l'esperienza utente,
      `text-club-orange`/`bg-club-orange` riservato a contesto admin o dettagli secondari?
- [ ] Bottone principale della pagina usa il pattern gradiente verde
      (`from-primary to-[#23532f]`), grande, con `hover:scale`/`active:scale`?
- [ ] Loading gestito con spinner a schermo intero (pagina intera) o `Skeleton`
      (sezione parziale) — mai un semplice "Caricamento..." nudo?
- [ ] Stato vuoto con bordo tratteggiato + icona sbiadita + testo in tono cordiale, non
      un messaggio secco?
- [ ] Tutti i feedback utente passano da `showSuccess`/`showError`, mai `alert()`?
- [ ] Testi in italiano, cordiali, che spiegano il "perché" e il "come procedere" negli
      errori?
- [ ] `cn()` da `@/lib/utils` per classi condizionali, mai concatenazione di stringhe?
- [ ] Animazioni di ingresso (`animate-in fade-in slide-in-from-*`) su contenuti che
      appaiono dinamicamente (es. dopo una selezione)?
- [ ] Nessuna modifica ai file in `src/components/ui/` (shadcn/ui) per ottenere l'effetto
      desiderato — se serve uno stile diverso, si applica via `className`, non editando il
      componente base?

Se una nuova schermata risponde "sì" a tutti questi punti, è coerente. Se stai per
rispondere "no" a due o più, fermati e rivedi prima di procedere — è il segnale che la
schermata rischia di sembrare "un'altra app" infilata dentro Canepacce.
